-- Zorunlu görevler: muhasebeci ve ödeme yetkilisi olmadan rapor gönderilemez; son kişi görevinden çıkarılamaz
reset role;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000b0a1', 'zadmin@x.test'),
 ('00000000-0000-0000-0000-00000000b0a2', 'zcalisan@x.test'),
 ('00000000-0000-0000-0000-00000000b0a3', 'zmuhasebe@x.test');
insert into public.accounts (id, kind, name) values ('10000000-0000-0000-0000-0000000000b0', 'company', 'Z hesabı');
insert into public.subscriptions (account_id, status, trial_ends_at, max_users) values ('10000000-0000-0000-0000-0000000000b0', 'trial', now() + interval '14 days', 20);
insert into public.companies (id, account_id, legal_name, tax_number) values ('20000000-0000-0000-0000-0000000000b0', '10000000-0000-0000-0000-0000000000b0', 'Z Ltd', '6000000099');
insert into public.memberships (company_id, user_id, roles, manager_user_id) values
 ('20000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000b0a1', '{employee,admin}', null),
 ('20000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000b0a2', '{employee}', '00000000-0000-0000-0000-00000000b0a1');
insert into public.reports (id, company_id, owner_user_id, created_by, title, period) values
 ('50000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000b0a2', '00000000-0000-0000-0000-00000000b0a2', 'Z Kasım', '2026-11');
insert into public.expenses (company_id, report_id, created_by, total) values
 ('20000000-0000-0000-0000-0000000000b0', '50000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000b0a2', 300);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0a2"}', false);
set role authenticated;
select test.ok(public.company_missing_roles('20000000-0000-0000-0000-0000000000b0') = array['accountant','payer'], 'Eksik görevler listelenir');
select test.check_all();
select test.expect_error($q$select public.submit_report('50000000-0000-0000-0000-0000000000b1')$q$, 'Muhasebeci ve ödeme yetkilisi yokken rapor gönderilemez');
select test.expect_error($q$select public.admin_add_member('20000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000b0a3', '{accountant,payer}')$q$, 'Şirket kullanıcısı yönetici ekleme yolunu kullanamaz');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$select public.company_missing_roles('20000000-0000-0000-0000-0000000000b0')$q$, 'Başka şirketin kullanıcısı eksik görevleri soramaz');
reset role;

-- Gidero yöneticisi muhasebeci ve ödeme yetkilisini ekler
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select public.admin_add_member('20000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000b0a3', '{accountant,payer}');
reset role;
select test.ok((select roles @> '{employee,accountant,payer}' from public.memberships where user_id = '00000000-0000-0000-0000-00000000b0a3'), 'Eklenen kişi muhasebeci ve ödeme yetkilisi olur');
select test.ok(private.missing_roles('20000000-0000-0000-0000-0000000000b0') = '{}', 'Eksik görev kalmaz');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0a2"}', false);
set role authenticated;
select public.submit_report('50000000-0000-0000-0000-0000000000b1');
reset role;
select test.ok((select status = 'pending' from public.reports where id = '50000000-0000-0000-0000-0000000000b1'), 'Görevler tamamlanınca rapor gönderilir');

-- Son ödeme yetkilisi görevinden ve ekipten çıkarılamaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0a1"}', false);
set role authenticated;
select test.expect_error($q$select public.set_member('20000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000b0a3', '{employee,accountant}', '00000000-0000-0000-0000-00000000b0a1')$q$, 'Tek ödeme yetkilisinin görevi kaldırılamaz');
select test.expect_error($q$select public.remove_member('20000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000b0a3')$q$, 'Tek muhasebeci ve ödeme yetkilisi ekipten çıkarılamaz');
reset role;

-- Şirketi kuran kişi ödeme yetkilisi olarak da başlar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b0a2"}', false);
set role authenticated;
select public.create_company('Yeni Kurulan Ltd', '6000000098');
reset role;
select test.ok((select m.roles @> '{admin,accountant,payer}' from public.memberships m join public.companies c on c.id = m.company_id where c.legal_name = 'Yeni Kurulan Ltd'), 'Kurucu yönetici, muhasebeci ve ödeme yetkilisi olur');
