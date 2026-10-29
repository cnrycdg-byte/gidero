-- Bağımsız incelemenin düzeltmeleri (güvenlik ve görevler ayrılığı):
-- 1) Şifresiz geçiş yalnızca Gidero yöneticisine ve yalnızca YALNIZCA test müşterisine bağlı kişilere.
--    Gerçek kullanıcı ya da yönetici test müşterisine eklenemez.
-- 2) Davet bağlantısı yalnızca şifresi hiç belirlenmemiş ve yalnızca çağıranın yönettiği şirketlerde olan kişiye.
-- 3) Onaylayacak kimse yoksa rapor kendiliğinden onaylanmaz; hata verilir.
-- 4) Büro firmasında onaysız kayıt ve kendi masrafını ödendi işaretleme yalnızca büro personeline.
-- 5) Zincirdeki onaylayıcı ayrıldıysa (pasif) yedek kurallar devreye girer.

-- ---------------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------------
create or replace function private.company_is_demo(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select a.is_demo from public.companies c
                     join public.accounts a on a.id = coalesce(c.bureau_account_id, c.account_id)
                    where c.id = p_company), false);
$$;

-- Kişi test müşterisine katılabilir mi: yönetici değil ve hiçbir gerçek hesaba bağlı değil
create or replace function private.can_join_demo(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.platform_admins pa where pa.user_id = p_user)
     and not exists (select 1 from public.bureau_staff s join public.accounts a on a.id = s.account_id
                      where s.user_id = p_user and not a.is_demo)
     and not exists (select 1 from public.memberships m join public.companies c on c.id = m.company_id
                       join public.accounts a on a.id = coalesce(c.bureau_account_id, c.account_id)
                      where m.user_id = p_user and not a.is_demo);
$$;

-- Çağıran bu firmanın bürosunda çalışıyor mu (firmanın üyesi olan muhasebeci değil)
create or replace function private.is_company_bureau_staff(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.companies c
                   join public.bureau_staff s on s.account_id = c.bureau_account_id
                  where c.id = p_company and s.user_id = (select auth.uid()) and s.status = 'active'
                    and (s.role = 'owner' or exists (select 1 from public.bureau_assignments ba
                           where ba.account_id = s.account_id and ba.user_id = s.user_id and ba.company_id = c.id)));
$$;

-- ---------------------------------------------------------------------------
-- 1) Test müşterileri: listede ve geçişte yalnızca test kişileri
-- ---------------------------------------------------------------------------
create or replace function public.demo_people()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.is_platform_admin() or private.is_demo_user()) then
    raise exception 'Test ekranı yalnızca Gidero yöneticisine açıktır.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'account_id', a.id, 'kind', a.kind, 'name', a.name,
      'people', coalesce((
        select jsonb_agg(x order by x ->> 'sort', x ->> 'full_name') from (
          select jsonb_build_object(
                   'user_id', s.user_id, 'email', u.email,
                   'full_name', coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)),
                   'label', case s.role when 'owner' then 'Büro sahibi' else 'Büro muhasebecisi' end,
                   'company', null, 'sort', case s.role when 'owner' then '0' else '1' end) as x
            from public.bureau_staff s join auth.users u on u.id = s.user_id left join public.profiles p on p.id = s.user_id
           where s.account_id = a.id and s.status = 'active'
             and s.user_id in (select private.demo_user_ids())
          union all
          select jsonb_build_object(
                   'user_id', m.user_id, 'email', u.email,
                   'full_name', coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)),
                   'label', coalesce(nullif(m.title, ''),
                              case when 'admin' = any (m.roles) then 'Şirket yöneticisi'
                                   when 'accountant' = any (m.roles) then 'Muhasebeci'
                                   when 'approver' = any (m.roles) then 'Onaylayıcı' else 'Çalışan' end),
                   'company', c.legal_name,
                   'sort', case when 'admin' = any (m.roles) then '2' when 'accountant' = any (m.roles) then '4' else '3' end)
            from public.memberships m join public.companies c on c.id = m.company_id
            join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id
           where c.account_id = a.id and c.bureau_account_id is null and m.status = 'active'
             and m.user_id in (select private.demo_user_ids())
        ) q), '[]'::jsonb)
    ) order by a.created_at desc)
    from public.accounts a where a.is_demo), '[]'::jsonb);
