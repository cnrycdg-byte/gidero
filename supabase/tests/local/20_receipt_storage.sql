-- Fiş depolama alanı erişim testleri (10_ testindeki tohum verileri kullanılır)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
insert into public.reports (id, company_id, owner_user_id, created_by, title) values
 ('40000000-0000-0000-0000-0000000000a9','20000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','Kasım');
insert into storage.objects (bucket_id, name) values
 ('receipts', '20000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a9/fis1.jpg');
select test.ok((select count(*) from storage.objects) = 1, 'Çalışan kendi taslak raporuna fiş yükler ve görür');
select test.expect_error($q$insert into storage.objects (bucket_id, name) values
 ('receipts', '20000000-0000-0000-0000-00000000000b/40000000-0000-0000-0000-0000000000b1/sizma.jpg')$q$,
 'Çalışan başka şirketin raporuna fiş yükleyemez');
select test.expect_error($q$insert into storage.objects (bucket_id, name) values
 ('receipts', '20000000-0000-0000-0000-00000000000b/40000000-0000-0000-0000-0000000000a9/yanlis.jpg')$q$,
 'Rapor ile şirket klasörü uyuşmazsa yükleme reddedilir');
select test.expect_error($q$insert into storage.objects (bucket_id, name) values
 ('receipts', '20000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a1/onayli.jpg')$q$,
 'Onaylanmış rapora çalışan fiş ekleyemez');
select test.expect_error($q$insert into storage.objects (bucket_id, name) values ('receipts', 'gecersiz-yol.jpg')$q$,
 'Geçersiz klasör yapısı reddedilir');
select test.ok(public.can_edit_expense((select id from public.expenses where report_id = '40000000-0000-0000-0000-0000000000a1' limit 1)) = false,
 'Onaylanmış raporun masrafı düzenlenemez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
set role authenticated;
select test.ok((select count(*) from storage.objects) = 0, 'B çalışanı A şirketinin fişlerini göremez');
select test.ok(test.affected($q$delete from storage.objects$q$) = 0, 'B çalışanı A şirketinin fişlerini silemez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', false);
set role authenticated;
select test.ok((select count(*) from storage.objects) = 1, 'Muhasebeci şirketin fişlerini görür');
reset role;

select 'FİŞ DEPOLAMA TESTLERİ GEÇTİ' as sonuc;
