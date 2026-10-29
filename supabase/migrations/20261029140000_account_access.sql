-- Hesap ve erişim: e-posta bildirimi tercihi, geçici şifre (ilk girişte değiştirme zorunlu), ekipten çıkarma.

alter table public.profiles add column email_notifications boolean not null default true;
grant update (full_name, phone, email_notifications) on public.profiles to authenticated;

-- Kişi hesabını kullanmaya başladı mı: kendi şifresini belirlemiş (yöneticinin verdiği geçici şifreyle henüz girmemiş değil)
create or replace function private.user_activated(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  -- Bir kez bile giriş yapmışsa (davetle girip şifre koymadan çıkmış olsa da) hesabını kullanıyor sayılır;
  -- yalnızca hiç girmemiş ve şifresi olmayan ya da yöneticinin geçici şifresiyle hiç girmemiş kişi "davet bekliyor"dur.
  select coalesce((select u.last_sign_in_at is not null
                          or (coalesce(u.encrypted_password, '') <> ''
                              and coalesce(u.raw_user_meta_data ->> 'must_change_password', '') <> 'true')
                     from auth.users u where u.id = p_user), false);
$$;

create or replace function public.can_issue_invite(p_company uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_any_role(p_company, array['admin'])
     and exists (select 1 from public.memberships m where m.company_id = p_company and m.user_id = p_user and m.status = 'active')
     and not exists (select 1 from public.memberships m where m.user_id = p_user and not private.has_any_role(m.company_id, array['admin']))
     and not exists (select 1 from public.bureau_staff s where s.user_id = p_user)
     and not exists (select 1 from public.platform_admins pa where pa.user_id = p_user)
     and not private.user_activated(p_user);
$$;

create or replace function public.can_issue_bureau_invite(p_account uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_bureau_staff(p_account, true)
     and exists (select 1 from public.bureau_staff s where s.account_id = p_account and s.user_id = p_user
                   and s.role = 'accountant' and s.status = 'active')
     and not exists (select 1 from public.bureau_staff s where s.user_id = p_user and s.account_id <> p_account)
     and not exists (select 1 from public.memberships m where m.user_id = p_user)
     and not exists (select 1 from public.platform_admins pa where pa.user_id = p_user)
     and not private.user_activated(p_user);
$$;

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
      'activated', private.user_activated(s.user_id),
      'companies', coalesce((select jsonb_agg(a.company_id) from public.bureau_assignments a
                              where a.account_id = s.account_id and a.user_id = s.user_id), '[]'::jsonb)
    ) order by s.role desc, p.full_name)
      from public.bureau_staff s
      join auth.users u on u.id = s.user_id
      left join public.profiles p on p.id = s.user_id
     where s.account_id = p_account and s.status = 'active'), '[]'::jsonb);
end;
$$;

-- Ekip ekranı: kim hesabını kullanmaya başladı (davet bekleyenler)
create or replace function public.team_status(p_company uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Bu bilgiyi yalnızca şirket yöneticisi görebilir.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_object_agg(m.user_id, jsonb_build_object('activated', private.user_activated(m.user_id), 'email', u.email))
                     from public.memberships m join auth.users u on u.id = m.user_id
                    where m.company_id = p_company and m.status = 'active'), '{}'::jsonb);
end;
$$;
revoke all on function public.team_status(uuid) from public, anon;
grant execute on function public.team_status(uuid) to authenticated;

