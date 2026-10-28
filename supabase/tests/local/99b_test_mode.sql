-- Test modu, onay şeması düzenleme ve büro ekibi
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000de1', 'gidero.demo.buro@example.com'),
 ('00000000-0000-0000-0000-000000000de2', 'gidero.demo.patron@example.com'),
 ('00000000-0000-0000-0000-000000000de3', 'gidero.demo.calisan@example.com');
insert into public.demo_users (user_id, persona, email, full_name) values
 ('00000000-0000-0000-0000-000000000de1', 'buro_sahibi', 'gidero.demo.buro@example.com', 'Ayşe'),
 ('00000000-0000-0000-0000-000000000de2', 'sirket_yonetici', 'gidero.demo.patron@example.com', 'Mehmet'),
 ('00000000-0000-0000-0000-000000000de3', 'calisan', 'gidero.demo.calisan@example.com', 'Ali');

-- Sıradan kullanıcı deneme kişilerini göremez, sıfırlayamaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.ok((select count(*) from public.demo_users) = 0, 'Sıradan kullanıcı deneme kişilerini göremez');
select test.expect_error($q$select public.demo_reset()$q$, 'Sıradan kullanıcı test verilerini sıfırlayamaz');
select test.expect_error($q$insert into public.demo_users (user_id, persona, email) values ('00000000-0000-0000-0000-0000000000a1', 'x_y', 'a@b.test')$q$,
 'Kimse kendini deneme kişisi yapamaz');
-- Onay şeması: çalışan değiştiremez
select test.expect_error($q$select public.set_approval_steps('20000000-0000-0000-0000-00000000000a', '[{"approver_type":"manager"}]')$q$,
 'Çalışan onay şemasını değiştiremez');
reset role;

-- Şirket yöneticisi onay şemasını kurar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', false);
set role authenticated;
select public.set_approval_steps('20000000-0000-0000-0000-00000000000a',
  '[{"approver_type":"manager","name":"Bölge müdürü"},{"approver_type":"role","approver_role":"admin","min_total":"5000"},{"approver_type":"user","approver_user_id":"00000000-0000-0000-0000-0000000000a4"}]');
select test.ok((select count(*) from public.approval_steps where company_id = '20000000-0000-0000-0000-00000000000a') = 3,
 'Onay şeması üç adımla kaydedilir');
select test.ok((select min_total from public.approval_steps where company_id = '20000000-0000-0000-0000-00000000000a' and position = 1) = 5000,
 'Adıma tutar koşulu yazılır');
select test.expect_error($q$select public.set_approval_steps('20000000-0000-0000-0000-00000000000a', '[{"approver_type":"user","approver_user_id":"00000000-0000-0000-0000-0000000000b1"}]')$q$,
 'Başka şirketten biri onaylayıcı seçilemez');
select test.expect_error($q$select public.set_approval_steps('20000000-0000-0000-0000-00000000000b', '[{"approver_type":"manager"}]')$q$,
 'A şirketinin yöneticisi B şirketinin onay şemasını değiştiremez');
select test.expect_error($q$select public.set_approval_steps('20000000-0000-0000-0000-00000000000a', '[{"approver_type":"role","approver_role":"employee"}]')$q$,
 'Geçersiz rol seçilemez');
select test.ok((select count(*) from public.approval_steps where company_id = '20000000-0000-0000-0000-00000000000a') = 3,
 'Hatalı kayıt eski şemayı bozmaz');
reset role;

-- Büro ekibi
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', false);
set role authenticated;
select test.expect_error($q$select public.bureau_add_staff('10000000-0000-0000-0000-00000000000c', 'b_emp@b.test')$q$,
 'Büro muhasebecisi büroya kişi ekleyemez');
select test.ok(jsonb_array_length(public.bureau_team('10000000-0000-0000-0000-00000000000c')) = 3, 'Büro personeli ekibi görür');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
set role authenticated;
select test.expect_error($q$select public.bureau_team('10000000-0000-0000-0000-00000000000c')$q$, 'Başkası büronun ekibini göremez');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
set role authenticated;
select public.bureau_assign('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c3', '20000000-0000-0000-0000-00000000000c', true);
select test.expect_error($q$select public.bureau_assign('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c3', '20000000-0000-0000-0000-00000000000a', true)$q$,
 'Büro, müşterisi olmayan firmaya atama yapamaz');
select test.expect_error($q$select public.bureau_assign('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000c', true)$q$,
 'Büro ekibinde olmayan kişi atanamaz');
reset role;
select test.ok(exists (select 1 from public.bureau_assignments where user_id = '00000000-0000-0000-0000-0000000000c3'
                       and company_id = '20000000-0000-0000-0000-00000000000c'), 'Büro sahibi muhasebeciyi firmaya atar');
select test.ok(private.company_admins('20000000-0000-0000-0000-00000000000c') = array['00000000-0000-0000-0000-0000000000c1'::uuid],
 'Müşteri firmada yönetici yoksa büro sahibi onaylar');
select test.ok('00000000-0000-0000-0000-0000000000c1'::uuid in (select private.company_accountants('20000000-0000-0000-0000-00000000000c')),
 'Büro sahibi müşteri firmanın muhasebe bildirimlerini alır');

-- Deneme kişileri kendi verilerini kurar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000de1"}', false);
set role authenticated;
select test.ok((select count(*) from public.demo_users) = 3, 'Deneme kişisi diğer deneme kişilerini görür');
create temp table demo_b as select public.create_bureau('Demo Mali Müşavirlik', '5000000001') as id;
grant select on demo_b to authenticated;
select public.bureau_add_company((select id from demo_b), 'Demo Müşteri Ltd', '5000000011');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000de2"}', false);
set role authenticated;
create temp table demo_c as select public.create_company('Demo Patron AŞ', '5000000002') as id;
grant select on demo_c to authenticated;
select public.add_member((select id from demo_c), 'gidero.demo.calisan@example.com', array['employee'], null);
reset role;
-- Gerçek bir şirkete eklenmiş deneme kişisi o şirketi deneme verisi yapmaz
insert into public.memberships (company_id, user_id, roles) values
 ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000de3', '{employee}');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select test.ok((select (public.demo_reset() ->> 'accounts')::int) = 2, 'Sıfırlama yalnızca deneme hesaplarını siler');
reset role;
select test.ok(not exists (select 1 from public.companies where tax_number in ('5000000001', '5000000011', '5000000002')),
 'Deneme şirketleri ve büro müşterileri silinir');
select test.ok(exists (select 1 from public.companies where id = '20000000-0000-0000-0000-00000000000b'), 'Gerçek şirket silinmez');
select test.ok(exists (select 1 from public.demo_users where persona = 'calisan'), 'Deneme kişileri kalır, yeniden kullanılır');
