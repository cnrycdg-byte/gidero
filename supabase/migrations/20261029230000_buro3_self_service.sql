-- 3 firmalık büro paketi (fiyat sonra yönetim panelinden güncellenecek)
insert into public.plans (id, kind, name, description, unit, price_monthly, price_yearly_monthly, min_seats, max_companies, users_per_company, features, sort)
values ('buro_3', 'bureau', 'Büro 3', '3 müşteri firmaya kadar', 'account', 590, 490, 1, 3, 3,
        '["3 müşteri firma","Firma başı 3 çalışan","Büro personeli sınırsız"]', 35)
on conflict (id) do nothing;

-- Büro, müşteri firmasına kendi girişini açar ya da kapatır.
-- Açıkken firma kendi fişlerini girer, kendi onay zincirini kullanır, kendi giderlerini görür; muhasebe büroda kalır.
create or replace function public.bureau_set_self_service(p_company uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_bureau uuid; v_old boolean;
begin
  select bureau_account_id, self_service into v_bureau, v_old from public.companies where id = p_company for update;
  if v_bureau is null then raise exception 'Bu firma bir büroya bağlı değil.' using errcode = 'P0001'; end if;
  if not public.can_manage_bureau(v_bureau) and not private.is_platform_admin() then
    raise exception 'Firmaya giriş açmayı yalnızca büro sahibi yapabilir.' using errcode = '42501';
  end if;
  update public.companies set self_service = p_on where id = p_company;
  insert into public.audit_log (company_id, table_name, row_id, action, old_data, new_data, actor_user_id)
  values (p_company, 'companies', p_company, 'self_service',
          jsonb_build_object('self_service', v_old), jsonb_build_object('self_service', p_on), (select auth.uid()));
end;
$$;
revoke all on function public.bureau_set_self_service(uuid, boolean) from public, anon;
grant execute on function public.bureau_set_self_service(uuid, boolean) to authenticated;

-- Firma kendi girişini kullansa da büronun kendi girdiği kayıtlar onaya gitmez, doğrudan kayda alınır
create or replace function public.submit_report(p_report uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reports;
  v_me uuid := (select auth.uid());
  v_flow public.approval_flows;
  v_steps jsonb;
  v_mode text;
begin
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'Rapor bulunamadı' using errcode = 'P0002'; end if;
  if r.status not in ('draft','returned') then
    raise exception 'Bu rapor gönderilemez (durum: %)', r.status using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.expenses e where e.report_id = r.id) then
    raise exception 'Rapor boş; önce en az bir fiş ekleyin' using errcode = 'P0001';
  end if;

  -- Büro personelinin firma adına girdiği ya da muhasebecinin başkası adına girdiği rapor: onaysız kayıt
  if (r.created_by = v_me and r.owner_user_id = v_me and private.is_company_bureau_staff(r.company_id)
        and exists (select 1 from public.companies c where c.id = r.company_id and c.bureau_account_id is not null))
     or (r.created_by = v_me and r.owner_user_id <> v_me
        and private.has_any_role(r.company_id, array['accountant'])) then
    update public.reports set status = 'approved', submitted_at = now(), approved_at = now(),
                              flow_snapshot = '[]'::jsonb, current_step = null, current_approver_ids = '{}'
     where id = r.id;
    insert into public.approval_actions (report_id, company_id, actor_user_id, action)
    values (r.id, r.company_id, v_me, 'booked_without_approval');
    return 'approved';
  end if;

  if r.owner_user_id <> v_me then
    raise exception 'Raporu yalnızca sahibi gönderebilir' using errcode = '42501';
  end if;

  select c.approval_mode into v_mode from public.companies c where c.id = r.company_id;
  if v_mode = 'steps' then
    select * into v_flow from public.approval_flows f
     where f.company_id = r.company_id and f.active
       and (f.min_total is null or r.total >= f.min_total)
       and (cardinality(f.cost_center_ids) = 0 or r.cost_center_id = any (f.cost_center_ids))
     order by f.priority desc, f.created_at
     limit 1;
    select coalesce(jsonb_agg(to_jsonb(s) order by s.position), '[]'::jsonb) into v_steps
      from public.approval_steps s
     where s.flow_id = v_flow.id and (s.min_total is null or r.total >= s.min_total);
  end if;
  if v_steps is null or jsonb_array_length(v_steps) = 0 then
    v_steps := private.chain_steps(r.company_id, r.owner_user_id);
  end if;
  -- Kimse kendi masrafını onaylayamaz: onaylayacak kimse yoksa kendiliğinden onaylanmaz
  if jsonb_array_length(v_steps) = 0 then
    raise exception 'Raporunuzu onaylayacak kimse yok. Ekip ekranından bir yönetici ya da muhasebeci ekleyin, ya da onay zincirinde sizi birinin altına bağlayın.'
      using errcode = 'P0001';
  end if;

  update public.reports
     set flow_id = v_flow.id, flow_snapshot = v_steps, submitted_at = now()
   where id = r.id;
  insert into public.approval_actions (report_id, company_id, actor_user_id, action)
  values (r.id, r.company_id, v_me, 'submitted');

  perform private.advance_report(r.id, -1);
  return (select status from public.reports where id = r.id);
end;
$$;

-- Fiş kontrolü kuralı: büronun girdiği kayıtlarda büro kendisi kontrol eder
create or replace function private.reports_require_checked()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if old.status in ('draft', 'returned') and new.status in ('pending', 'approved', 'booked')
     and not private.bureau_managed(new.company_id)
     and not exists (select 1 from public.companies c join public.bureau_staff s on s.account_id = c.bureau_account_id
                     where c.id = new.company_id and s.user_id = new.created_by and s.status = 'active') then
    select count(*) into n from public.expenses e where e.report_id = new.id and e.checked_at is null;
    if n > 0 then
      raise exception '% fiş kontrol edilmedi. Her fişi açıp bilgileri kontrol edin ve "Doğru" olarak işaretleyin.', n
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Büro personeli, firması kendi girişini kullansa da o firma adına kayıt açabilir
drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (
  status = 'draft' and created_by = (select auth.uid())
  and private.company_active(company_id)
  and (
    (
      ((owner_user_id = (select auth.uid()) and private.is_member(company_id))
       or private.has_any_role(company_id, array['accountant']))
      and exists (select 1 from public.memberships m where m.company_id = reports.company_id
                  and m.user_id = owner_user_id and m.status = 'active')
    )
    or (owner_user_id = (select auth.uid()) and private.is_company_bureau_staff(company_id))
  )
);
