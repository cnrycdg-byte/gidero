-- Zorunlu görevler: her şirkette (büroya bağlı firmalar hariç) en az bir muhasebeci ve bir ödeme yetkilisi olmalı.
-- Yoksa onaylanan masraf kimse tarafından ödenmez ve süreç tamamlanmaz.
--  1) Şirketi kuran kişi (ve panelden açılan hesabın sahibi) yönetici, muhasebeci ve ödeme yetkilisi olarak başlar.
--  2) Son muhasebeci ya da son ödeme yetkilisi ekipten çıkarılamaz, görevi de kaldırılamaz.
--  3) Eksik görev varsa rapor onaya gönderilemez; hata mesajı kimin ne yapacağını söyler.
--  4) Gidero yöneticisi yeni müşteri açarken muhasebeci ve ödeme yetkilisini de ekleyebilir.

create or replace function private.missing_roles(p_company uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select case
    when (select c.bureau_account_id from public.companies c where c.id = p_company) is not null then '{}'::text[]
    else array_remove(array[
      case when not exists (select 1 from public.memberships m where m.company_id = p_company and m.status = 'active'
                              and 'accountant' = any (m.roles)) then 'accountant' end,
      case when not exists (select 1 from public.memberships m where m.company_id = p_company and m.status = 'active'
                              and 'payer' = any (m.roles)) then 'payer' end
    ], null)
  end;
$$;

-- Uygulama: şirketin eksik görevleri (yalnızca şirketin üyeleri sorabilir)
create or replace function public.company_missing_roles(p_company uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(p_company) and not private.is_platform_admin() then
    raise exception 'Bu şirketin üyesi değilsiniz.' using errcode = '42501';
  end if;
  return private.missing_roles(p_company);
end;
$$;
revoke all on function public.company_missing_roles(uuid) from public, anon;
grant execute on function public.company_missing_roles(uuid) to authenticated;

-- 2) Son muhasebeci / ödeme yetkilisi korunur (şirket silinirken satırlar silinir; bu tetikleyici yalnızca güncellemede çalışır)
create or replace function private.keep_required_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  if (select c.bureau_account_id from public.companies c where c.id = old.company_id) is not null then return new; end if;
  foreach r in array array['accountant', 'payer'] loop
    if old.status = 'active' and r = any (old.roles)
       and (new.status <> 'active' or not (r = any (new.roles)))
       and not exists (select 1 from public.memberships m where m.company_id = old.company_id and m.user_id <> old.user_id
                         and m.status = 'active' and r = any (m.roles)) then
      raise exception '%', case r
        when 'payer' then 'Şirketin tek ödeme yetkilisi bu kişi. Önce başka birine "Ödeme yetkilisi" görevini verin, sonra bu değişikliği yapın.'
        else 'Şirketin tek muhasebecisi bu kişi. Önce başka birine "Muhasebeci" görevini verin, sonra bu değişikliği yapın.' end
        using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;
create trigger memberships_keep_required_roles before update of roles, status on public.memberships
  for each row execute function private.keep_required_roles();

-- 3) Eksik görev varken rapor onaya gönderilemez
create or replace function private.require_roles_on_submit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v text[];
begin
  if new.status = 'pending' and old.status is distinct from 'pending' then
    v := private.missing_roles(new.company_id);
    if 'payer' = any (v) and 'accountant' = any (v) then
      raise exception 'Şirkette muhasebeci ve ödeme yetkilisi tanımlı değil; rapor onaylansa da ödenemez. Şirket yöneticisi Ekip ekranından bu iki görevi vermeli.' using errcode = 'P0001';
    elsif 'payer' = any (v) then
      raise exception 'Şirkette ödeme yetkilisi tanımlı değil; rapor onaylansa da ödenemez. Şirket yöneticisi Ekip ekranından bir kişiye "Ödeme yetkilisi" görevini vermeli.' using errcode = 'P0001';
    elsif 'accountant' = any (v) then
      raise exception 'Şirkette muhasebeci tanımlı değil; onaylanan rapor kontrol edilemez. Şirket yöneticisi Ekip ekranından bir kişiye "Muhasebeci" görevini vermeli.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger reports_require_roles before update of status on public.reports
  for each row execute function private.require_roles_on_submit();

