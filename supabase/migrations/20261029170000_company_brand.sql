-- Şirket markası: logo ve kurumsal renkler. Şirketin yöneticisi ya da Gidero yöneticisi ayarlar;
-- o şirkette çalışan herkes uygulamayı bu renklerle görür.

alter table public.companies add column brand_primary text check (brand_primary ~ '^#[0-9A-F]{6}$');
alter table public.companies add column brand_accent text check (brand_accent ~ '^#[0-9A-F]{6}$');
alter table public.companies add column logo_path text check (logo_path is null or length(logo_path) <= 200);

-- Logolar herkese açık bir alanda (uygulama girişsiz de gösterebilsin); yalnızca yetkili yükler.
-- SVG kabul edilmez (içine kod gömülebilir).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create or replace function private.can_brand(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_company is not null and (private.is_platform_admin() or private.has_any_role(p_company, array['admin']));
$$;
grant execute on function private.can_brand(uuid) to authenticated;

create policy logos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'logos' and private.can_brand(private.try_uuid((storage.foldername(name))[1]))
);
create policy logos_update on storage.objects for update to authenticated using (
  bucket_id = 'logos' and private.can_brand(private.try_uuid((storage.foldername(name))[1]))
);
create policy logos_delete on storage.objects for delete to authenticated using (
  bucket_id = 'logos' and private.can_brand(private.try_uuid((storage.foldername(name))[1]))
);

-- Marka ekranı için: şirketin adı ve mevcut markası (Gidero yöneticisi üyesi olmadığı şirketi de görür)
create or replace function public.company_brand(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not (private.can_brand(p_company) or private.is_member(p_company)) then
    raise exception 'Bu şirketin markasını göremezsiniz.' using errcode = '42501';
  end if;
  select jsonb_build_object('company_id', c.id, 'legal_name', c.legal_name, 'brand_primary', c.brand_primary,
                            'brand_accent', c.brand_accent, 'logo_path', c.logo_path, 'can_edit', private.can_brand(c.id))
    into r from public.companies c where c.id = p_company;
  return r;
end;
$$;

create or replace function public.set_company_brand(p_company uuid, p_primary text, p_accent text, p_logo_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.companies; v_new public.companies;
  v_primary text := nullif(upper(trim(coalesce(p_primary, ''))), '');
  v_accent text := nullif(upper(trim(coalesce(p_accent, ''))), '');
  v_logo text := nullif(trim(coalesce(p_logo_path, '')), '');
begin
  if not private.can_brand(p_company) then
    raise exception 'Logo ve renkleri yalnızca şirketin yöneticisi değiştirebilir.' using errcode = '42501';
  end if;
  if v_primary is not null and v_primary !~ '^#[0-9A-F]{6}$' then
    raise exception 'Ana renk #1A2B3C biçiminde olmalı.' using errcode = '22023';
  end if;
  if v_accent is not null and v_accent !~ '^#[0-9A-F]{6}$' then
    raise exception 'Vurgu rengi #1A2B3C biçiminde olmalı.' using errcode = '22023';
  end if;
  if v_logo is not null and (v_logo not like p_company::text || '/%' or v_logo like '%..%') then
    raise exception 'Logo bu şirketin klasöründe olmalı.' using errcode = '22023';
  end if;
  select * into v_old from public.companies where id = p_company for update;
  if not found then raise exception 'Şirket bulunamadı.' using errcode = 'P0002'; end if;
  update public.companies set brand_primary = v_primary, brand_accent = v_accent, logo_path = v_logo
   where id = p_company returning * into v_new;
  insert into public.audit_log (company_id, table_name, row_id, action, old_data, new_data, actor_user_id)
  values (p_company, 'companies', p_company, 'brand',
          jsonb_build_object('brand_primary', v_old.brand_primary, 'brand_accent', v_old.brand_accent, 'logo_path', v_old.logo_path),
          jsonb_build_object('brand_primary', v_new.brand_primary, 'brand_accent', v_new.brand_accent, 'logo_path', v_new.logo_path),
          (select auth.uid()));
end;
$$;
revoke all on function public.company_brand(uuid) from public, anon;
revoke all on function public.set_company_brand(uuid, text, text, text) from public, anon;
grant execute on function public.company_brand(uuid) to authenticated;
grant execute on function public.set_company_brand(uuid, text, text, text) to authenticated;

-- Çalışma alanı: her şirketin markası da gelir (giren kişi kendi şirketinin renklerini görür)
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
        'logo_path', c.logo_path
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
