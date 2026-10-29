-- Gidero yöneticisi bir firmanın bütün ayarlarını firma sayfasından yönetir (üyesi olmasa da).

-- Şirket kuralı değişince elle karar verilmemiş, aktarılmamış fişler yeni kurala geçer ve notları yenilenir
create or replace function private.reapply_alcohol_policy(p_company uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  create temp table if not exists _alc_changed (id uuid) on commit drop;
  delete from _alc_changed;
  with u as (
    update public.expenses e set alcohol_decided_at = null
     where e.company_id = p_company and e.alcohol_present and e.alcohol_decided_by is null
       and exists (select 1 from public.reports r where r.id = e.report_id and r.status not in ('exported', 'paid'))
    returning e.id
  ) insert into _alc_changed select id from u;
  -- Fişteki alkol notu yeni kurala göre yazılır
  delete from public.expense_flags f using _alc_changed x where f.expense_id = x.id and f.code in ('alcohol', 'alcohol_decided');
  insert into public.expense_flags (expense_id, company_id, code, severity, message)
  select e.id, e.company_id,
         case when e.alcohol_decision is null then 'alcohol' else 'alcohol_decided' end,
         case when e.alcohol_decision is null or e.alcohol_decision = 'rejected' then 'warning' else 'info' end,
         'Fişte alkollü içki var: ' || private.tl(coalesce(e.alcohol_amount, 0)) || '. ' ||
         case e.alcohol_decision
           when 'kkeg' then 'Şirket kuralına göre size ödenir; vergiden düşülmeyen gider (KKEG) olarak yazılır.'
           when 'accepted' then 'Şirket kuralına göre normal gider yazılır.'
           when 'rejected' then 'Şirket kuralına göre bu tutar size ödenmez ve gider yazılmaz.'
           else 'Muhasebe karar verene kadar rapor aktarılmaz; reddedilirse bu tutar size ödenmez.' end
    from public.expenses e join _alc_changed x on x.id = e.id;
end;
$$;

create or replace function public.set_alcohol_policy(p_company uuid, p_policy text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if not private.has_any_role(p_company, array['admin', 'accountant']) then
    raise exception 'Alkol kuralını şirket yöneticisi ya da muhasebeci değiştirebilir.' using errcode = '42501';
  end if;
  if p_policy not in ('reject', 'kkeg', 'expense', 'manual') then
    raise exception 'Geçersiz alkol kuralı.' using errcode = '22023';
  end if;
  select alcohol_policy into v_old from public.companies where id = p_company for update;
  update public.companies set alcohol_policy = p_policy where id = p_company;
  insert into public.audit_log (company_id, table_name, row_id, action, old_data, new_data, actor_user_id)
  values (p_company, 'companies', p_company, 'alcohol_policy',
          jsonb_build_object('alcohol_policy', v_old), jsonb_build_object('alcohol_policy', p_policy), (select auth.uid()));
  perform private.reapply_alcohol_policy(p_company);
end;
$$;

create or replace function public.admin_company(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.require_platform_admin();
  select jsonb_build_object(
    'id', c.id, 'account_id', c.account_id, 'bureau_account_id', c.bureau_account_id,
    'legal_name', c.legal_name, 'tax_number', c.tax_number, 'tax_office', c.tax_office,
    'accounting_software', c.accounting_software, 'alcohol_policy', c.alcohol_policy,
    'okc_vat_policy', c.okc_vat_policy, 'car_kkeg_vat_deductible', c.car_kkeg_vat_deductible,
    'self_service', c.self_service, 'brand_primary', c.brand_primary, 'brand_accent', c.brand_accent,
    'logo_path', c.logo_path,
    'people', (select count(*) from public.memberships m where m.company_id = c.id and m.status = 'active'),
    'payers', (select count(*) from public.memberships m where m.company_id = c.id and m.status = 'active' and 'payer' = any (m.roles)),
    'accountants', (select count(*) from public.memberships m where m.company_id = c.id and m.status = 'active' and 'accountant' = any (m.roles)),
    'reports', (select count(*) from public.reports r where r.company_id = c.id),
    'categories', (select count(*) from public.categories k where k.company_id = c.id and k.active)
  ) into r
  from public.companies c where c.id = p_company;
  if r is null then raise exception 'Firma bulunamadı.' using errcode = 'P0002'; end if;
  return r;
end;
$$;

create or replace function public.admin_set_company(p_company uuid, p_settings jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.companies; v_new public.companies; s jsonb := coalesce(p_settings, '{}'::jsonb);
begin
  perform private.require_platform_admin();
  select * into v_old from public.companies where id = p_company for update;
  if not found then raise exception 'Firma bulunamadı.' using errcode = 'P0002'; end if;
  if s ? 'legal_name' and length(trim(s ->> 'legal_name')) < 2 then
    raise exception 'Unvanı yazın.' using errcode = '22023';
  end if;
  if s ? 'tax_number' and (s ->> 'tax_number') !~ '^[0-9]{10,11}$' then
    raise exception 'Vergi numarası 10, TC kimlik numarası 11 hane olmalı.' using errcode = '22023';
  end if;
  update public.companies set
    legal_name = coalesce(nullif(trim(s ->> 'legal_name'), ''), legal_name),
    tax_number = coalesce(s ->> 'tax_number', tax_number),
    tax_office = case when s ? 'tax_office' then nullif(trim(s ->> 'tax_office'), '') else tax_office end,
    accounting_software = case when s ? 'accounting_software' then nullif(s ->> 'accounting_software', '') else accounting_software end,
    alcohol_policy = coalesce(s ->> 'alcohol_policy', alcohol_policy),
    okc_vat_policy = coalesce(s ->> 'okc_vat_policy', okc_vat_policy),
    car_kkeg_vat_deductible = coalesce((s ->> 'car_kkeg_vat_deductible')::boolean, car_kkeg_vat_deductible),
    self_service = coalesce((s ->> 'self_service')::boolean, self_service)
  where id = p_company returning * into v_new;
  insert into public.audit_log (company_id, table_name, row_id, action, old_data, new_data, actor_user_id)
  values (p_company, 'companies', p_company, 'admin_settings', to_jsonb(v_old), to_jsonb(v_new), (select auth.uid()));
  -- Alkol kuralı değiştiyse bekleyen fişler yeni kurala geçer
  if v_new.alcohol_policy is distinct from v_old.alcohol_policy then
    perform private.reapply_alcohol_policy(p_company);
  end if;
end;
$$;
revoke all on function public.admin_company(uuid) from public, anon;
revoke all on function public.admin_set_company(uuid, jsonb) from public, anon;
grant execute on function public.admin_company(uuid) to authenticated;
grant execute on function public.admin_set_company(uuid, jsonb) to authenticated;
