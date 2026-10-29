-- Hesap ve erişim: e-posta bildirimi tercihi, geçici şifre (ilk girişte değiştirme zorunlu), ekipten çıkarma.

alter table public.profiles add column email_notifications boolean not null default true;
grant update (full_name, phone, email_notifications) on public.profiles to authenticated;

-- Kişi hesabını kullanmaya başladı mı: kendi şifresini belirlemiş (yöneticinin verdiği geçici şifreyle henüz girmemiş değil)
create or replace function private.user_activated(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select coalesce(u.encrypted_password, '') <> ''
                          and not (coalesce(u.raw_user_meta_data ->> 'must_change_password', '') = 'true' and u.last_sign_in_at is null)
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
  delete from public.bureau_assignments where account_id = p_account and user_id = p_user;
end;
$$;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
revoke all on function public.bureau_remove_staff(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.bureau_remove_staff(uuid, uuid) to authenticated;
