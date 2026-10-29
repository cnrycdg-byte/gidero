-- Ödeme yetkilisi: muhasebe aktarır, yetkili öder, IBAN'ı yalnızca yetkililer görür
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000a9a01', 'odeme@a.test');
insert into public.memberships (company_id, user_id, roles) values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000a9a01', '{payer}');
insert into public.reports (id, company_id, owner_user_id, created_by, title, period, status, approved_at)
values ('50000000-0000-0000-0000-0000000a9a01', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Ödeme', '2026-10', 'draft', null);
insert into public.expenses (company_id, report_id, created_by, total, payment_method)
values ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000a9a01', '00000000-0000-0000-0000-0000000000a1', 700, 'personal'),
       ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000a9a01', '00000000-0000-0000-0000-0000000000a1', 300, 'company_card');
select test.check_all();
update public.reports set status = 'approved', approved_at = now() where id = '50000000-0000-0000-0000-0000000a9a01';

-- IBAN: çalışan kendisi girer; geçersiz IBAN reddedilir; başka çalışan göremez
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$select public.set_member_bank('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'TR000000000000000000000000', 'Ziraat', null)$q$, 'Geçersiz IBAN reddedilir');
select public.set_member_bank('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'TR33 0006 1005 1978 6457 8413 26', 'İş Bankası', 'Ayşe Çalışan');
select test.expect_error($q$select public.set_member_bank('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'TR330006100519786457841326', 'X', null)$q$, 'Çalışan başkasının IBANını değiştiremez');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
set role authenticated;
select test.ok((select count(*) from public.member_bank where user_id = '00000000-0000-0000-0000-0000000000a1') = 0, 'Başka çalışan IBAN göremez');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', false);
set role authenticated;
select test.ok((select count(*) from public.member_bank) = 0, 'Şirket yöneticisi IBAN göremez');
select test.ok(public.member_bank_saved('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1'), 'Yönetici yalnızca IBAN kayıtlı olduğunu görür');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', false);
set role authenticated;
select test.ok((select count(*) from public.member_bank) = 0, 'B şirketi A şirketinin IBANını göremez');
reset role;

-- Aktarılmadan ödeme yetkilisi ödeyemez; muhasebeci aktarır; yetkili öder; çalışana bildirim
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a9a01"}', false);
set role authenticated;
select test.expect_error($q$select public.mark_paid('20000000-0000-0000-0000-00000000000a', array['50000000-0000-0000-0000-0000000a9a01'::uuid])$q$, 'Aktarılmamış raporu ödeme yetkilisi ödeyemez');
select test.expect_error($q$select public.request_payment('20000000-0000-0000-0000-00000000000a', array['50000000-0000-0000-0000-0000000a9a01'::uuid])$q$, 'Ödeme yetkilisi ödemeye aktaramaz');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', false);
set role authenticated;
select test.ok(public.request_payment('20000000-0000-0000-0000-00000000000a', array['50000000-0000-0000-0000-0000000a9a01'::uuid]) = 1, 'Muhasebeci raporu ödemeye aktarır');
reset role;
select test.ok(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000a9a01' and kind = 'payment_needed'), 'Ödeme yetkilisine bildirim gider');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a9a01"}', false);
set role authenticated;
select test.ok((select pay_amount = 700 and iban = 'TR330006100519786457841326' from public.payment_queue('20000000-0000-0000-0000-00000000000a')
                where report_id = '50000000-0000-0000-0000-0000000a9a01'), 'Ödeme ekranında çalışana ödenecek tutar ve IBAN görünür');
select test.ok((select count(*) from public.expenses where report_id = '50000000-0000-0000-0000-0000000a9a01') = 2, 'Ödeme yetkilisi aktarılan raporun fişlerini görür');
select public.mark_paid('20000000-0000-0000-0000-00000000000a', array['50000000-0000-0000-0000-0000000a9a01'::uuid], 'Havale');
reset role;
select test.ok((select status = 'paid' from public.reports where id = '50000000-0000-0000-0000-0000000a9a01'), 'Ödeme yetkilisi ödendi işaretler');
select test.ok(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and kind = 'paid' and report_id = '50000000-0000-0000-0000-0000000a9a01'), 'Raporu oluşturana ödendi bildirimi gider');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a9a01"}', false);
set role authenticated;
select test.ok((select count(*) from public.payment_queue('20000000-0000-0000-0000-00000000000a', true)) >= 1, 'Ödenen rapor arşivde görünür');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$select * from public.payment_queue('20000000-0000-0000-0000-00000000000a')$q$, 'Çalışan ödeme ekranını göremez');
reset role;
