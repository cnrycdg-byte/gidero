-- Ödeme yetkilisi: muhasebenin kontrol edip aktardığı raporları öder; çalışana "ödendi" bildirimi gider, rapor arşive kalkar.
-- Kişinin IBAN ve banka bilgisi ayrı tabloda; yalnızca kişinin kendisi, muhasebeci ve ödeme yetkilisi görür.
-- Şirket yöneticisi kişiyi eklerken girebilir ama sonra göremez (yalnızca kayıtlı olup olmadığını görür).

alter table public.memberships drop constraint if exists memberships_roles_check;
alter table public.memberships add constraint memberships_roles_check
  check (roles <@ array['employee','approver','cost_center_owner','accountant','admin','auditor','payer']::text[]
         and cardinality(roles) > 0);

alter table public.reports add column payment_requested_at timestamptz;
alter table public.reports add column payment_requested_by uuid references auth.users (id);
create index reports_payment_requested_by_idx on public.reports (payment_requested_by);
create index reports_payment_queue_idx on public.reports (company_id) where payment_requested_at is not null and status <> 'paid';

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('approval_needed', 'approved', 'returned', 'ready_for_accounting', 'paid', 'payment_needed'));

-- Banka bilgisi
create table public.member_bank (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  iban text check (iban is null or iban ~ '^TR[0-9]{24}$'),
  bank_name text check (bank_name is null or length(bank_name) <= 80),
  account_holder text check (account_holder is null or length(account_holder) <= 120),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  primary key (company_id, user_id)
);
create index member_bank_user_id_idx on public.member_bank (user_id);
create index member_bank_updated_by_idx on public.member_bank (updated_by);
alter table public.member_bank enable row level security;
create policy member_bank_select on public.member_bank for select to authenticated using (
  user_id = (select auth.uid()) or private.has_any_role(company_id, array['accountant', 'payer'])
);
-- Yazma yalnızca set_member_bank ile (doğrulama ve denetim izi)
grant select on public.member_bank to authenticated;
create trigger audit_member_bank after insert or update or delete on public.member_bank
  for each row execute function private.audit_row();

-- audit_row 'id' sütunu bekler; member_bank'ta yok, bu yüzden satır kimliği olarak user_id yazılır
create or replace function private.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (company_id, table_name, row_id, action, old_data, new_data, actor_user_id)
  values ((v_row ->> 'company_id')::uuid, tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'user_id')::uuid, lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          (select auth.uid()));
  return coalesce(new, old);
end;
$$;

