-- İki akış: tekil şirkette çizilen onay zinciri, ödendi/arşiv; büro firmasında onaysız kayıt; test müşterileri
reset role;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000ae1', 'ali@x.test'),
 ('00000000-0000-0000-0000-000000000ae2', 'kerem@x.test'),
 ('00000000-0000-0000-0000-000000000ae3', 'selin@x.test'),
 ('00000000-0000-0000-0000-000000000ae4', 'mehmet@x.test'),
 ('00000000-0000-0000-0000-000000000ae5', 'zeynep@x.test'),
 ('00000000-0000-0000-0000-000000000ae6', 'ayse@demo.test'),
 ('00000000-0000-0000-0000-000000000ae7', 'mert@demo.test');
insert into public.profiles (id, full_name) values
 ('00000000-0000-0000-0000-000000000ae1', 'Ali Çelik'), ('00000000-0000-0000-0000-000000000ae2', 'Kerem Ak'),
 ('00000000-0000-0000-0000-000000000ae3', 'Selin Er'), ('00000000-0000-0000-0000-000000000ae4', 'Mehmet Kaya'),
 ('00000000-0000-0000-0000-000000000ae5', 'Zeynep Arslan'), ('00000000-0000-0000-0000-000000000ae6', 'Ayşe Demir'),
 ('00000000-0000-0000-0000-000000000ae7', 'Mert Can')
on conflict (id) do update set full_name = excluded.full_name;
insert into public.accounts (id, kind, name) values ('10000000-0000-0000-0000-000000000ae0', 'company', 'X Lojistik hesabı');
insert into public.subscriptions (account_id, status, trial_ends_at, max_users) values ('10000000-0000-0000-0000-000000000ae0', 'trial', now() + interval '14 days', 20);
insert into public.companies (id, account_id, legal_name, tax_number) values
 ('20000000-0000-0000-0000-000000000ae0', '10000000-0000-0000-0000-000000000ae0', 'X Lojistik', '6000000001');
insert into public.memberships (company_id, user_id, roles, manager_user_id, title, final_approver) values
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae4', '{employee,admin}', null, 'Genel Müdür', false),
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae3', '{employee,approver}', '00000000-0000-0000-0000-000000000ae4', 'GMY', true),
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae2', '{employee,approver}', '00000000-0000-0000-0000-000000000ae3', 'Satış Direktörü', false),
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae1', '{employee}', '00000000-0000-0000-0000-000000000ae2', 'Satış Temsilcisi', false),
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae5', '{employee,accountant}', '00000000-0000-0000-0000-000000000ae4', 'Muhasebe Uzmanı', false);
insert into public.reports (id, company_id, owner_user_id, created_by, title, period) values
 ('50000000-0000-0000-0000-000000000ae1', '20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae1', '00000000-0000-0000-0000-000000000ae1', 'Ali Ekim', '2026-10'),
 ('50000000-0000-0000-0000-000000000ae2', '20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae2', '00000000-0000-0000-0000-000000000ae2', 'Kerem Ekim', '2026-10'),
 ('50000000-0000-0000-0000-000000000ae4', '20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae4', '00000000-0000-0000-0000-000000000ae4', 'Mehmet Ekim', '2026-10');
insert into public.expenses (company_id, report_id, created_by, total) values
 ('20000000-0000-0000-0000-000000000ae0', '50000000-0000-0000-0000-000000000ae1', '00000000-0000-0000-0000-000000000ae1', 500),
 ('20000000-0000-0000-0000-000000000ae0', '50000000-0000-0000-0000-000000000ae2', '00000000-0000-0000-0000-000000000ae2', 700),
 ('20000000-0000-0000-0000-000000000ae0', '50000000-0000-0000-0000-000000000ae4', '00000000-0000-0000-0000-000000000ae4', 900);

-- Zincir: Ali → Kerem → Selin (son onay); Genel Müdür'e çıkmaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae1"}', false);
set role authenticated;
select public.submit_report('50000000-0000-0000-0000-000000000ae1');
reset role;
select test.ok((select jsonb_array_length(flow_snapshot) from public.reports where id = '50000000-0000-0000-0000-000000000ae1') = 2,
 'Satış temsilcisinin raporu iki kademeden geçer ve son onaycıda biter');
