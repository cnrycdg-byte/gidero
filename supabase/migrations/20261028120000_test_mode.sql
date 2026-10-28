-- Test modu (şifresiz kişi değiştirme), onay şeması düzenleme ve büro ekibi.
--
-- 1) demo_users: Gidero yöneticisinin deneme sürüşü için açılan sahte kişiler. Kişiler yalnızca demo-login
--    sunucu fonksiyonuyla (service role) açılır; bu tabloya istemci yazamaz.
-- 2) demo_reset(): yalnızca deneme kişilerine ait hesapları ve verilerini siler. Gerçek bir kişinin bağlı olduğu
--    hesaba dokunmaz.
-- 3) set_approval_steps(): şirket yöneticisi onay şemasını tek seferde kaydeder.
-- 4) Büro ekibi: büro sahibi muhasebeci ekler ve müşteri firmalara atar. Müşteri firmada yönetici yoksa büro
--    sahibi onaylayıcı yerine geçer; büro sahibi muhasebeye düşen raporların bildirimini alır.

-- ---------------------------------------------------------------------------
-- 1) Deneme kişileri
-- ---------------------------------------------------------------------------
create table public.demo_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  persona text not null unique check (persona ~ '^[a-z0-9_]{2,40}$'),
  email text not null,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.demo_users enable row level security;
grant select on public.demo_users to authenticated;

create or replace function private.is_demo_user()
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.demo_users d where d.user_id = (select auth.uid())); $$;
grant execute on function private.is_demo_user() to authenticated;

create policy demo_users_select on public.demo_users for select to authenticated
  using ((select private.is_platform_admin()) or (select private.is_demo_user()));

-- ---------------------------------------------------------------------------
-- 2) Test verilerini sıfırlama
-- ---------------------------------------------------------------------------
create or replace function public.demo_reset()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_accounts uuid[];
  v_companies uuid[];
begin
  if not (private.is_platform_admin() or private.is_demo_user()) then
    raise exception 'Test verilerini yalnızca Gidero yöneticisi sıfırlayabilir.' using errcode = '42501';
  end if;

  with attached as (
    select s.account_id, s.user_id from public.bureau_staff s
    union all
    select c.account_id, m.user_id from public.memberships m join public.companies c on c.id = m.company_id
    union all
    select c.bureau_account_id, m.user_id from public.memberships m join public.companies c on c.id = m.company_id
     where c.bureau_account_id is not null
  )
  select coalesce(array_agg(a.id), '{}') into v_accounts
    from public.accounts a
   where (exists (select 1 from attached t join public.demo_users d on d.user_id = t.user_id where t.account_id = a.id)
          or exists (select 1 from public.platform_invites i join public.demo_users d on lower(d.email) = lower(i.email)
                      where i.account_id = a.id))
     and not exists (select 1 from attached t where t.account_id = a.id
                       and not exists (select 1 from public.demo_users d where d.user_id = t.user_id));

  select coalesce(array_agg(c.id), '{}') into v_companies
    from public.companies c
   where c.account_id = any (v_accounts) or c.bureau_account_id = any (v_accounts);

  delete from public.companies where id = any (v_companies);
  delete from public.orders where account_id = any (v_accounts);
  delete from public.accounts where id = any (v_accounts);

  return jsonb_build_object('accounts', cardinality(v_accounts), 'companies', cardinality(v_companies));
end;
$$;
revoke all on function public.demo_reset() from public, anon;
grant execute on function public.demo_reset() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Büro: müşteri firmada yönetici yoksa büro sahibi; muhasebeciler arasında büro sahibi
-- ---------------------------------------------------------------------------
create or replace function private.company_admins(p_company uuid)
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select array_agg(m.user_id) from public.memberships m
      where m.company_id = p_company and m.status = 'active' and 'admin' = any (m.roles)),
    (select array_agg(s.user_id) from public.companies c
       join public.bureau_staff s on s.account_id = c.bureau_account_id
      where c.id = p_company and s.role = 'owner' and s.status = 'active'),
    '{}');
$$;
revoke all on function private.company_admins(uuid) from public;

