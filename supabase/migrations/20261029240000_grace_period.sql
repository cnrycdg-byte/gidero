-- Abonelik bitince 10 günlük ek süre: bu sürede kimse yeni fiş giremez ama herkes verilerini görür ve indirir,
-- yönetici paketi yenileyebilir. Ek süre bitince hesap kilitlenir (veriler silinmez; yenileyince geri açılır).

create or replace function private.account_last_end(p_account uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select coalesce(s.current_period_end, s.trial_ends_at) from public.subscriptions s where s.account_id = p_account;
$$;

create or replace function private.account_grace_end(p_account uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select private.account_last_end(p_account) + interval '10 days';
$$;

-- active: paket geçerli; grace: bitti, 10 gün içinde (salt okunur, veri indirilebilir); locked: ek süre de bitti
create or replace function private.account_phase(p_account uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when private.account_active(p_account) then 'active'
    when coalesce(private.account_grace_end(p_account), '-infinity') > now() then 'grace'
    else 'locked' end;
$$;
grant execute on function private.account_phase(uuid) to authenticated;

create or replace function public.account_status(p_account uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.subscriptions;
  a public.accounts;
begin
  select * into a from public.accounts where id = p_account;
  if not found then raise exception 'Hesap bulunamadı.' using errcode = 'P0002'; end if;
  if not (private.can_manage_account(p_account)
          or exists (select 1 from public.companies c where coalesce(c.bureau_account_id, c.account_id) = p_account
                     and private.is_member(c.id))) then
    raise exception 'Bu hesabı göremezsiniz.' using errcode = '42501';
  end if;
  select * into s from public.subscriptions where account_id = p_account;
  return jsonb_build_object(
    'account_id', a.id, 'kind', a.kind, 'name', a.name,
    'plan_id', s.plan_id, 'plan_name', (select name from public.plans where id = s.plan_id),
    'status', coalesce(s.status, 'expired'), 'billing_period', s.billing_period,
    'ends_at', private.subscription_end(s), 'active', private.account_active(a.id),
    'can_manage', private.can_manage_account(a.id),
    'phase', private.account_phase(a.id), 'grace_ends_at', private.account_grace_end(a.id),
    'max_companies', s.max_companies, 'max_users', s.max_users, 'seats', s.seats,
    'companies_used', (select count(*) from public.companies c where coalesce(c.bureau_account_id, c.account_id) = a.id),
    'users_used', (select count(distinct m.user_id) from public.memberships m join public.companies c on c.id = m.company_id
                   where coalesce(c.bureau_account_id, c.account_id) = a.id and m.status = 'active' and 'employee' = any (m.roles))
  );
end;
$$;

create or replace function public.my_workspace()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then return null; end if;
  return jsonb_build_object(
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'company_id', c.id, 'legal_name', c.legal_name, 'tax_number', c.tax_number,
        'roles', to_jsonb(private.my_roles(c.id)),
        'vehicle_plates', to_jsonb(coalesce((select m.vehicle_plates from public.memberships m
                                             where m.company_id = c.id and m.user_id = v_me), '{}'::text[])),
        'bureau_account_id', c.bureau_account_id,
        'billing_account_id', private.billing_account(c.id),
        'active', private.company_active(c.id),
        'brand_primary', c.brand_primary,
        'brand_accent', c.brand_accent,
        'logo_path', c.logo_path,
        'phase', private.account_phase(private.billing_account(c.id))
      ) order by c.legal_name)
      from public.companies c where cardinality(private.my_roles(c.id)) > 0), '[]'::jsonb),
    'bureaus', coalesce((
      select jsonb_agg(jsonb_build_object('account_id', a.id, 'name', a.name, 'role', s.role))
      from public.bureau_staff s join public.accounts a on a.id = s.account_id
      where s.user_id = v_me and s.status = 'active'), '[]'::jsonb),
    'platform_admin', private.is_platform_admin()
  );
end;
$$;
