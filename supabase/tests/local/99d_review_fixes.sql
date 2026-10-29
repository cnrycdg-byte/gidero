-- İnceleme düzeltmeleri: şifresiz geçiş sınırı, davet bağlantısı sınırı, kendi kendini onaylama yolları
reset role;
insert into auth.users (id, email, encrypted_password) values
 ('00000000-0000-0000-0000-00000000adf1', 'patron@test.gidero.app', null),
 ('00000000-0000-0000-0000-00000000adf2', 'yeni.kisi@x.test', null),
 ('00000000-0000-0000-0000-00000000adf3', 'tek.basina@x.test', 'sifreli'),
 ('00000000-0000-0000-0000-00000000adf4', 'firma.muhasebe@c.test', 'sifreli'),
 ('00000000-0000-0000-0000-00000000adf5', 'sifreli.kisi@x.test', 'sifreli');

create temp table fe as select email from auth.users where id = '00000000-0000-0000-0000-0000000000f9';
grant select on fe to authenticated;
-- 1) Test müşterisi: gerçek kullanıcı ve yönetici eklenemez, geçiş yalnızca yöneticiye ve yalnızca test kişisine
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
create temp table dmc as select public.admin_create_customer('company', 'Test Lojistik', '8000000001', 'patron@test.gidero.app', null, 'trial', null, null, current_date + 14, null, null, true) as v;
grant select on dmc to authenticated;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000adf1"}', false);
set role authenticated;
select test.expect_error(format($f$select public.add_member(%L, 'ali@x.test')$f$, (select v ->> 'company_id' from dmc)),
 'Test müşterisine gerçek bir kullanıcı eklenemez');
select test.expect_error(format($f$select public.add_member(%L, %L)$f$, (select v ->> 'company_id' from dmc),
                                (select email from fe)),
 'Test müşterisine Gidero yöneticisi eklenemez');
select test.ok(public.demo_can_login('00000000-0000-0000-0000-00000000adf1') = false, 'Test kişisi başka birine şifresiz geçemez');
select test.expect_error($q$select public.demo_reset()$q$, 'Test kişisi test verilerini silemez');
reset role;
-- Doğrudan veritabanına eklenmiş gerçek kişi bile listede ve geçişte görünmez
insert into public.memberships (company_id, user_id, roles)
values ((select (v ->> 'company_id')::uuid from dmc), '00000000-0000-0000-0000-000000000ae1', '{employee}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select test.ok(public.demo_can_login('00000000-0000-0000-0000-00000000adf1'), 'Yönetici test kişisine geçebilir');
select test.ok(not public.demo_can_login('00000000-0000-0000-0000-000000000ae1'), 'Gerçek kullanıcıya şifresiz geçilemez');
select test.ok(not public.demo_can_login('00000000-0000-0000-0000-0000000000f9'), 'Yöneticinin kendisine şifresiz geçilemez');
select test.ok(not (public.demo_people()::text like '%000000000ae1%'), 'Gerçek kullanıcı test listesinde görünmez');
reset role;
delete from public.memberships where user_id = '00000000-0000-0000-0000-000000000ae1' and company_id = (select (v ->> 'company_id')::uuid from dmc);

-- 2) Davet bağlantısı: yalnızca şifresi olmayan ve yalnızca yöneticinin şirketlerindeki kişi
insert into public.memberships (company_id, user_id, roles) values
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000adf2', '{employee}'),
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000adf5', '{employee}'),
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-0000000000a1', '{employee}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae4"}', false);
set role authenticated;
select test.ok(public.can_issue_invite('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000adf2'), 'Yönetici kendi eklediği kişiye bağlantı verir');
select test.ok(not public.can_issue_invite('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000adf5'), 'Şifresini belirlemiş kişiye bağlantı verilmez');
select test.ok(not public.can_issue_invite('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-0000000000a1'), 'Başka şirkette de çalışan kişiye bağlantı verilmez');
select test.expect_error($q$select public.invite_target('yeni.kisi@x.test')$q$, 'Kullanıcı davet hedefini sorgulayamaz (yalnızca sunucu)');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae1"}', false);
set role authenticated;
select test.ok(not public.can_issue_invite('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000adf2'), 'Çalışan bağlantı veremez');
reset role;
delete from public.memberships where user_id = '00000000-0000-0000-0000-0000000000a1' and company_id = '20000000-0000-0000-0000-000000000ae0';