end;
$$;

-- Şifresiz geçişe izin: yalnızca Gidero yöneticisi, yalnızca test kişisine
create or replace function public.demo_can_login(p_target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_platform_admin() and p_target in (select private.demo_user_ids()); $$;
revoke all on function public.demo_can_login(uuid) from public, anon;
grant execute on function public.demo_can_login(uuid) to authenticated;

create or replace function public.demo_reset()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_accounts uuid[];
  v_companies uuid[];
  v_users uuid[];
begin
  perform private.require_platform_admin();
  select coalesce(array_agg(u), '{}') into v_users from private.demo_user_ids() u;
  select coalesce(array_agg(a.id), '{}') into v_accounts from public.accounts a where a.is_demo;
  select coalesce(array_agg(c.id), '{}') into v_companies from public.companies c
   where c.account_id = any (v_accounts) or c.bureau_account_id = any (v_accounts);
  delete from public.companies where id = any (v_companies);
  delete from public.orders where account_id = any (v_accounts);
  delete from public.accounts where id = any (v_accounts);
  return jsonb_build_object('accounts', cardinality(v_accounts), 'companies', cardinality(v_companies), 'user_ids', to_jsonb(v_users));
end;
$$;

-- Kişi ekleme: test müşterisine gerçek kullanıcı / yönetici eklenemez
create or replace function public.add_member(p_company uuid, p_email text, p_roles text[] default array['employee'],
                                             p_manager uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_manager uuid := coalesce(p_manager, (select auth.uid()));
  v_account uuid := private.billing_account(p_company);
  v_kind text;
  v_max int;
  v_used int;
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Kişi eklemek için yönetici olmalısınız.' using errcode = '42501';
  end if;
  if not private.account_active(v_account) then
    raise exception 'Aboneliğiniz sona erdi. Kişi eklemek için paketinizi yenileyin.' using errcode = 'P0001';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Bu e-postayla kayıtlı kullanıcı yok. Önce kişinin Gidero''ya kaydolmasını isteyin.'
      using errcode = 'P0002';
  end if;
  if private.company_is_demo(p_company) and not private.can_join_demo(v_user) then
    raise exception 'Test müşterisine gerçek bir kullanıcı eklenemez; uydurma bir e-posta kullanın.' using errcode = '42501';
  end if;
  if 'employee' = any (coalesce(p_roles, array['employee'])) and not exists (
       select 1 from public.memberships m where m.company_id = p_company and m.user_id = v_user
         and m.status = 'active' and 'employee' = any (m.roles)) then
    select kind into v_kind from public.accounts where id = v_account;
    select max_users into v_max from public.subscriptions where account_id = v_account;
    select count(distinct m.user_id) into v_used from public.memberships m join public.companies c on c.id = m.company_id
     where m.status = 'active' and 'employee' = any (m.roles)
       and (case when v_kind = 'bureau' then c.id = p_company else c.account_id = v_account end);
    if v_max is not null and v_used >= v_max then
      raise exception 'Paketinizdeki % çalışan hakkı dolu. Onaylayıcı ve muhasebeci rolleri ücretsizdir; çalışan eklemek için paketinizi büyütün.', v_max
        using errcode = 'P0001';
    end if;
  end if;
  if v_user = v_manager then v_manager := null; end if;
  if v_manager is not null and not exists (
      select 1 from public.memberships m where m.company_id = p_company and m.user_id = v_manager and m.status = 'active') then
    v_manager := null;
  end if;
  insert into public.memberships (company_id, user_id, roles, manager_user_id)
  values (p_company, v_user, coalesce(p_roles, array['employee']), v_manager)
  on conflict (company_id, user_id) do update
    set roles = excluded.roles, manager_user_id = excluded.manager_user_id, status = 'active';
  return v_user;
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
  if exists (select 1 from public.accounts a where a.id = p_account and a.is_demo) and not private.can_join_demo(v_user) then
    raise exception 'Test müşterisine gerçek bir kullanıcı eklenemez; uydurma bir e-posta kullanın.' using errcode = '42501';
  end if;
  insert into public.profiles (id) values (v_user) on conflict (id) do nothing;
  insert into public.bureau_staff (account_id, user_id, role) values (p_account, v_user, 'accountant')
  on conflict (account_id, user_id) do update set status = 'active';
  return v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Davet bağlantısı kuralları (sunucu fonksiyonu service role ile sorar)
-- ---------------------------------------------------------------------------
-- E-postanın kişisi: yok / var; şifresi var mı; bekleyen müşteri sahibi daveti var mı
create or replace function public.invite_target(p_email text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', (select u.id from auth.users u where lower(u.email) = lower(trim(p_email))),
    'has_password', coalesce((select coalesce(u.encrypted_password, '') <> '' from auth.users u where lower(u.email) = lower(trim(p_email))), false),
    'pending_owner_invite', exists (select 1 from public.platform_invites i where lower(i.email) = lower(trim(p_email)) and i.accepted_at is null));
$$;
revoke all on function public.invite_target(text) from public, anon, authenticated;
grant execute on function public.invite_target(text) to service_role;

-- Yönetici bu kişiye giriş bağlantısı verebilir mi: kişi şifre belirlememiş ve yalnızca çağıranın yönettiği şirketlerde
create or replace function public.can_issue_invite(p_company uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_any_role(p_company, array['admin'])
     and exists (select 1 from public.memberships m where m.company_id = p_company and m.user_id = p_user and m.status = 'active')
     and not exists (select 1 from public.memberships m where m.user_id = p_user and not private.has_any_role(m.company_id, array['admin']))
     and not exists (select 1 from public.bureau_staff s where s.user_id = p_user)
     and not exists (select 1 from public.platform_admins pa where pa.user_id = p_user)
     and not exists (select 1 from auth.users u where u.id = p_user and coalesce(u.encrypted_password, '') <> '');
$$;
revoke all on function public.can_issue_invite(uuid, uuid) from public, anon;
grant execute on function public.can_issue_invite(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) + 4) Rapor gönderme
-- ---------------------------------------------------------------------------
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
    or (owner_user_id = (select auth.uid()) and private.bureau_managed(company_id)
        and private.is_company_bureau_staff(company_id))
  )
);

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
  if (private.bureau_managed(r.company_id) and r.created_by = v_me and r.owner_user_id = v_me
        and private.is_company_bureau_staff(r.company_id))
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
revoke all on function public.submit_report(uuid) from public, anon;
grant execute on function public.submit_report(uuid) to authenticated;

