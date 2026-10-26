-- Ekipteki kişinin rollerini ve bağlı olduğu yöneticiyi değiştirme (yalnızca şirket yöneticisi).
create or replace function public.set_member(p_company uuid, p_user uuid, p_roles text[], p_manager uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Ekibi yalnızca şirket yöneticisi düzenleyebilir.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_roles), 0) = 0 then
    raise exception 'Kişiye en az bir rol verin.' using errcode = 'P0001';
  end if;
  if p_manager is not null and p_manager = p_user then
    raise exception 'Kişi kendi yöneticisi olamaz.' using errcode = 'P0001';
  end if;
  if p_manager is not null and not exists (
      select 1 from public.memberships m where m.company_id = p_company and m.user_id = p_manager and m.status = 'active') then
    raise exception 'Seçilen yönetici bu şirkette değil.' using errcode = 'P0001';
  end if;
  if p_user = (select auth.uid()) and not ('admin' = any (p_roles)) then
    raise exception 'Kendi yönetici rolünüzü kaldıramazsınız.' using errcode = 'P0001';
  end if;
  update public.memberships set roles = p_roles, manager_user_id = p_manager
   where company_id = p_company and user_id = p_user and status = 'active';
  if not found then
    raise exception 'Kişi bu şirketin ekibinde değil.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.set_member(uuid, uuid, text[], uuid) from public, anon;
grant execute on function public.set_member(uuid, uuid, text[], uuid) to authenticated;