create or replace function private.company_accountants(p_company uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.user_id from public.memberships m
   where m.company_id = p_company and m.status = 'active' and 'accountant' = any (m.roles)
  union
  select a.user_id from public.bureau_assignments a
    join public.companies c on c.id = a.company_id and c.bureau_account_id = a.account_id
    join public.bureau_staff s on s.account_id = a.account_id and s.user_id = a.user_id and s.status = 'active'
   where a.company_id = p_company
  union
  select s.user_id from public.companies c
    join public.bureau_staff s on s.account_id = c.bureau_account_id and s.role = 'owner' and s.status = 'active'
   where c.id = p_company;
$$;

-- "Muhasebeci" ya da "şirket yöneticisi" rolüne giden adım büro personelini de bulur
create or replace function private.resolve_step_approvers(p_report public.reports, p_step jsonb)
returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_type text := p_step ->> 'approver_type';
  v_role text := p_step ->> 'approver_role';
  v_ids uuid[] := '{}';
  v_mgr uuid;
begin
  if v_type = 'manager' then
    v_ids := array_remove(array[private.manager_of(p_report.company_id, p_report.owner_user_id)], null);
  elsif v_type = 'skip_level' then
    v_mgr := private.manager_of(p_report.company_id, p_report.owner_user_id);
    v_ids := array_remove(array[private.manager_of(p_report.company_id, v_mgr)], null);
  elsif v_type = 'cost_center_owner' then
    select array_remove(array[cc.owner_user_id], null) into v_ids
      from public.cost_centers cc where cc.id = p_report.cost_center_id;
  elsif v_type = 'user' then
    v_ids := array[(p_step ->> 'approver_user_id')::uuid];
  elsif v_type = 'role' then
    if v_role = 'accountant' then
      select coalesce(array_agg(a), '{}') into v_ids from private.company_accountants(p_report.company_id) a;
    elsif v_role = 'admin' then
      v_ids := private.company_admins(p_report.company_id);
    else
      select coalesce(array_agg(m.user_id), '{}') into v_ids
        from public.memberships m
       where m.company_id = p_report.company_id and m.status = 'active' and v_role = any (m.roles);
    end if;
  end if;

  v_ids := array_remove(coalesce(v_ids, '{}'), p_report.owner_user_id);

  -- Kendi kendini onaylama yasak: boş kaldıysa sahibin yöneticisinin yöneticisi, sonra yöneticiler
  if cardinality(v_ids) = 0 and v_type in ('manager','user','cost_center_owner') then
    v_mgr := private.manager_of(p_report.company_id, p_report.owner_user_id);
    if v_mgr is not null and v_mgr <> p_report.owner_user_id then
      v_ids := array_remove(array[private.manager_of(p_report.company_id, v_mgr)], null);
      v_ids := array_remove(v_ids, p_report.owner_user_id);
    end if;
  end if;
  if cardinality(v_ids) = 0 then
    v_ids := array_remove(private.company_admins(p_report.company_id), p_report.owner_user_id);
  end if;
  return v_ids;
end;
$$;
revoke all on function private.resolve_step_approvers(public.reports, jsonb) from public;

-- Büro ekibi listesi: kişiler, e-postaları ve atandıkları firmalar
create or replace function public.bureau_team(p_account uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_bureau_staff(p_account, false) then
    raise exception 'Bu büronun ekibini göremezsiniz.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', s.user_id, 'role', s.role, 'email', u.email,
      'full_name', coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)),
      'companies', coalesce((select jsonb_agg(a.company_id) from public.bureau_assignments a
                              where a.account_id = s.account_id and a.user_id = s.user_id), '[]'::jsonb)
    ) order by s.role desc, p.full_name)
      from public.bureau_staff s
      join auth.users u on u.id = s.user_id
      left join public.profiles p on p.id = s.user_id
     where s.account_id = p_account and s.status = 'active'), '[]'::jsonb);
end;
$$;

create or replace function public.bureau_add_staff(p_account uuid, p_email text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid;
begin
  if not private.is_bureau_staff(p_account, true) then
    raise exception 'Büroya kişiyi yalnızca büro sahibi ekleyebilir.' using errcode = '42501';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(coalesce(p_email, '')));
  if v_user is null then
    raise exception 'Bu e-postayla kayıtlı kullanıcı yok. Önce kişinin Gidero''ya kaydolmasını isteyin.' using errcode = 'P0002';
  end if;
  insert into public.profiles (id) values (v_user) on conflict (id) do nothing;
  insert into public.bureau_staff (account_id, user_id, role) values (p_account, v_user, 'accountant')
  on conflict (account_id, user_id) do update set status = 'active';
  return v_user;
end;
$$;