-- 1) Kurucu ve hesap sahibi ödeme yetkilisi olarak da başlar
create or replace function private.attach_owner(p_user uuid, p_account uuid, p_company uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
  if p_company is not null then
    insert into public.memberships (company_id, user_id, roles)
    values (p_company, p_user, array['employee','admin','accountant','payer'])
    on conflict (company_id, user_id) do update set roles = excluded.roles, status = 'active';
  else
    insert into public.bureau_staff (account_id, user_id, role) values (p_account, p_user, 'owner')
    on conflict (account_id, user_id) do update set role = 'owner', status = 'active';
  end if;
end;
$$;

create or replace function private.add_payer_to_founder()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- create_company kurucuyu yönetici + muhasebeci açar; şirketin ilk üyesiyse ödeme yetkilisi de olur
  if 'admin' = any (new.roles) and 'accountant' = any (new.roles) and not ('payer' = any (new.roles))
     and not exists (select 1 from public.memberships m where m.company_id = new.company_id) then
    new.roles := new.roles || array['payer'];
  end if;
  return new;
end;
$$;
create trigger memberships_founder_payer before insert on public.memberships
  for each row execute function private.add_payer_to_founder();

-- Kurucu sonradan başkasını muhasebeci / ödeme yetkilisi yaptıysa kendi görevini bırakabilir (ilk kurulum ekranı)
create or replace function public.drop_my_role(p_company uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('accountant', 'payer') then raise exception 'Bu görev buradan bırakılamaz.' using errcode = 'P0001'; end if;
  update public.memberships set roles = array_remove(roles, p_role)
   where company_id = p_company and user_id = (select auth.uid()) and status = 'active';
end;
$$;
revoke all on function public.drop_my_role(uuid, text) from public, anon;
grant execute on function public.drop_my_role(uuid, text) to authenticated;

-- 4) Gidero yöneticisi, açtığı müşteri şirketine muhasebeci / ödeme yetkilisi ekler (kişi sunucu fonksiyonunda açılır)
create or replace function public.admin_add_member(p_company uuid, p_user uuid, p_roles text[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_r text;
begin
  if not private.is_platform_admin() then raise exception 'Bu işlem yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  if p_roles is null or not (p_roles <@ array['employee','approver','accountant','payer','admin']) then
    raise exception 'Geçersiz görev.' using errcode = 'P0001';
  end if;
  if private.company_is_demo(p_company) and not private.can_join_demo(p_user) then
    raise exception 'Test müşterisine gerçek bir kullanıcı eklenemez; uydurma bir e-posta kullanın.' using errcode = '42501';
  end if;
  select m.user_id into v_owner from public.memberships m
   where m.company_id = p_company and m.status = 'active' and 'admin' = any (m.roles) order by m.created_at limit 1;
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
  insert into public.memberships (company_id, user_id, roles, manager_user_id)
  values (p_company, p_user, array(select distinct unnest(array['employee'] || p_roles)), case when v_owner = p_user then null else v_owner end)
  on conflict (company_id, user_id) do update set roles = array(select distinct unnest(public.memberships.roles || excluded.roles)), status = 'active';
  -- Görevi başkasına verilen hesap sahibi o görevi bırakır (sahip kendisi eklenmediyse)
  if v_owner is not null and v_owner <> p_user then
    foreach v_r in array array['accountant', 'payer'] loop
      if v_r = any (p_roles) then
        update public.memberships set roles = array_remove(roles, v_r) where company_id = p_company and user_id = v_owner;
      end if;
    end loop;
  end if;
  insert into public.platform_audit_log (actor_user_id, table_name, row_id, action, old_data, new_data)
  values ((select auth.uid()), 'memberships', p_company::text || ':' || p_user::text, 'insert', null, to_jsonb(p_roles));
end;
$$;
revoke all on function public.admin_add_member(uuid, uuid, text[]) from public, anon;
grant execute on function public.admin_add_member(uuid, uuid, text[]) to authenticated;
