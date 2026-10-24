-- Uygulama kayıt eklerken eklenen satırı geri okur (insert ... returning). RLS buna izin vermeli.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
set role authenticated;
create temp table r_new as
with ins as (
  insert into public.reports (company_id, owner_user_id, created_by, title, period)
  select id, '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Kasım', '2026-11' from public.companies where tax_number = '1234567890' and legal_name = 'E Ticaret Ltd'
  returning id
) select id from ins;
select test.ok((select count(*) from r_new) = 1, 'Kurucu rapor açıp eklenen raporu geri okuyabilir');
create temp table x_new as
with ins as (
  insert into public.expenses (company_id, report_id, created_by, total)
  select (select company_id from public.reports where id = r_new.id), id, '00000000-0000-0000-0000-0000000000e1', 0 from r_new
  returning id
) select id from ins;
select test.ok((select count(*) from x_new) = 1, 'Rapora masraf eklenip geri okunabilir');
reset role;
select 'GERİ OKUMA TESTLERİ GEÇTİ' as sonuc;
