-- Gider grubu ekleme: muhasebeci ekler ve değiştirir, çalışan ekleyemez, başka şirkete eklenemez
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', false);
set role authenticated;
insert into public.categories (company_id, name, expense_account, default_vat_rate, tax_rule, limit_amount, limit_period)
values ('20000000-0000-0000-0000-00000000000a', 'Kargo ve kurye', '770.08', 20, 'standard', 3000, 'month');
select test.ok((select count(*) from public.categories where name = 'Kargo ve kurye') = 1, 'Muhasebeci yeni gider grubu ekler');
select test.ok(test.affected($q$update public.categories set active = false where name = 'Kargo ve kurye'$q$) = 1,
 'Muhasebeci gider grubunu kullanımdan kaldırır');
select test.expect_error($q$insert into public.categories (company_id, name, expense_account)
  values ('20000000-0000-0000-0000-00000000000b', 'Sızma', '770')$q$, 'Muhasebeci başka şirkete gider grubu ekleyemez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$insert into public.categories (company_id, name, expense_account)
  values ('20000000-0000-0000-0000-00000000000a', 'Çalışan grubu', '770')$q$, 'Çalışan gider grubu ekleyemez');
reset role;

select test.ok((select count(*) from public.audit_log where table_name = 'categories'
                and new_data ->> 'name' = 'Kargo ve kurye') >= 2, 'Gider grubu değişiklikleri denetim izine yazılır');

select 'GİDER GRUBU EKLEME TESTLERİ GEÇTİ' as sonuc;