select test.ok((select current_approver_ids from public.reports where id = '50000000-0000-0000-0000-000000000ae1') = array['00000000-0000-0000-0000-000000000ae2'::uuid],
 'İlk onay doğrudan yöneticisine gider');
select test.ok((select flow_snapshot -> 0 ->> 'name' from public.reports where id = '50000000-0000-0000-0000-000000000ae1') = 'Satış Direktörü: Kerem Ak',
 'Adımda onaylayanın ünvanı ve adı yazar');

-- Onaylayıcının kendi raporu bir üstüne gider
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae2"}', false);
set role authenticated;
select public.submit_report('50000000-0000-0000-0000-000000000ae2');
select public.approve_report('50000000-0000-0000-0000-000000000ae1', null);
select test.expect_error($q$select public.approve_report('50000000-0000-0000-0000-000000000ae2', null)$q$, 'Onaylayıcı kendi raporunu onaylayamaz');
reset role;
select test.ok((select current_approver_ids from public.reports where id = '50000000-0000-0000-0000-000000000ae2') = array['00000000-0000-0000-0000-000000000ae3'::uuid],
 'Satış Direktörünün raporu bir üstüne (GMY) gider');
select test.ok((select current_approver_ids from public.reports where id = '50000000-0000-0000-0000-000000000ae1') = array['00000000-0000-0000-0000-000000000ae3'::uuid],
 'Onaylanan rapor zincirde bir sonraki kişiye geçer');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae3"}', false);
set role authenticated;
select public.approve_report('50000000-0000-0000-0000-000000000ae1', null);
reset role;
select test.ok((select status from public.reports where id = '50000000-0000-0000-0000-000000000ae1') = 'approved', 'Son onaycı onaylayınca form muhasebeye düşer');
select test.ok(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-000000000ae5'
                       and report_id = '50000000-0000-0000-0000-000000000ae1' and kind = 'ready_for_accounting'),
 'Muhasebeci onaylanan formun bildirimini alır');

-- En tepedeki kişinin raporu başka bir yöneticiye ya da muhasebeye gider
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae4"}', false);
set role authenticated;
select public.submit_report('50000000-0000-0000-0000-000000000ae4');
reset role;
select test.ok((select current_approver_ids from public.reports where id = '50000000-0000-0000-0000-000000000ae4') = array['00000000-0000-0000-0000-000000000ae5'::uuid],
 'Genel Müdürün raporunu (başka yönetici yoksa) muhasebe onaylar');

-- Zincir düzenleme: döngü engellenir, yalnızca yönetici değiştirir
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae4"}', false);
set role authenticated;
select test.expect_error($q$select public.set_manager('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae3', '00000000-0000-0000-0000-000000000ae1')$q$,
 'Kişi kendi altındakinin altına bağlanamaz (döngü)');
select public.set_member_details('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae2', 'Bölge Satış Direktörü', true);
select public.set_manager('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae1', '00000000-0000-0000-0000-000000000ae2');
select test.expect_error($q$select public.set_manager('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', null)$q$,
 'Başka şirketin zinciri değiştirilemez');
reset role;
select test.ok((select title from public.memberships where user_id = '00000000-0000-0000-0000-000000000ae2') = 'Bölge Satış Direktörü',
 'Ünvan değiştirilir');
select test.ok(jsonb_array_length(private.chain_steps('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae1')) = 1,
 'Son onay işareti zinciri kısaltır');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae1"}', false);
set role authenticated;
select test.expect_error($q$select public.set_manager('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae1', null)$q$,
 'Çalışan kendi zincirini değiştiremez');
select test.expect_error($q$select public.mark_paid('20000000-0000-0000-0000-000000000ae0', array['50000000-0000-0000-0000-000000000ae1'::uuid], null)$q$,
 'Çalışan ödendi işaretleyemez');
reset role;

-- Ödendi ve arşiv
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae5"}', false);
set role authenticated;
select test.expect_error($q$select public.mark_paid('20000000-0000-0000-0000-000000000ae0', array['50000000-0000-0000-0000-000000000ae2'::uuid], null)$q$,
 'Onaylanmamış form ödendi işaretlenemez');
