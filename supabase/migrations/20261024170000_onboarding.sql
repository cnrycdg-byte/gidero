-- İlk kullanım: yeni kullanıcıya profil açılır, kullanıcı kendi şirketini kurar.
-- Şirketi kuran kişi yönetici + muhasebeci + çalışan rollerini alır; varsayılan kategoriler ve
-- "Yönetici onayı" akışı eklenir. Böylece şirket uygulamayı hemen kullanmaya başlar, sonra ayarlarını değiştirir.

-- Yeni kullanıcı kaydında profil
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Daha önce kaydolmuş kullanıcıların profili
insert into public.profiles (id, full_name)
select u.id, coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), '')
from auth.users u
on conflict (id) do nothing;

-- Şirket kurulumu
create or replace function public.create_company(p_legal_name text, p_tax_number text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(coalesce(p_legal_name, ''));
  v_vkn text := regexp_replace(coalesce(p_tax_number, ''), '\D', '', 'g');
  v_account uuid;
  v_company uuid;
  v_flow uuid;
begin
  if v_uid is null then
    raise exception 'Oturum gerekli.' using errcode = '42501';
  end if;
  if length(v_name) < 2 then
    raise exception 'Şirket adını yazın.' using errcode = '22023';
  end if;
  if v_vkn !~ '^[0-9]{10,11}$' then
    raise exception 'Vergi numarası 10, TC kimlik numarası 11 haneli olmalı.' using errcode = '22023';
  end if;
  -- Kötüye kullanıma karşı: bir kişi en fazla 5 şirket kurabilir
  if (select count(*) from public.memberships m where m.user_id = v_uid and 'admin' = any (m.roles)) >= 5 then
    raise exception 'En fazla 5 şirket kurabilirsiniz. Daha fazlası için bizimle iletişime geçin.' using errcode = 'P0001';
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;

  insert into public.accounts (kind, name) values ('company', v_name) returning id into v_account;
  insert into public.companies (account_id, legal_name, tax_number)
    values (v_account, v_name, v_vkn) returning id into v_company;
  insert into public.memberships (company_id, user_id, roles)
    values (v_company, v_uid, array['employee','admin','accountant']);

  insert into public.categories (company_id, name, expense_account, default_vat_rate, tax_rule, attendees_required) values
    (v_company, 'Yemek',                 '770.01', 10, 'meal',           true),
    (v_company, 'Temsil ve ağırlama',    '770.02', 10, 'representation', true),
    (v_company, 'Konaklama',             '770.03', 10, 'accommodation',  false),
    (v_company, 'Akaryakıt',             '770.04', 20, 'fuel',           false),
    (v_company, 'Araç gideri',           '770.05', 20, 'car_running',    false),
    (v_company, 'Ulaşım (taksi, bilet)', '770.06', 20, 'travel',         false),
    (v_company, 'Kırtasiye ve ofis',     '770.07', 20, 'standard',       false),
    (v_company, 'Diğer',                 '770.99', 20, 'standard',       false);

  insert into public.approval_flows (company_id, name, priority)
    values (v_company, 'Yönetici onayı', 0) returning id into v_flow;
  insert into public.approval_steps (flow_id, company_id, position, name, approver_type)
    values (v_flow, v_company, 0, 'Yönetici', 'manager');

  return v_company;
end;
$$;

revoke all on function public.create_company(text, text) from public, anon;
grant execute on function public.create_company(text, text) to authenticated;

-- Ekibe kişi ekleme: kişi önce uygulamaya kendi e-postasıyla kaydolur, yönetici e-postayla ekler.
-- Yöneticisi belirtilmezse ekleyen kişi yöneticisi olur (masrafını o onaylar).
create or replace function public.add_member(p_company uuid, p_email text, p_roles text[] default array['employee'],
                                             p_manager uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_manager uuid := coalesce(p_manager, (select auth.uid()));
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Kişi eklemek için yönetici olmalısınız.' using errcode = '42501';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Bu e-postayla kayıtlı kullanıcı yok. Önce kişinin Gidero''ya kaydolmasını isteyin.'
      using errcode = 'P0002';
  end if;
  if v_user = v_manager then
    v_manager := null;
  end if;
  if v_manager is not null and not exists (
      select 1 from public.memberships m where m.company_id = p_company and m.user_id = v_manager and m.status = 'active') then
    raise exception 'Seçilen yönetici bu şirkette değil.' using errcode = '22023';
  end if;
  insert into public.memberships (company_id, user_id, roles, manager_user_id)
  values (p_company, v_user, coalesce(p_roles, array['employee']), v_manager)
  on conflict (company_id, user_id) do update
    set roles = excluded.roles, manager_user_id = excluded.manager_user_id, status = 'active';
  return v_user;
end;
$$;

revoke all on function public.add_member(uuid, text, text[], uuid) from public, anon;
grant execute on function public.add_member(uuid, text, text[], uuid) to authenticated;