/** TR IBAN: 26 karakter, mod 97 = 1 */
create or replace function private.iban_valid(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare s text; n text := ''; ch text; r int := 0; i int;
begin
  if p !~ '^TR[0-9]{24}$' then return false; end if;
  s := substr(p, 5) || substr(p, 1, 4);
  for i in 1..length(s) loop
    ch := substr(s, i, 1);
    if ch ~ '[A-Z]' then n := (ascii(ch) - 55)::text; else n := ch; end if;
    for j in 1..length(n) loop
      r := (r * 10 + substr(n, j, 1)::int) % 97;
    end loop;
  end loop;
  return r = 1;
end;
$$;

create or replace function public.set_member_bank(p_company uuid, p_user uuid, p_iban text, p_bank text, p_holder text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_iban text := nullif(upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g')), '');
begin
  if not (p_user = (select auth.uid()) and private.is_member(p_company))
     and not private.has_any_role(p_company, array['admin', 'accountant', 'payer']) then
    raise exception 'Banka bilgisini kişinin kendisi, muhasebe ya da ödeme yetkilisi değiştirebilir.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships m where m.company_id = p_company and m.user_id = p_user) then
    raise exception 'Bu kişi şirkette değil.' using errcode = 'P0002';
  end if;
  if v_iban is not null and not private.iban_valid(v_iban) then
    raise exception 'IBAN geçersiz görünüyor. TR ile başlayan 26 karakteri kontrol edin.' using errcode = '22023';
  end if;
  insert into public.member_bank (company_id, user_id, iban, bank_name, account_holder, updated_at, updated_by)
  values (p_company, p_user, v_iban, nullif(trim(coalesce(p_bank, '')), ''), nullif(trim(coalesce(p_holder, '')), ''), now(), (select auth.uid()))
  on conflict (company_id, user_id) do update
    set iban = excluded.iban, bank_name = excluded.bank_name, account_holder = excluded.account_holder,
        updated_at = now(), updated_by = excluded.updated_by;
end;
$$;
revoke all on function public.set_member_bank(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.set_member_bank(uuid, uuid, text, text, text) to authenticated;

-- Yönetici için: banka bilgisi kayıtlı mı (IBAN'ın kendisi gösterilmez)
create or replace function public.member_bank_saved(p_company uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_member(p_company)
     and exists (select 1 from public.member_bank b where b.company_id = p_company and b.user_id = p_user and b.iban is not null);
$$;
revoke all on function public.member_bank_saved(uuid, uuid) from public, anon;
grant execute on function public.member_bank_saved(uuid, uuid) to authenticated;

-- Muhasebe kontrol ettiği raporu ödeme yetkilisine aktarır
create or replace function public.request_payment(p_company uuid, p_report_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare v_bad int; v_n int;
begin
  if not private.has_any_role(p_company, array['accountant']) then
    raise exception 'Ödemeye yalnızca muhasebeci aktarabilir.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_report_ids), 0) = 0 then
    raise exception 'Aktarılacak rapor seçilmedi.' using errcode = 'P0001';
  end if;
  select count(*) into v_bad from unnest(p_report_ids) as x(id)
    left join public.reports r on r.id = x.id and r.company_id = p_company
   where r.id is null or r.status not in ('approved', 'booked', 'exported');
  if v_bad > 0 then
    raise exception 'Yalnızca onaylanmış ve ödenmemiş raporlar ödemeye aktarılabilir (% rapor uygun değil).', v_bad using errcode = 'P0001';
  end if;
  perform private.require_alcohol_decided(p_report_ids);
  if not exists (select 1 from public.memberships m where m.company_id = p_company and m.status = 'active' and 'payer' = any (m.roles)) then
    raise exception 'Şirkette ödeme yetkilisi yok. Ekip ekranında bir kişiye "Ödeme yetkilisi" rolü verin.' using errcode = 'P0001';
  end if;
  update public.reports set payment_requested_at = now(), payment_requested_by = (select auth.uid())
   where id = any (p_report_ids) and payment_requested_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.request_payment(uuid, uuid[]) from public, anon;
grant execute on function public.request_payment(uuid, uuid[]) to authenticated;

-- Ödeme yetkilisine bildirim
create or replace function private.notify_payment_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner text;
begin
  if new.payment_requested_at is not null and old.payment_requested_at is null then
    select coalesce(nullif(p.full_name, ''), 'Bir çalışan') into v_owner from public.profiles p where p.id = new.owner_user_id;
    insert into public.notifications (user_id, company_id, report_id, kind, title, body)
    select m.user_id, new.company_id, new.id, 'payment_needed', 'Ödeme bekleyen rapor',
           coalesce(v_owner, 'Bir çalışan') || ': ' || new.title || ', ' || private.tl(new.total)
      from public.memberships m
     where m.company_id = new.company_id and m.status = 'active' and 'payer' = any (m.roles)
       and m.user_id <> new.owner_user_id;
  end if;
  return new;
end;
$$;
create trigger reports_notify_payment after update of payment_requested_at on public.reports
  for each row execute function private.notify_payment_request();

-- Ödeme kuyruğu: çalışana ödenecek tutar (kendi cebinden, reddedilen alkol hariç) ve banka bilgisi
create or replace function public.payment_queue(p_company uuid, p_paid boolean default false)
returns table (report_id uuid, title text, owner_user_id uuid, owner_name text, total numeric, pay_amount numeric,
               iban text, bank_name text, account_holder text, requested_at timestamptz, paid_at timestamptz, paid_note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_any_role(p_company, array['payer', 'accountant']) then
    raise exception 'Ödeme ekranını ödeme yetkilisi ve muhasebeci görebilir.' using errcode = '42501';
  end if;
  return query
  select r.id, r.title, r.owner_user_id, coalesce(nullif(p.full_name, ''), 'İsimsiz'), r.total,
         coalesce((select sum(e.total - case when e.alcohol_decision = 'rejected' then least(coalesce(e.alcohol_amount, 0), e.total) else 0 end)
                     from public.expenses e where e.report_id = r.id and e.payment_method = 'personal'), 0)::numeric(14,2),
         b.iban, b.bank_name, b.account_holder, r.payment_requested_at, r.paid_at, r.paid_note
    from public.reports r
    left join public.profiles p on p.id = r.owner_user_id
    left join public.member_bank b on b.company_id = r.company_id and b.user_id = r.owner_user_id
   where r.company_id = p_company and r.payment_requested_at is not null
     and (case when p_paid then r.status = 'paid' else r.status <> 'paid' end)
   order by case when p_paid then r.paid_at end desc nulls last, r.payment_requested_at;
end;
$$;
revoke all on function public.payment_queue(uuid, boolean) from public, anon;
grant execute on function public.payment_queue(uuid, boolean) to authenticated;

-- Ödendi: muhasebeci ya da ödeme yetkilisi; kendi masrafını işaretleyemez
create or replace function public.mark_paid(p_company uuid, p_report_ids uuid[], p_note text default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_bad int; v_n int;
begin
  if not private.has_any_role(p_company, array['accountant', 'payer']) then
    raise exception 'Ödemeyi muhasebeci ya da ödeme yetkilisi işaretleyebilir.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_report_ids), 0) = 0 then
    raise exception 'Ödenen rapor seçilmedi.' using errcode = 'P0001';
  end if;
  select count(*) into v_bad
    from unnest(p_report_ids) as x(id)
    left join public.reports r on r.id = x.id and r.company_id = p_company
   where r.id is null or r.status not in ('approved', 'booked', 'exported');
  if v_bad > 0 then
    raise exception 'Yalnızca onaylanmış raporlar ödendi işaretlenebilir (% rapor uygun değil).', v_bad using errcode = 'P0001';
  end if;
  -- Ödeme yetkilisi (muhasebeci değilse) yalnızca kendisine aktarılan raporu öder
  if not private.has_any_role(p_company, array['accountant'])
     and exists (select 1 from public.reports r where r.id = any (p_report_ids) and r.payment_requested_at is null) then
    raise exception 'Bu rapor henüz muhasebe tarafından ödemeye aktarılmadı.' using errcode = '42501';
  end if;
  perform private.require_alcohol_decided(p_report_ids);
  if exists (select 1 from public.reports r where r.id = any (p_report_ids) and r.owner_user_id = v_me
               and not (private.bureau_managed(r.company_id) and private.is_company_bureau_staff(r.company_id))) then
    raise exception 'Kendi masrafınızı ödendi olarak işaretleyemezsiniz; başka bir yetkili işaretlemeli.' using errcode = '42501';
  end if;
  update public.reports
     set status = 'paid', paid_at = now(), paid_by = v_me, paid_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = any (p_report_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Ödeme yetkilisi, ödemeye aktarılan raporu ve fişlerini görebilir
create or replace function private.can_view_report(p_report uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
    where r.id = p_report and (
      r.owner_user_id = (select auth.uid())
      or r.created_by = (select auth.uid())
      or (select auth.uid()) = any (r.current_approver_ids)
      or private.has_any_role(r.company_id, array['accountant','admin','auditor'])
      or (r.payment_requested_at is not null and private.has_any_role(r.company_id, array['payer']))
      or exists (select 1 from public.approval_actions a
                 where a.report_id = r.id and a.actor_user_id = (select auth.uid()))
      or exists (select 1 from public.memberships m
                 where m.company_id = r.company_id and m.user_id = r.owner_user_id
                   and m.manager_user_id = (select auth.uid()))
      or exists (select 1 from public.cost_centers cc
                 where cc.id = r.cost_center_id and cc.owner_user_id = (select auth.uid()))
    )
  );
$$;
