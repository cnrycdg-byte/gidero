-- Fiş kontrolü: kontrol edilmeden rapor gönderilemez
reset role;
insert into public.reports (id, company_id, owner_user_id, created_by, title, period)
values ('50000000-0000-0000-0000-0000000c4e01', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Kontrol', '2026-12');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
insert into public.expenses (id, company_id, report_id, created_by, total, checked_at)
values ('60000000-0000-0000-0000-0000000c4e01', '20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000c4e01', '00000000-0000-0000-0000-0000000000a1', 0, now());
select test.ok((select checked_at is null from public.expenses where id = '60000000-0000-0000-0000-0000000c4e01'), 'Fiş eklenirken kontrol edilmiş sayılmaz');
select test.expect_error($q$select public.check_expense('60000000-0000-0000-0000-0000000c4e01', true)$q$, 'Tutarı olmayan fiş doğru işaretlenemez');
update public.expenses set total = 450 where id = '60000000-0000-0000-0000-0000000c4e01';
select test.expect_error($q$select public.submit_report('50000000-0000-0000-0000-0000000c4e01')$q$, 'Kontrol edilmemiş fiş varken rapor gönderilemez');
select test.ok((public.my_approvers('20000000-0000-0000-0000-00000000000a'))::text <> '', 'Rapor açarken onaylayıcılar görünür');
select public.check_expense('60000000-0000-0000-0000-0000000c4e01', true);
select test.ok((select checked_by = '00000000-0000-0000-0000-0000000000a1' from public.expenses where id = '60000000-0000-0000-0000-0000000c4e01'), 'Çalışan fişi doğru işaretler');
update public.expenses set total = 460 where id = '60000000-0000-0000-0000-0000000c4e01';
select test.ok((select checked_at is null from public.expenses where id = '60000000-0000-0000-0000-0000000c4e01'), 'Tutar değişince kontrol yeniden gerekir');
select public.check_expense('60000000-0000-0000-0000-0000000c4e01', true);
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
set role authenticated;
select test.expect_error($q$select public.check_expense('60000000-0000-0000-0000-0000000c4e01', false)$q$, 'Başka şirketten kişi fişi işaretleyemez');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.ok(public.submit_report('50000000-0000-0000-0000-0000000c4e01') = 'pending', 'Bütün fişler kontrol edilince rapor onaya gider');
reset role;
