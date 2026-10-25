-- Muhasebe aktarımı: hesap kodu ayarları, KKEG oranı, aktarım partileri ve kilit.
-- Yevmiye satırları istemcide (muhasebe-aktarim skill'indeki iç format) üretilir; burada yalnızca
-- ayarlar ve "aktarıldı" kilidi tutulur. Aktarılan rapor 'exported' durumuna geçer ve artık düzenlenemez
-- (can_edit_report yalnızca draft/returned/pending/approved durumlarına izin verir).

alter table public.companies
  add column account_personnel text not null default '335' check (account_personnel ~ '^[0-9][0-9.]{0,30}$'),
  add column account_card text not null default '309' check (account_card ~ '^[0-9][0-9.]{0,30}$'),
  add column account_advance text not null default '195' check (account_advance ~ '^[0-9][0-9.]{0,30}$'),
  add column account_cash text not null default '100' check (account_cash ~ '^[0-9][0-9.]{0,30}$'),
  add column account_vat text not null default '191' check (account_vat ~ '^[0-9][0-9.]{0,30}$'),
  add column vat_accounts jsonb not null default '{}'::jsonb,   -- {"10":"191.10","20":"191.20"}; yoksa account_vat
  add column account_kkeg text not null default '689' check (account_kkeg ~ '^[0-9][0-9.]{0,30}$');

-- Binek araç gibi kısıtlı giderlerde kanunen kabul edilmeyen pay (%). Boşsa bölme yapılmaz.
alter table public.categories
  add column kkeg_ratio numeric(5,2) check (kkeg_ratio is null or (kkeg_ratio >= 0 and kkeg_ratio <= 100));

create table public.export_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  format text not null check (format in ('excel', 'luca', 'logo')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  report_ids uuid[] not null,
  expense_count integer not null,
  total numeric(14,2) not null
);
create index export_batches_company_idx on public.export_batches (company_id, created_at desc);
create index export_batches_created_by_idx on public.export_batches (created_by);

alter table public.expenses
  add column exported_at timestamptz,
  add column export_batch_id uuid references public.export_batches (id);
create index expenses_export_batch_idx on public.expenses (export_batch_id);

alter table public.export_batches enable row level security;
create policy export_batches_select on public.export_batches for select to authenticated
  using ((select private.has_any_role(company_id, array['admin','accountant','auditor'])));
-- Yazma yalnızca mark_exported() ile.

create trigger audit_export_batches after insert or update or delete on public.export_batches
  for each row execute function private.audit_row();

-- Muhasebe hesap ayarlarını admin ya da muhasebeci değiştirir (companies tablosunun geri kalanı yalnız admin'de).
create or replace function public.set_accounting_settings(p_company uuid, p_settings jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.companies;
begin
  if not private.has_any_role(p_company, array['admin','accountant']) then
    raise exception 'Hesap ayarlarını yalnızca yönetici ya da muhasebeci değiştirebilir' using errcode = '42501';
  end if;
  select * into v_old from public.companies where id = p_company;
  update public.companies set
    account_personnel = coalesce(nullif(btrim(p_settings ->> 'account_personnel'), ''), account_personnel),
    account_card      = coalesce(nullif(btrim(p_settings ->> 'account_card'), ''), account_card),
    account_advance   = coalesce(nullif(btrim(p_settings ->> 'account_advance'), ''), account_advance),
    account_cash      = coalesce(nullif(btrim(p_settings ->> 'account_cash'), ''), account_cash),
    account_vat       = coalesce(nullif(btrim(p_settings ->> 'account_vat'), ''), account_vat),
    account_kkeg      = coalesce(nullif(btrim(p_settings ->> 'account_kkeg'), ''), account_kkeg),
    vat_accounts      = case when jsonb_typeof(p_settings -> 'vat_accounts') = 'object' then p_settings -> 'vat_accounts' else vat_accounts end,
    accounting_software = coalesce(nullif(p_settings ->> 'accounting_software', ''), accounting_software)
  where id = p_company;
end;
$$;
revoke all on function public.set_accounting_settings(uuid, jsonb) from public, anon;
grant execute on function public.set_accounting_settings(uuid, jsonb) to authenticated;

-- Seçilen raporları aktarıldı olarak işaretler ve kilitler. Yalnızca onaylanmış raporlar aktarılır;
-- daha önce aktarılmış rapor ikinci kez aktarılamaz.
create or replace function public.mark_exported(p_company uuid, p_report_ids uuid[], p_format text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_batch uuid;
  v_bad int;
  v_count int;
  v_total numeric(14,2);
begin
  if not private.has_any_role(p_company, array['admin','accountant']) then
    raise exception 'Aktarımı yalnızca muhasebeci ya da yönetici yapabilir' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_report_ids), 0) = 0 then
    raise exception 'Aktarılacak rapor seçilmedi' using errcode = 'P0001';
  end if;
  select count(*) into v_bad
    from unnest(p_report_ids) as x(id)
    left join public.reports r on r.id = x.id and r.company_id = p_company
   where r.id is null or r.status not in ('approved', 'booked');
  if v_bad > 0 then
    raise exception 'Yalnızca onaylanmış ve henüz aktarılmamış raporlar aktarılabilir (% rapor uygun değil)', v_bad
      using errcode = 'P0001';
  end if;

  select count(*), coalesce(sum(e.total), 0) into v_count, v_total
    from public.expenses e where e.report_id = any (p_report_ids);

  insert into public.export_batches (company_id, format, created_by, report_ids, expense_count, total)
  values (p_company, p_format, v_me, p_report_ids, v_count, v_total)
  returning id into v_batch;

  update public.expenses set exported_at = now(), export_batch_id = v_batch
   where report_id = any (p_report_ids);
  update public.reports set status = 'exported' where id = any (p_report_ids);
  return v_batch;
end;
$$;
revoke all on function public.mark_exported(uuid, uuid[], text) from public, anon;
grant execute on function public.mark_exported(uuid, uuid[], text) to authenticated;