create or replace function public.bureau_assign(p_account uuid, p_user uuid, p_company uuid, p_assigned boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_bureau_staff(p_account, true) then
    raise exception 'Firmaya muhasebeciyi yalnızca büro sahibi atayabilir.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company and c.bureau_account_id = p_account) then
    raise exception 'Bu firma büronuzun müşterisi değil.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.bureau_staff s where s.account_id = p_account and s.user_id = p_user and s.status = 'active') then
    raise exception 'Bu kişi büronuzun ekibinde değil.' using errcode = '42501';
  end if;
  if p_assigned then
    insert into public.bureau_assignments (account_id, user_id, company_id) values (p_account, p_user, p_company)
    on conflict do nothing;
  else
    delete from public.bureau_assignments where account_id = p_account and user_id = p_user and company_id = p_company;
  end if;
end;
$$;

revoke all on function public.bureau_team(uuid) from public, anon;
revoke all on function public.bureau_add_staff(uuid, text) from public, anon;
revoke all on function public.bureau_assign(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.bureau_team(uuid) to authenticated;
grant execute on function public.bureau_add_staff(uuid, text) to authenticated;
grant execute on function public.bureau_assign(uuid, uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Onay şeması: adımlar tek seferde kaydedilir (gönderilmiş raporlar kendi kopyasıyla devam eder)
-- ---------------------------------------------------------------------------
create or replace function public.set_approval_steps(p_company uuid, p_steps jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_flow uuid;
  v_step jsonb;
  v_i int := 0;
  v_type text;
  v_user uuid;
  v_role text;
  v_min numeric;
  v_name text;
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Onay şemasını yalnızca şirket yöneticisi değiştirebilir.' using errcode = '42501';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'Onay adımlarını gönderin.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) > 6 then
    raise exception 'En fazla 6 onay adımı tanımlanabilir.' using errcode = '22023';
  end if;

  select f.id into v_flow from public.approval_flows f
   where f.company_id = p_company and f.active
   order by f.priority desc, f.created_at limit 1;
  if v_flow is null then
    insert into public.approval_flows (company_id, name, priority) values (p_company, 'Onay akışı', 0) returning id into v_flow;
  end if;
  delete from public.approval_steps where flow_id = v_flow;

  for v_step in select value from jsonb_array_elements(p_steps) loop
    v_type := v_step ->> 'approver_type';
    v_user := nullif(v_step ->> 'approver_user_id', '')::uuid;
    v_role := nullif(v_step ->> 'approver_role', '');
    v_min := nullif(v_step ->> 'min_total', '')::numeric;
    if v_type is null or v_type not in ('manager', 'skip_level', 'cost_center_owner', 'user', 'role') then
      raise exception 'Adım %: kimin onaylayacağını seçin.', v_i + 1 using errcode = '22023';
    end if;
    if v_type = 'user' then
      if v_user is null or not exists (select 1 from public.memberships m where m.company_id = p_company
                                         and m.user_id = v_user and m.status = 'active') then
        raise exception 'Adım %: seçilen kişi bu şirketin ekibinde değil.', v_i + 1 using errcode = '22023';
      end if;
    else
      v_user := null;
    end if;
    if v_type = 'role' then
      if v_role is null or v_role not in ('approver', 'accountant', 'admin') then
        raise exception 'Adım %: onaylayacak rolü seçin.', v_i + 1 using errcode = '22023';
      end if;
    else
      v_role := null;
    end if;
    if v_min is not null and v_min < 0 then
      raise exception 'Adım %: tutar sınırı sıfırdan küçük olamaz.', v_i + 1 using errcode = '22023';
    end if;
    v_name := left(coalesce(nullif(trim(v_step ->> 'name'), ''),
      case v_type when 'manager' then 'Yöneticisi' when 'skip_level' then 'Yöneticisinin yöneticisi'
                  when 'user' then 'Belirli kişi' when 'cost_center_owner' then 'Masraf merkezi sorumlusu' else 'Rol' end), 60);
    insert into public.approval_steps (flow_id, company_id, position, name, approver_type, approver_user_id, approver_role, min_total)
    values (v_flow, p_company, v_i, v_name, v_type, v_user, v_role, round(v_min, 2));
    v_i := v_i + 1;
  end loop;
  return v_flow;
end;
$$;
revoke all on function public.set_approval_steps(uuid, jsonb) from public, anon;
grant execute on function public.set_approval_steps(uuid, jsonb) to authenticated;