select public.mark_exported('20000000-0000-0000-0000-000000000ae0', array['50000000-0000-0000-0000-000000000ae1'::uuid], 'excel');
select test.ok(public.mark_paid('20000000-0000-0000-0000-000000000ae0', array['50000000-0000-0000-0000-000000000ae1'::uuid], 'Havale 28.10') = 1,
 'Muhasebeci aktarılan formu ödendi işaretler');
reset role;
select test.ok((select status = 'paid' and paid_by = '00000000-0000-0000-0000-000000000ae5' from public.reports where id = '50000000-0000-0000-0000-000000000ae1'),
 'Form arşive (ödendi) geçer, kimin işaretlediği saklanır');
select test.ok(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-000000000ae1' and kind = 'paid'),
 'Çalışana ödendi bildirimi gider');

-- Büro firması: büro fişi firma adına girer, onaysız kayda alır; firmaya kimse gerekmez
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', false);
set role authenticated;
insert into public.reports (id, company_id, owner_user_id, created_by, title, period)
values ('50000000-0000-0000-0000-0000000000c9', '20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'C Gıda Ekim', '2026-10');
insert into public.expenses (company_id, report_id, created_by, total)
values ('20000000-0000-0000-0000-00000000000c', '50000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000c2', 300);
select test.ok(public.submit_report('50000000-0000-0000-0000-0000000000c9') = 'approved', 'Büro firma adına girdiği raporu onaysız kayda alır');
select test.expect_error($q$insert into public.reports (company_id, owner_user_id, created_by, title, period) values ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'Kaçak', '2026-10')$q$,
 'Büro, müşterisi olmayan şirkete rapor açamaz');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae1"}', false);
set role authenticated;
select test.expect_error($q$insert into public.reports (company_id, owner_user_id, created_by, title, period) values ('20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000ae1', '00000000-0000-0000-0000-000000000ae1', 'Kaçak', '2026-10')$q$,
 'Başka şirketin çalışanı büro firmasına rapor açamaz');
select test.ok((select count(*) from public.reports where company_id = '20000000-0000-0000-0000-00000000000c') = 0, 'Başka şirketin çalışanı büro firmasının raporlarını göremez');
reset role;

-- Test müşterileri
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
create temp table dm as select public.admin_create_customer('bureau', 'Demo Büro', '7000000099', 'ayse@demo.test', null, 'trial', null, null, current_date + 14, null, null, true) as v;
grant select on dm to authenticated;
select test.expect_error($q$select public.admin_create_customer('company', 'Demo AŞ', '7000000098', 'ali@x.test', null, 'trial', null, null, current_date + 14, null, null, true)$q$,
 'Test müşterisi gerçek bir kullanıcının e-postasıyla açılamaz');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae6"}', false);
set role authenticated;
select public.bureau_add_company((select (v ->> 'account_id')::uuid from dm), 'Demo Müşteri', '7000000097');
select test.ok(jsonb_array_length(public.demo_people()) >= 1, 'Test kişisi test ekranını görür');
reset role;
insert into public.bureau_staff (account_id, user_id, role) values ((select (v ->> 'account_id')::uuid from dm), '00000000-0000-0000-0000-000000000ae7', 'accountant');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae1"}', false);
set role authenticated;
select test.expect_error($q$select public.demo_people()$q$, 'Gerçek kullanıcı test ekranını göremez');
select test.expect_error($q$select public.demo_reset()$q$, 'Gerçek kullanıcı test verilerini silemez');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
create temp table rs as select public.demo_reset() as v;
grant select on rs to authenticated;
reset role;
select test.ok((select jsonb_array_length(v -> 'user_ids') from rs) = 2, 'Sıfırlama yalnızca test kişilerini silinmek üzere döndürür');
select test.ok(not exists (select 1 from public.accounts where is_demo), 'Test müşterileri silinir');
select test.ok(exists (select 1 from public.companies where id = '20000000-0000-0000-0000-000000000ae0'), 'Gerçek şirkete dokunulmaz');