-- 3) Tek başına olan şirket sahibinin raporu kendiliğinden onaylanmaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000adf3"}', false);
set role authenticated;
create temp table solo as select public.create_company('Tek Kişilik Ltd', '8000000002') as id;
grant select on solo to authenticated;
insert into public.reports (id, company_id, owner_user_id, created_by, title, period)
values ('50000000-0000-0000-0000-00000000adf3', (select id from solo), '00000000-0000-0000-0000-00000000adf3', '00000000-0000-0000-0000-00000000adf3', 'Kendi', '2026-10');
insert into public.expenses (company_id, report_id, created_by, total)
values ((select id from solo), '50000000-0000-0000-0000-00000000adf3', '00000000-0000-0000-0000-00000000adf3', 100);
select test.expect_error($q$select public.submit_report('50000000-0000-0000-0000-00000000adf3')$q$,
 'Onaylayacak kimse yoksa rapor kendiliğinden onaylanmaz');
reset role;
select test.ok((select status from public.reports where id = '50000000-0000-0000-0000-00000000adf3') = 'draft', 'Rapor taslakta kalır');

-- 4) Büro firmasının kendi muhasebecisi kendi masrafını onaysız kayda alamaz, ödendi yapamaz
insert into public.memberships (company_id, user_id, roles)
values ('20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000adf4', '{employee,accountant}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000adf4"}', false);
set role authenticated;
insert into public.reports (id, company_id, owner_user_id, created_by, title, period)
values ('50000000-0000-0000-0000-00000000adf4', '20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000adf4', '00000000-0000-0000-0000-00000000adf4', 'Kendi', '2026-10');
insert into public.expenses (company_id, report_id, created_by, total)
values ('20000000-0000-0000-0000-00000000000c', '50000000-0000-0000-0000-00000000adf4', '00000000-0000-0000-0000-00000000adf4', 5000);
select test.ok(public.submit_report('50000000-0000-0000-0000-00000000adf4') = 'pending', 'Büro firmasının muhasebecisinin kendi masrafı onaya gider');
reset role;
select test.ok(not (select '00000000-0000-0000-0000-00000000adf4'::uuid = any (current_approver_ids) from public.reports where id = '50000000-0000-0000-0000-00000000adf4'), 'Kendi raporunun onaylayıcısı olmaz');

-- 5) Zincirdeki yönetici ayrıldıysa rapor ona takılmaz
update public.memberships set status = 'inactive' where user_id = '00000000-0000-0000-0000-000000000ae2' and company_id = '20000000-0000-0000-0000-000000000ae0';
insert into public.reports (id, company_id, owner_user_id, created_by, title, period)
values ('50000000-0000-0000-0000-00000000adf6', '20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae1', '00000000-0000-0000-0000-000000000ae1', 'Ali Kasım', '2026-11');
insert into public.expenses (company_id, report_id, created_by, total)
values ('20000000-0000-0000-0000-000000000ae0', '50000000-0000-0000-0000-00000000adf6', '00000000-0000-0000-0000-000000000ae1', 200);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae1"}', false);
set role authenticated;
select public.submit_report('50000000-0000-0000-0000-00000000adf6');
reset role;
select test.ok(not (select '00000000-0000-0000-0000-000000000ae2'::uuid = any (current_approver_ids) from public.reports where id = '50000000-0000-0000-0000-00000000adf6'), 'Ayrılan yöneticiye onay gitmez');
select test.ok(cardinality((select current_approver_ids from public.reports where id = '50000000-0000-0000-0000-00000000adf6')) > 0, 'Rapor başka bir onaylayıcıya gider');

-- Büro ekibi daveti: yalnızca büro sahibi, yalnızca bu büroya bağlı ve şifresiz muhasebeciye
reset role;
insert into auth.users (id, email, encrypted_password) values ('00000000-0000-0000-0000-00000000adf7', 'yeni.muhasebeci@buro.test', null);
insert into public.bureau_staff (account_id, user_id, role) values ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000adf7', 'accountant');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
set role authenticated;
select test.ok(public.can_issue_bureau_invite('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000adf7'), 'Büro sahibi yeni muhasebecisine bağlantı verir');
select test.ok(not public.can_issue_bureau_invite('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c1'), 'Büro sahibine bağlantı verilmez');
select test.ok((select bool_or(not (x ->> 'activated')::boolean) from jsonb_array_elements(public.bureau_team('10000000-0000-0000-0000-00000000000c')) x), 'Ekip listesi davet bekleyeni gösterir');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', false);
set role authenticated;
select test.ok(not public.can_issue_bureau_invite('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000adf7'), 'Büro muhasebecisi bağlantı veremez');
select test.ok(not public.can_manage_bureau('10000000-0000-0000-0000-00000000000c'), 'Büro muhasebecisi büroyu yönetemez');
reset role;
