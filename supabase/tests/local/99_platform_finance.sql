-- Gidero yöneticisi: müşteri ekleme, davet, platform giderleri ve gelir-gider özeti
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$select public.admin_create_customer('company', 'Kaçak AŞ', '9999999991', 'x@y.test', null, 'trial', null, null, current_date + 14, null)$q$,
 'Sıradan kullanıcı müşteri ekleyemez');
select test.expect_error($q$select public.admin_finance(current_date - 30, current_date)$q$, 'Sıradan kullanıcı gelir-gideri göremez');
select test.expect_error($q$insert into public.platform_expenses (spent_on, category, amount) values (current_date, 'diger', 1)$q$,
 'Sıradan kullanıcı platform gideri giremez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
-- Kayıtlı kullanıcıya şirket
create temp table r1 as select public.admin_create_customer('company', 'Panelden AŞ', '7000000001', 'calisan2@c.test',
  'sirket_standart', 'active', 'year', 5, current_date + 365, 'Telefonla satıldı', 14940) as v;
grant select on r1 to authenticated;
select test.ok((select (v ->> 'invited')::boolean from r1) = false, 'Kayıtlı kullanıcıya hesap doğrudan bağlanır');
reset role;
select test.ok((select 'admin' = any (roles) from public.memberships
                where company_id = (select (v ->> 'company_id')::uuid from r1) and user_id = '00000000-0000-0000-0000-0000000000d9'),
 'Hesap sahibi şirketin yöneticisi olur');
select test.ok((select status from public.subscriptions where account_id = (select (v ->> 'account_id')::uuid from r1)) = 'active',
 'Panelden eklenen müşterinin paketi açılır');
select test.ok((select count(*) from public.categories where company_id = (select (v ->> 'company_id')::uuid from r1)) = 8,
 'Panelden eklenen şirkete gider grupları açılır');
set role authenticated;
-- Henüz kayıtlı olmayan kişiye büro: davet
create temp table r2 as select public.admin_create_customer('bureau', 'Yeni Mali Müşavirlik', '7000000002', 'Yeni.Buro@Test.test',
  'buro_5', 'trial', null, null, current_date + 14, null) as v;
grant select on r2 to authenticated;
select test.ok((select (v ->> 'invited')::boolean from r2), 'Kayıtlı olmayan sahibe davet bırakılır');
select test.expect_error($q$select public.admin_create_customer('company', 'Aynı AŞ', '7000000001', 'a@b.test', null, 'trial', null, null, current_date + 14, null)$q$,
 'Aynı vergi numarasıyla ikinci şirket açılamaz');

-- Gelir ve gider
insert into public.platform_expenses (spent_on, category, description, amount, vat_amount)
values (current_date, 'yapay_zeka', 'Anthropic API', 1000, 0), (current_date, 'altyapi', 'Supabase', 500, 100);
reset role;
select test.ok((select total from public.orders where account_id = (select (v ->> 'account_id')::uuid from r1) and payment_method = 'manual') = 17928,
 'Panelden satışın tahsilatı KDV ile gelire işlenir');

-- Davetli kişi kaydolunca büroya bağlanır
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e9', 'yeni.buro@test.test');
select test.ok(exists (select 1 from public.bureau_staff where user_id = '00000000-0000-0000-0000-0000000000e9'
                       and account_id = (select (v ->> 'account_id')::uuid from r2) and role = 'owner'),
 'Davetli kişi kaydolunca büronun sahibi olur');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
create temp table fin as select public.admin_finance(current_date - 31, current_date) as v;
select test.ok((select (v -> 'months' -> -1 ->> 'revenue')::numeric from fin) = (select sum(net_amount) from public.orders where status in ('paid','approved') and coalesce(paid_at, approved_at, created_at)::date between current_date - 31 and current_date and date_trunc('month', coalesce(paid_at, approved_at, created_at)) = date_trunc('month', now())), 'Bu ayın geliri ödenen siparişlerden gelir (KDV hariç)');
select test.ok((select (v -> 'months' -> -1 ->> 'expense')::numeric from fin) = 1500, 'Bu ayın gideri platform giderlerinden gelir');
select test.ok((select (v -> 'months' -> -1 ->> 'profit')::numeric = (v -> 'months' -> -1 ->> 'revenue')::numeric - 1500 from fin), 'Kâr gelir eksi giderdir');
select test.ok((select (v -> 'by_category' ->> 'yapay_zeka')::numeric from fin) = 1000, 'Giderler türüne göre toplanır');
reset role;