-- Ayrılan kişi bekleyen raporların onaylayıcısı olarak kalmaz: yerine yedek onaylayıcılar (yöneticiler) gelir
create or replace function private.drop_approver(p_company uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r record; v_ids uuid[];
begin
  for r in select id, owner_user_id, current_approver_ids from public.reports
            where company_id = p_company and status = 'pending' and p_user = any (current_approver_ids) for update loop
    v_ids := array_remove(r.current_approver_ids, p_user);
    if cardinality(v_ids) = 0 then
      v_ids := array_remove(array_remove(private.company_admins(p_company), r.owner_user_id), p_user);
    end if;
    update public.reports set current_approver_ids = v_ids where id = r.id;
  end loop;
  update public.cost_centers set owner_user_id = null where company_id = p_company and owner_user_id = p_user;
end;
$$;

-- Ekipten çıkarma: kayıtlar silinmez, üyelik pasif olur (denetim izi tetikleyiciyle tutulur)
create or replace function public.remove_member(p_company uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Ekipten kişiyi yalnızca şirket yöneticisi çıkarabilir.' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'Kendinizi ekipten çıkaramazsınız.' using errcode = 'P0001';
  end if;
  update public.memberships set status = 'inactive' where company_id = p_company and user_id = p_user and status = 'active';
  if not found then raise exception 'Kişi bu şirketin ekibinde değil.' using errcode = 'P0002'; end if;
  -- Ona bağlı çalışanlar onun yöneticisine bağlanır (zincir kopmaz)
  update public.memberships m set manager_user_id = (select x.manager_user_id from public.memberships x
                                                      where x.company_id = p_company and x.user_id = p_user)
   where m.company_id = p_company and m.manager_user_id = p_user;
  perform private.drop_approver(p_company, p_user);
end;
$$;

create or replace function public.bureau_remove_staff(p_account uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_bureau_staff(p_account, true) then
    raise exception 'Büro ekibinden kişiyi yalnızca büro sahibi çıkarabilir.' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'Kendinizi büro ekibinden çıkaramazsınız.' using errcode = 'P0001';
  end if;
  update public.bureau_staff set status = 'inactive' where account_id = p_account and user_id = p_user and role = 'accountant';
  if not found then raise exception 'Kişi büro ekibinde değil.' using errcode = 'P0002'; end if;
  -- Firma atamaları silinmez (pasif kişi zaten erişemez); bekleyen onayları devredilir
  perform private.drop_approver(c.id, p_user) from public.companies c where c.bureau_account_id = p_account;
end;
$$;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
revoke all on function public.bureau_remove_staff(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.bureau_remove_staff(uuid, uuid) to authenticated;

-- Onay ve iade: yalnızca şirkette hâlâ etkin olan kişi (ayrılan kişi bekleyen raporu onaylayamaz)
create or replace function public.approve_report(p_report uuid, p_note text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reports;
  v_me uuid := (select auth.uid());
begin
  select * into r from public.reports where id = p_report for update;
  if not found or r.status <> 'pending' then
    raise exception 'Onay bekleyen bir rapor değil' using errcode = 'P0001';
  end if;
  if r.owner_user_id = v_me then
    raise exception 'Kendi raporunuzu onaylayamazsınız' using errcode = '42501';
  end if;
  if not (v_me = any (r.current_approver_ids)) or not private.is_member(r.company_id) then
    raise exception 'Bu adımın onaylayıcısı değilsiniz' using errcode = '42501';
  end if;
  insert into public.approval_actions (report_id, company_id, step_position, actor_user_id, action, note)
  values (r.id, r.company_id, r.current_step, v_me, 'approved', p_note);
  perform private.advance_report(r.id, r.current_step);
  return (select status from public.reports where id = r.id);
end;
$$;

create or replace function public.return_report(p_report uuid, p_note text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reports;
  v_me uuid := (select auth.uid());
begin
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'İade gerekçesi zorunludur' using errcode = 'P0001';
  end if;
  select * into r from public.reports where id = p_report for update;
  if not found or r.status <> 'pending' then
    raise exception 'Onay bekleyen bir rapor değil' using errcode = 'P0001';
  end if;
  if not (v_me = any (r.current_approver_ids)) or not private.is_member(r.company_id) then
    raise exception 'Bu adımın onaylayıcısı değilsiniz' using errcode = '42501';
  end if;
  insert into public.approval_actions (report_id, company_id, step_position, actor_user_id, action, note)
  values (r.id, r.company_id, r.current_step, v_me, 'returned', p_note);
  update public.reports set status = 'returned', current_step = null, current_approver_ids = '{}'
   where id = r.id;
  return 'returned';
end;
$$;
revoke all on function public.approve_report(uuid, text) from public, anon;
revoke all on function public.return_report(uuid, text) from public, anon;
grant execute on function public.approve_report(uuid, text) to authenticated;
grant execute on function public.return_report(uuid, text) to authenticated;

-- Ayrılan masraf merkezi sorumlusuna da rapor gitmez
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
    select coalesce(array_agg(cc.owner_user_id), '{}') into v_ids
      from public.cost_centers cc join public.memberships m
        on m.company_id = cc.company_id and m.user_id = cc.owner_user_id and m.status = 'active'
     where cc.id = p_report.cost_center_id;
  elsif v_type = 'user' then
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
