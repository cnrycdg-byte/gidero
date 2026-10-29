-- Alkollü içki: kullanıcı alanları dolduramaz, muhasebe karar verir, karar beklerken aktarılamaz
reset role;
update public.companies set alcohol_policy = 'manual' where id = '20000000-0000-0000-0000-00000000000a';
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

-- Şirket kuralı: varsayılan KKEG; temsil-ağırlamada normal gider; ret kuralında ödenmez
select test.ok((select alcohol_policy from public.companies where id = '20000000-0000-0000-0000-00000000000b') = 'kkeg', 'Varsayılan kural: ödenir, KKEG yazılır');
insert into public.reports (id, company_id, owner_user_id, created_by, title, period)
values ('50000000-0000-0000-0000-0000000a1c02', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Alkol 2', '2026-10');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', false);
set role authenticated;
select public.set_alcohol_policy('20000000-0000-0000-0000-00000000000a', 'kkeg');
reset role;
insert into public.expenses (id, company_id, report_id, created_by, total)
values ('60000000-0000-0000-0000-0000000a1c02', '20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000a1c02', '00000000-0000-0000-0000-0000000000a1', 800);
update public.expenses set alcohol_present = true, alcohol_amount = 300 where id = '60000000-0000-0000-0000-0000000a1c02';
select test.ok((select alcohol_decision = 'kkeg' and alcohol_decided_by is null from public.expenses where id = '60000000-0000-0000-0000-0000000a1c02'), 'Şirket kuralı otomatik uygulanır (KKEG)');
insert into public.categories (id, company_id, name, expense_account, tax_rule)
values ('70000000-0000-0000-0000-0000000a1c01', '20000000-0000-0000-0000-00000000000a', 'Müşteri ağırlama test', '760.01', 'representation');
update public.expenses set category_id = '70000000-0000-0000-0000-0000000a1c01' where id = '60000000-0000-0000-0000-0000000a1c02';
select test.ok((select alcohol_decision = 'accepted' from public.expenses where id = '60000000-0000-0000-0000-0000000a1c02'), 'Temsil-ağırlama grubunda alkol normal gider sayılır');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', false);
set role authenticated;
select public.set_alcohol_policy('20000000-0000-0000-0000-00000000000a', 'reject');
reset role;
select test.ok((select alcohol_decision = 'rejected' from public.expenses where id = '60000000-0000-0000-0000-0000000a1c02'), 'Kural değişince bekleyen fişler yeni kurala geçer');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', false);
set role authenticated;
select public.decide_alcohol('60000000-0000-0000-0000-0000000a1c02', 'kkeg');
reset role;
update public.expenses set category_id = null where id = '60000000-0000-0000-0000-0000000a1c02';
select test.ok((select alcohol_decision = 'kkeg' from public.expenses where id = '60000000-0000-0000-0000-0000000a1c02'), 'Muhasebenin elle verdiği karar kural değişse de kalır');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$select public.set_alcohol_policy('20000000-0000-0000-0000-00000000000a', 'expense')$q$, 'Çalışan alkol kuralını değiştiremez');
reset role;