create or replace function public.mark_paid(p_company uuid, p_report_ids uuid[], p_note text default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_bad int; v_n int;
begin
  if not private.has_any_role(p_company, array['accountant']) then
    raise exception 'Ödemeyi yalnızca muhasebeci işaretleyebilir.' using errcode = '42501';
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
  -- Kendi masrafını ödendi işaretleyemez; büro personelinin firma adına girdiği kayıt hariç
  if exists (select 1 from public.reports r where r.id = any (p_report_ids) and r.owner_user_id = v_me
               and not (private.bureau_managed(r.company_id) and private.is_company_bureau_staff(r.company_id))) then
    raise exception 'Kendi masrafınızı ödendi olarak işaretleyemezsiniz; başka bir muhasebeci ya da yönetici işaretlemeli.' using errcode = '42501';
  end if;
  update public.reports
     set status = 'paid', paid_at = now(), paid_by = v_me, paid_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = any (p_report_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Zincirde ayrılan (pasif) kişi: yedek kurallar
-- ---------------------------------------------------------------------------
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
    -- Kişi şirketten ayrıldıysa adım ona gitmez
    select coalesce(array_agg(m.user_id), '{}') into v_ids from public.memberships m
     where m.company_id = p_report.company_id and m.status = 'active'
       and m.user_id = (p_step ->> 'approver_user_id')::uuid;
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
