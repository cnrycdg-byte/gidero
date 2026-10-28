-- Test modu, onay şeması düzenleme ve büro ekibi
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
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

