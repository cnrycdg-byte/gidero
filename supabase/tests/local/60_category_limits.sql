-- Gider grubu sınırları: kim tanımlar, kullanım hesabı, kim kimi görür
select test.ok((select start_on from private.period_bounds('quarter', '2026-11-15')) = '2026-10-01', '3 aylık dönem çeyreğin başından başlar');
select test.ok((select end_on from private.period_bounds('half', '2026-03-10')) = '2026-06-30', '6 aylık dönem yarıyıl sonunda biter');
select test.ok((select end_on from private.period_bounds('month', '2026-02-10')) = '2026-02-28', 'Aylık dönem ay sonunda biter');

-- E şirketi: kurucu e1 (yönetici+muhasebeci), çalışan e2 (yöneticisi e1)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
set role authenticated;
update public.categories set limit_amount = 1000, limit_period = 'quarter'
 where name = 'Yemek' and company_id = (select id from public.companies where legal_name = 'E Ticaret Ltd');
select test.ok((select limit_amount from public.categories where name = 'Yemek'
                and company_id = (select id from public.companies where legal_name = 'E Ticaret Ltd')) = 1000,
 'Muhasebeci gider grubuna sınır koyar');
select test.expect_error($q$update public.categories set limit_amount = 500 where name = 'Diğer'$q$,
 'Sınır tutarı dönem olmadan girilemez');
reset role;

-- Çalışanın raporuna Yemek masrafı (önceki testte açılan Ekim raporu, 250 TL kategorisiz masraf var)
update public.expenses set category_id = (select id from public.categories where name = 'Yemek'
  and company_id = (select id from public.companies where legal_name = 'E Ticaret Ltd')), doc_date = current_date
 where report_id = '40000000-0000-0000-0000-0000000000e1';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', false);
set role authenticated;
select test.ok((select used from public.category_usage((select id from public.companies where legal_name = 'E Ticaret Ltd'))
                where category_name = 'Yemek' and user_id = '00000000-0000-0000-0000-0000000000e2') = 250,
 'Çalışan kendi kullanımını görür');
select test.ok((select count(*) from public.category_usage((select id from public.companies where legal_name = 'E Ticaret Ltd'))
                where user_id <> '00000000-0000-0000-0000-0000000000e2') = 0, 'Çalışan başkalarının kullanımını görmez');
select test.expect_error($q$select * from public.category_usage((select id from public.companies where legal_name = 'E Ticaret Ltd'),
  '00000000-0000-0000-0000-0000000000e1')$q$, 'Çalışan başka kişinin sınırını sorgulayamaz');
select test.ok(test.affected($q$update public.categories set limit_amount = 99999 where name = 'Yemek'$q$) = 0,
 'Çalışan sınırı değiştiremez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
set role authenticated;
select test.ok((select count(distinct user_id) from public.category_usage((select id from public.companies where legal_name = 'E Ticaret Ltd'))) = 2,
 'Yönetici ve muhasebeci herkesin kullanımını görür');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', false);
set role authenticated;
select test.expect_error($q$select * from public.category_usage((select company_id from public.memberships
  where user_id = '00000000-0000-0000-0000-0000000000e2' limit 1))$q$, 'Başka şirketin kullanıcısı sınırları göremez');
reset role;

select 'SINIR TESTLERİ GEÇTİ' as sonuc;
