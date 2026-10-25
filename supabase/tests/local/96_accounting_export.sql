-- Muhasebe aktarımı: hesap ayarları, aktarım kilidi, şirketler arası ayrım
reset role;
insert into public.reports (id, company_id, owner_user_id, created_by, title, period, status)
values ('50000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Aktarım testi', '2026-10', 'approved'),
       ('50000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Taslak', '2026-10', 'draft');
insert into public.expenses (company_id, report_id, created_by, total, description)
values ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 2150.40, 'Akaryakıt'),
       ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', 100, 'Taslak fiş');

-- Çalışan hesap ayarlarını değiştiremez, aktarım yapamaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$select public.set_accounting_settings('20000000-0000-0000-0000-00000000000a', '{"account_personnel":"335.01"}')$q$,
 'Çalışan muhasebe hesap ayarlarını değiştiremez');
select test.expect_error($q$select public.mark_exported('20000000-0000-0000-0000-00000000000a', array['50000000-0000-0000-0000-0000000000e1']::uuid[], 'excel')$q$,
 'Çalışan aktarım yapamaz');
reset role;

-- Muhasebeci ayarları değiştirir ve onaylı raporu aktarır
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', false);
set role authenticated;
select public.set_accounting_settings('20000000-0000-0000-0000-00000000000a', '{"account_personnel":"335.01","vat_accounts":{"20":"191.20"}}');
select test.ok((select account_personnel from public.companies where id = '20000000-0000-0000-0000-00000000000a') = '335.01',
 'Muhasebeci personel hesabını tanımlar');
select test.ok((select vat_accounts ->> '20' from public.companies where id = '20000000-0000-0000-0000-00000000000a') = '191.20',
 'Muhasebeci KDV oranı hesabını tanımlar');
select test.expect_error($q$select public.mark_exported('20000000-0000-0000-0000-00000000000a', array['50000000-0000-0000-0000-0000000000e2']::uuid[], 'excel')$q$,
 'Onaylanmamış rapor aktarılamaz');
select test.expect_error($q$select public.set_accounting_settings('20000000-0000-0000-0000-00000000000b', '{"account_personnel":"335.99"}')$q$,
 'A şirketinin muhasebecisi B şirketinin ayarlarını değiştiremez');
select test.expect_error($q$select public.mark_exported('20000000-0000-0000-0000-00000000000b', array['50000000-0000-0000-0000-0000000000e1']::uuid[], 'excel')$q$,
 'Başka şirket adına aktarım yapılamaz');
select public.mark_exported('20000000-0000-0000-0000-00000000000a', array['50000000-0000-0000-0000-0000000000e1']::uuid[], 'luca');
select test.ok((select status from public.reports where id = '50000000-0000-0000-0000-0000000000e1') = 'exported',
 'Aktarılan rapor kilitlenir');
select test.ok((select count(*) from public.expenses where report_id = '50000000-0000-0000-0000-0000000000e1' and exported_at is not null) = 1,
 'Fişler aktarım partisine bağlanır');
select test.expect_error($q$select public.mark_exported('20000000-0000-0000-0000-00000000000a', array['50000000-0000-0000-0000-0000000000e1']::uuid[], 'excel')$q$,
 'Aynı rapor ikinci kez aktarılamaz');
select test.ok(test.affected($q$update public.expenses set total = 1 where report_id = '50000000-0000-0000-0000-0000000000e1'$q$) = 0,
 'Aktarılmış fiş değiştirilemez');
select test.ok((select count(*) from public.export_batches where company_id = '20000000-0000-0000-0000-00000000000a') = 1,
 'Muhasebeci aktarım geçmişini görür');
reset role;

-- B şirketi A'nın aktarım geçmişini göremez
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', false);
set role authenticated;
select test.ok((select count(*) from public.export_batches) = 0, 'B şirketi A şirketinin aktarımlarını göremez');
reset role;
