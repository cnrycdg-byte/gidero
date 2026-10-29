-- Büro, firmasına kendi girişini açar; büro muhasebecisi açamaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', false);
set role authenticated;
select test.expect_error($q$select public.bureau_set_self_service('20000000-0000-0000-0000-00000000000c', true)$q$, 'Büro muhasebecisi firmaya giriş açamaz');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
set role authenticated;
select public.bureau_set_self_service('20000000-0000-0000-0000-00000000000c', true);
reset role;
select test.ok((select self_service from public.companies where id = '20000000-0000-0000-0000-00000000000c'), 'Büro sahibi firmaya kendi girişini açar');
select test.ok(not private.bureau_managed('20000000-0000-0000-0000-00000000000c'), 'Girişi açık firma kendi onay akışını kullanır');
select test.ok(exists (select 1 from public.plans where id = 'buro_3' and max_companies = 3), '3 firmalık büro paketi var');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
set role authenticated;
select public.bureau_set_self_service('20000000-0000-0000-0000-00000000000c', false);
reset role;
-- Girişi açık firmada büronun girdiği kayıt yine onaysız kayda alınır
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
set role authenticated;
select public.bureau_set_self_service('20000000-0000-0000-0000-00000000000c', true);
insert into public.reports (id, company_id, owner_user_id, created_by, title, period)
values ('50000000-0000-0000-0000-0000000055e1', '20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Büro girişi', '2026-10');
insert into public.expenses (company_id, report_id, created_by, total)
values ('20000000-0000-0000-0000-00000000000c', '50000000-0000-0000-0000-0000000055e1', '00000000-0000-0000-0000-0000000000c1', 75);
select test.ok(public.submit_report('50000000-0000-0000-0000-0000000055e1') = 'approved', 'Büronun girdiği kayıt kontrol gerekmeden kayda alınır');
select public.bureau_set_self_service('20000000-0000-0000-0000-00000000000c', false);
reset role;
