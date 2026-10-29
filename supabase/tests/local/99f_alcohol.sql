-- Alkollü içki: kullanıcı alanları dolduramaz, muhasebe karar verir, karar beklerken aktarılamaz
reset role;
insert into public.reports (id, company_id, owner_user_id, created_by, title, period, status)
values ('50000000-0000-0000-0000-0000000a1c01', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Alkol', '2026-10', 'draft');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
insert into public.expenses (id, company_id, report_id, created_by, total, alcohol_present, alcohol_decision)
values ('60000000-0000-0000-0000-0000000a1c01', '20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000a1c01', '00000000-0000-0000-0000-0000000000a1', 900, true, 'accepted');
reset role;
select test.ok((select not alcohol_present and alcohol_decision is null from public.expenses where id = '60000000-0000-0000-0000-0000000a1c01'),
 'Çalışan alkol alanlarını kendisi dolduramaz');
-- Okuma sonucu (sunucu) alkolü işaretler
update public.expenses set alcohol_present = true, alcohol_amount = 420, alcohol_items = '{"Efes x2"}' where id = '60000000-0000-0000-0000-0000000a1c01';
select test.check_all();
update public.reports set status = 'approved' where id = '50000000-0000-0000-0000-0000000a1c01';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
set role authenticated;
select test.expect_error($q$select public.decide_alcohol('60000000-0000-0000-0000-0000000a1c01', 'accepted')$q$, 'Muhasebeci olmayan alkol kararı veremez');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', false);
set role authenticated;
select test.expect_error($q$select public.mark_exported('20000000-0000-0000-0000-00000000000a', array['50000000-0000-0000-0000-0000000a1c01'::uuid], 'excel')$q$,
 'Alkol kararı beklerken rapor aktarılamaz');
select public.decide_alcohol('60000000-0000-0000-0000-0000000a1c01', 'rejected');
reset role;
select test.ok((select alcohol_decision = 'rejected' and alcohol_decided_by = '00000000-0000-0000-0000-0000000000a4' from public.expenses where id = '60000000-0000-0000-0000-0000000a1c01'),
 'Muhasebe alkolü reddeder, kimin karar verdiği saklanır');
select test.ok(exists (select 1 from public.expense_flags where expense_id = '60000000-0000-0000-0000-0000000a1c01' and code = 'alcohol_decided'), 'Karar fişte not olarak görünür');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', false);
set role authenticated;
select public.mark_exported('20000000-0000-0000-0000-00000000000a', array['50000000-0000-0000-0000-0000000a1c01'::uuid], 'excel');
select test.expect_error($q$select public.decide_alcohol('60000000-0000-0000-0000-0000000a1c01', 'accepted')$q$, 'Aktarılmış raporda karar değişmez');
reset role;
