-- Test müşterisinde yönetici, test kişisinin şifresini (o kişiye daha önce geçilmiş olsa da) yeniden belirleyebilir.
-- Gerçek müşterilerde kural aynı: yalnızca hiç giriş yapmamış kişi.
create or replace function public.can_issue_invite(p_company uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_any_role(p_company, array['admin'])
     and exists (select 1 from public.memberships m where m.company_id = p_company and m.user_id = p_user and m.status = 'active')
     and not exists (select 1 from public.memberships m where m.user_id = p_user and not private.has_any_role(m.company_id, array['admin']))
     and not exists (select 1 from public.bureau_staff s where s.user_id = p_user)
     and not exists (select 1 from public.platform_admins pa where pa.user_id = p_user)
     and (not private.user_activated(p_user)
          or (private.company_is_demo(p_company) and p_user in (select private.demo_user_ids())));
$$;

-- Ekip ekranı: kim hesabını kullanıyor, kime bağlantı ya da geçici şifre verilebilir
create or replace function public.team_status(p_company uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Bu bilgiyi yalnızca şirket yöneticisi görebilir.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_object_agg(m.user_id, jsonb_build_object(
                     'activated', private.user_activated(m.user_id),
                     'can_invite', public.can_issue_invite(p_company, m.user_id),
                     'email', u.email))
                     from public.memberships m join auth.users u on u.id = m.user_id
                    where m.company_id = p_company and m.status = 'active'), '{}'::jsonb);
end;
$$;
