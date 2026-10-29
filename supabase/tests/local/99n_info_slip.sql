-- Bilgi fişi: e-Arşiv onayı olmadan fiş doğru işaretlenemez; onay bilgisi istemciden yazılamaz.
-- Tek fotoğrafta birden çok fiş: sıra numarası fiş sayısını aşamaz.
reset role;
insert into public.reports (id, company_id, owner_user_id, created_by, title, period)
values ('50000000-0000-0000-0000-0000000b1f01', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Bilgi fişi', '2026-12');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
insert into public.expenses (id, company_id, report_id, created_by, total, doc_type, einvoice_confirmed_at, einvoice_confirmed_by)
values ('60000000-0000-0000-0000-0000000b1f01', '20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000b1f01',
        '00000000-0000-0000-0000-0000000000a1', 2400, 'bilgi_fisi', now(), '00000000-0000-0000-0000-0000000000b1');
select test.ok((select einvoice_confirmed_at is null and einvoice_confirmed_by is null from public.expenses where id = '60000000-0000-0000-0000-0000000b1f01'),
  'Fiş eklenirken e-Arşiv onayı istemciden yazılamaz');
select test.expect_error($q$update public.expenses set einvoice_confirmed_at = now(), einvoice_confirmed_by = '00000000-0000-0000-0000-0000000000a1'
 where id = '60000000-0000-0000-0000-0000000b1f01'$q$, 'e-Arşiv onayı doğrudan güncellemeyle yazılamaz');
select test.expect_error($q$select public.check_expense('60000000-0000-0000-0000-0000000b1f01', true)$q$,
  'Bilgi fişi e-Arşiv onayı olmadan doğru işaretlenemez');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
set role authenticated;
select test.expect_error($q$select public.confirm_einvoice('60000000-0000-0000-0000-0000000b1f01', true)$q$,
  'Başka şirketten kişi bilgi fişini onaylayamaz');
select test.ok((select count(*) = 0 from public.expenses where id = '60000000-0000-0000-0000-0000000b1f01'),
  'Başka şirketten kişi bilgi fişini göremez');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select public.confirm_einvoice('60000000-0000-0000-0000-0000000b1f01', true);
select test.ok((select einvoice_confirmed_by = '00000000-0000-0000-0000-0000000000a1' and einvoice_confirmed_at is not null
  from public.expenses where id = '60000000-0000-0000-0000-0000000b1f01'), 'Çalışan e-Arşiv faturasını onaylar; kim ve ne zaman kaydedilir');
select public.check_expense('60000000-0000-0000-0000-0000000b1f01', true);
select test.ok((select checked_at is not null from public.expenses where id = '60000000-0000-0000-0000-0000000b1f01'),
  'Onaydan sonra bilgi fişi doğru işaretlenir');
select public.confirm_einvoice('60000000-0000-0000-0000-0000000b1f01', false);
select test.ok((select einvoice_confirmed_at is null and checked_at is null from public.expenses where id = '60000000-0000-0000-0000-0000000b1f01'),
  'Onay geri alınınca fiş yeniden kontrol beklenir');
select public.confirm_einvoice('60000000-0000-0000-0000-0000000b1f01', true);
update public.expenses set doc_type = 'e_arsiv' where id = '60000000-0000-0000-0000-0000000b1f01';
select test.ok((select einvoice_confirmed_at is null from public.expenses where id = '60000000-0000-0000-0000-0000000b1f01'),
  'Belge türü değişince bilgi fişi onayı düşer');
select test.expect_error($q$select public.confirm_einvoice('60000000-0000-0000-0000-0000000b1f01', true)$q$,
  'Bilgi fişi olmayan belge için e-Arşiv onayı verilmez');

select test.expect_error($q$insert into public.expenses (company_id, report_id, created_by, total, photo_part, photo_parts)
  values ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000b1f01', '00000000-0000-0000-0000-0000000000a1', 10, 3, 2)$q$,
  'Fotoğraftaki sıra, fotoğraftaki fiş sayısını aşamaz');
select test.expect_error($q$insert into public.expenses (company_id, report_id, created_by, total, photo_part, photo_parts)
  values ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000b1f01', '00000000-0000-0000-0000-0000000000a1', 10, 6, 6)$q$,
  'Bir fotoğraftan en çok 5 fiş okunur');
reset role;
