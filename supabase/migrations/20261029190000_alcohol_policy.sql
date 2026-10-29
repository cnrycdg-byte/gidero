-- Alkollü içki kuralı: her şirket baştan seçer, muhasebeci fiş bazında değiştirebilir.
--   reject  : ödenmez, gider yazılmaz
--   kkeg    : çalışana ödenir, kanunen kabul edilmeyen gider (689) yazılır, KDV indirilmez (varsayılan)
--   expense : ödenir, normal gider yazılır
--   manual  : muhasebe her fişte karar verir
-- "Temsil ve ağırlama" grubundaki fişlerde alkol, kural ne olursa olsun normal gider sayılır (reject hariç).

alter table public.companies add column alcohol_policy text not null default 'kkeg'
  check (alcohol_policy in ('reject', 'kkeg', 'expense', 'manual'));

alter table public.expenses drop constraint if exists expenses_alcohol_decision_check;
alter table public.expenses add constraint expenses_alcohol_decision_check
  check (alcohol_decision in ('accepted', 'rejected', 'kkeg'));

create or replace function private.alcohol_auto_decision(p_company uuid, p_category uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when c.alcohol_policy = 'reject' then 'rejected'
    when k.tax_rule = 'representation' then 'accepted'
    when c.alcohol_policy = 'kkeg' then 'kkeg'
    when c.alcohol_policy = 'expense' then 'accepted'
    else null end
  from public.companies c
  left join public.categories k on k.id = p_category and k.company_id = c.id
  where c.id = p_company;
$$;

-- Muhasebe elle karar vermediyse (decided_by boş) karar şirket kuralından gelir; gider grubu değişince yenilenir
create or replace function private.expenses_alcohol_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not new.alcohol_present then
    new.alcohol_decision := null;
    new.alcohol_decided_by := null;
    new.alcohol_decided_at := null;
  elsif new.alcohol_decided_by is null then
    new.alcohol_decision := private.alcohol_auto_decision(new.company_id, new.category_id);
    new.alcohol_decided_at := case when new.alcohol_decision is null then null else coalesce(new.alcohol_decided_at, now()) end;
  end if;
  return new;
end;
$$;
create trigger expenses_alcohol_policy before insert or update on public.expenses
  for each row execute function private.expenses_alcohol_policy();

create or replace function public.set_alcohol_policy(p_company uuid, p_policy text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if not private.has_any_role(p_company, array['admin', 'accountant']) then
    raise exception 'Alkol kuralını şirket yöneticisi ya da muhasebeci değiştirebilir.' using errcode = '42501';
  end if;
  if p_policy not in ('reject', 'kkeg', 'expense', 'manual') then
    raise exception 'Geçersiz alkol kuralı.' using errcode = '22023';
  end if;
  select alcohol_policy into v_old from public.companies where id = p_company for update;
  update public.companies set alcohol_policy = p_policy where id = p_company;
  insert into public.audit_log (company_id, table_name, row_id, action, old_data, new_data, actor_user_id)
  values (p_company, 'companies', p_company, 'alcohol_policy',
          jsonb_build_object('alcohol_policy', v_old), jsonb_build_object('alcohol_policy', p_policy), (select auth.uid()));
  -- Henüz aktarılmamış ve elle karar verilmemiş fişler yeni kurala geçer
  create temp table if not exists _alc_changed (id uuid) on commit drop;
  delete from _alc_changed;
  with u as (
    update public.expenses e set alcohol_decided_at = null
     where e.company_id = p_company and e.alcohol_present and e.alcohol_decided_by is null
       and exists (select 1 from public.reports r where r.id = e.report_id and r.status not in ('exported', 'paid'))
    returning e.id
  ) insert into _alc_changed select id from u;
  -- Fişteki alkol notu yeni kurala göre yazılır
  delete from public.expense_flags f using _alc_changed x where f.expense_id = x.id and f.code in ('alcohol', 'alcohol_decided');
  insert into public.expense_flags (expense_id, company_id, code, severity, message)
  select e.id, e.company_id,
         case when e.alcohol_decision is null then 'alcohol' else 'alcohol_decided' end,
         case when e.alcohol_decision is null or e.alcohol_decision = 'rejected' then 'warning' else 'info' end,
         'Fişte alkollü içki var: ' || private.tl(coalesce(e.alcohol_amount, 0)) || '. ' ||
         case e.alcohol_decision
           when 'kkeg' then 'Şirket kuralına göre size ödenir; vergiden düşülmeyen gider (KKEG) olarak yazılır.'
           when 'accepted' then 'Şirket kuralına göre normal gider yazılır.'
           when 'rejected' then 'Şirket kuralına göre bu tutar size ödenmez ve gider yazılmaz.'
           else 'Muhasebe karar verene kadar rapor aktarılmaz; reddedilirse bu tutar size ödenmez.' end
    from public.expenses e join _alc_changed x on x.id = e.id;
end;
$$;
revoke all on function public.set_alcohol_policy(uuid, text) from public, anon;
grant execute on function public.set_alcohol_policy(uuid, text) to authenticated;

create or replace function public.alcohol_policy(p_company uuid)
returns text language sql stable security definer set search_path = '' as $$
  select c.alcohol_policy from public.companies c where c.id = p_company and private.is_member(p_company);
$$;
revoke all on function public.alcohol_policy(uuid) from public, anon;
grant execute on function public.alcohol_policy(uuid) to authenticated;

-- Muhasebe kararı: normal gider, KKEG ya da ret
create or replace function public.decide_alcohol(p_expense uuid, p_decision text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare e public.expenses; r public.reports; v_me uuid := (select auth.uid());
begin
  if p_decision not in ('accepted', 'rejected', 'kkeg') then
    raise exception 'Kararı seçin: normal gider, KKEG ya da ret.' using errcode = '22023';
  end if;
  select * into e from public.expenses where id = p_expense for update;
  if not found then raise exception 'Fiş bulunamadı.' using errcode = 'P0002'; end if;
  if not private.has_any_role(e.company_id, array['accountant']) then
    raise exception 'Alkol kararını yalnızca muhasebe verebilir.' using errcode = '42501';
  end if;
  if not e.alcohol_present then raise exception 'Bu fişte alkollü içki yok.' using errcode = 'P0001'; end if;
  select * into r from public.reports where id = e.report_id;
  if r.owner_user_id = v_me and not (private.bureau_managed(r.company_id) and private.is_company_bureau_staff(r.company_id)) then
    raise exception 'Kendi fişiniz için karar veremezsiniz; başka bir muhasebeci karar vermeli.' using errcode = '42501';
  end if;
  if r.status in ('exported', 'paid') then
    raise exception 'Aktarılmış ya da ödenmiş raporda karar değiştirilemez.' using errcode = 'P0001';
  end if;
  update public.expenses
     set alcohol_decision = p_decision, alcohol_decided_by = v_me, alcohol_decided_at = now()
   where id = p_expense;
  delete from public.expense_flags where expense_id = p_expense and code in ('alcohol', 'alcohol_decided');
  insert into public.expense_flags (expense_id, company_id, code, severity, message)
  values (p_expense, e.company_id, 'alcohol_decided', 'info',
          case p_decision
            when 'accepted' then 'Alkollü içki muhasebe kararıyla normal gider yazılır.'
            when 'kkeg' then 'Alkollü içki muhasebe kararıyla kanunen kabul edilmeyen gider (KKEG) yazılır; tutar size ödenir.'
            else 'Alkollü içki muhasebe tarafından reddedildi: ' || private.tl(coalesce(e.alcohol_amount, 0)) ||
                 ' ödenmez ve gider yazılmaz.' end);
end;
$$;
