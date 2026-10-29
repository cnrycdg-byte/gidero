-- Büro ekibi: büro sahibi muhasebeciyi ad soyad ve e-postayla kendisi açar (önceden kayıt gerekmez),
-- giriş bağlantısını WhatsApp'tan yollar, firmalara sorumlu muhasebeci atar.

create or replace function public.can_manage_bureau(p_account uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_bureau_staff(p_account, true); $$;
revoke all on function public.can_manage_bureau(uuid) from public, anon;
grant execute on function public.can_manage_bureau(uuid) to authenticated;

-- Büro sahibi bu kişiye giriş bağlantısı verebilir mi: kişi bu büronun muhasebecisi, şifre belirlememiş,
-- başka hiçbir şirkete ya da büroya bağlı değil
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
     and not exists (select 1 from auth.users u where u.id = p_user and coalesce(u.encrypted_password, '') <> '');
$$;
revoke all on function public.can_issue_bureau_invite(uuid, uuid) from public, anon;
grant execute on function public.can_issue_bureau_invite(uuid, uuid) to authenticated;

-- Büro ekibi listesi: giriş yapıp şifresini belirlemiş mi (davet bekliyor mu) bilgisiyle
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
      'activated', coalesce(u.encrypted_password, '') <> '',
      'companies', coalesce((select jsonb_agg(a.company_id) from public.bureau_assignments a
                              where a.account_id = s.account_id and a.user_id = s.user_id), '[]'::jsonb)
    ) order by s.role desc, p.full_name)
      from public.bureau_staff s
      join auth.users u on u.id = s.user_id
      left join public.profiles p on p.id = s.user_id
     where s.account_id = p_account and s.status = 'active'), '[]'::jsonb);
end;
$$;
