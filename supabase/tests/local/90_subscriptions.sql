-- Abonelik, paket sınırları, sipariş ve ödeme, platform yöneticisi
insert into private.platform_owner_hashes values (encode(sha256(convert_to('owner@gidero.test', 'UTF8')), 'hex'));
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000f9', 'owner@gidero.test'),
 ('00000000-0000-0000-0000-0000000000b9', 'buro@b.test'),
 ('00000000-0000-0000-0000-0000000000c9', 'calisan@c.test'),
 ('00000000-0000-0000-0000-0000000000d9', 'calisan2@c.test');

-- Platform yöneticisi
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.ok(public.claim_platform_admin() = false, 'Sıradan kullanıcı platform yöneticisi olamaz');
select test.expect_error($q$select * from public.admin_accounts()$q$, 'Sıradan kullanıcı müşteri listesini göremez');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select test.ok(public.claim_platform_admin() = true, 'Sahip e-postası doğrulanmış hesap yönetici olur');
select test.ok((select count(*) from public.admin_accounts()) >= 3, 'Yönetici tüm müşteri hesaplarını görür');
reset role;

-- Büro: deneme 3 firma hakkıyla başlar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b9"}', false);
set role authenticated;
create temp table b_acc as select public.create_bureau('Defter Mali Müşavirlik', '1111111111') as id;
grant select on b_acc to authenticated;
select test.ok((select status from public.subscriptions where account_id = (select id from b_acc)) = 'trial', 'Büro 14 günlük denemeyle açılır');
select public.bureau_add_company((select id from b_acc), 'Firma Bir Ltd', '2000000001');
select public.bureau_add_company((select id from b_acc), 'Firma İki Ltd', '2000000002');
select public.bureau_add_company((select id from b_acc), 'Firma Üç Ltd', '2000000003');
select test.expect_error($q$select public.bureau_add_company((select id from b_acc), 'Firma Dört Ltd', '2000000004')$q$,
 'Deneme paketindeki firma hakkı dolunca yeni firma eklenemez');
select test.ok((select count(*) from public.categories c join public.companies co on co.id = c.company_id
                where co.bureau_account_id = (select id from b_acc)) = 24, 'Müşteri firmalara varsayılan gider grupları açılır');
select test.ok(jsonb_array_length(public.my_workspace() -> 'companies') = 3, 'Büro sahibi müşteri firmalarını çalışma alanında görür');

-- Sipariş: Büro 5 yıllık, %10 kampanya
reset role;
insert into public.campaigns (code, name, discount_type, discount_value, extra_months, plan_ids, billing_periods)
values ('BURO10', 'Büro lansman', 'percent', 10, 2, array['buro_5'], array['year']);
set role authenticated;
select test.ok((public.quote_order((select id from b_acc), 'buro_5', 'year', null, 'buro10') ->> 'net_amount')::numeric = 7992,
 'Yıllık Büro 5: 740 x 12 = 8880, %10 indirimle 7992 TL');
select test.expect_error($q$select public.quote_order((select id from b_acc), 'buro_5', 'month', null, 'BURO10')$q$,
 'Yalnızca yıllık geçerli kampanya aylıkta reddedilir');
select test.expect_error($q$select public.quote_order((select id from b_acc), 'sirket_standart', 'year', 5, null)$q$,
 'Büro hesabına şirket paketi satılamaz');
create temp table o1 as select (public.create_order((select id from b_acc), 'buro_5', 'year', null, 'BURO10', 'card',
  '{"title":"Defter Mali Müşavirlik","tax_number":"1111111111","address":"Alsancak","city":"İzmir","email":"buro@b.test"}')).*;
grant select on o1 to authenticated;
select test.ok((select total from o1) = 9590.40, 'Sipariş tutarı KDV dahil 9590,40 TL');
select test.expect_error($q$select public.complete_card_order((select id from o1), 'x', (select total from o1))$q$,
 'Müşteri kart ödemesini kendisi onaylı işaretleyemez');
reset role;

-- Ödeme sağlayıcısından onay (sunucu)
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select test.ok((public.complete_card_order((select id from o1), 'pay_1', 9590.40)).status = 'paid', 'Doğrulanan kart ödemesi siparişi öder');
select test.ok((select plan_id from public.subscriptions where account_id = (select id from b_acc)) = 'buro_5'
               and (select max_companies from public.subscriptions where account_id = (select id from b_acc)) = 5,
 'Ödeme sonrası Büro 5 paketi ve 5 firma hakkı açılır');
select test.ok((select current_period_end from public.subscriptions where account_id = (select id from b_acc))
               > now() + interval '13 months', 'Yıllık paket + 2 ay kampanya süresi tanımlanır');
select test.ok((select used_count from public.campaigns where code = 'BURO10') = 1, 'Kampanya kullanım sayısı artar');
select test.ok((public.complete_card_order((select id from o1), 'pay_1', 9590.40)).status = 'paid', 'Aynı ödeme bildirimi iki kez gelse de bir kez işlenir');
select test.ok((select current_period_end from public.subscriptions where account_id = (select id from b_acc))
               < now() + interval '15 months', 'Tekrarlanan bildirim süreyi ikinci kez uzatmaz');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b9"}', false);
set role authenticated;
select public.bureau_add_company((select id from b_acc), 'Firma Dört Ltd', '2000000004');
select public.bureau_add_company((select id from b_acc), 'Firma Beş Ltd', '2000000005');
select test.expect_error($q$select public.bureau_add_company((select id from b_acc), 'Firma Altı Ltd', '2000000006')$q$,
 '5 firmalık pakette 6. firma eklenemez');
reset role;

-- Süresi biten hesap yeni rapor açamaz; yönetici elle paket verir
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select public.admin_set_subscription((select account_id from public.companies where legal_name = 'E Ticaret Ltd'),
  null, 'expired', null, null, (current_date - 1), 'Deneme bitti');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', false);
set role authenticated;
select test.expect_error($q$insert into public.reports (company_id, owner_user_id, created_by, title)
  select id, '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', 'Kasım'
  from public.companies where legal_name = 'E Ticaret Ltd'$q$, 'Süresi biten hesapta yeni rapor açılamaz');
select test.ok((select count(*) from public.reports where title = 'Ekim') = 1, 'Süresi biten hesapta eski raporlar görünür');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select public.admin_set_subscription((select account_id from public.companies where legal_name = 'E Ticaret Ltd'),
  'sirket_standart', 'active', 'year', 1, (current_date + 365), 'Telefonla anlaşıldı');
reset role;

-- Kullanıcı sınırı: 1 kullanıcılık şirkette ikinci çalışan eklenemez (onaylayıcı eklenebilir)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
set role authenticated;
select test.ok((select max_users from public.subscriptions where account_id =
  (select account_id from public.companies where legal_name = 'E Ticaret Ltd')) = 3, 'Kullanıcı başı pakette en az koltuk sayısı uygulanır');
select public.add_member((select id from public.companies where legal_name = 'E Ticaret Ltd'), 'calisan@c.test');
select test.expect_error($q$select public.add_member((select id from public.companies where legal_name = 'E Ticaret Ltd'), 'calisan2@c.test')$q$,
 'Çalışan hakkı dolunca yeni çalışan eklenemez');
select public.add_member((select id from public.companies where legal_name = 'E Ticaret Ltd'), 'calisan2@c.test', array['approver']);
select test.ok((select count(*) from public.memberships where user_id = '00000000-0000-0000-0000-0000000000d9') = 1,
 'Onaylayıcı rolü ücretsizdir, sınıra takılmaz');
select test.ok((public.account_status((select account_id from public.companies where legal_name = 'E Ticaret Ltd')) ->> 'users_used')::int = 3,
 'Hesap durumu kullanılan çalışan sayısını gösterir');
reset role;

-- Başka hesaplar birbirinin aboneliğini ve siparişini göremez
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
set role authenticated;
select test.ok((select count(*) from public.orders) = 0, 'Başka hesabın siparişleri görünmez');
select test.ok((select count(*) from public.subscriptions where account_id = (select id from b_acc)) = 0, 'Başka hesabın aboneliği görünmez');
select test.expect_error($q$select public.quote_order((select id from b_acc), 'buro_5', 'year', null, null)$q$,
 'Başka hesap adına sipariş verilemez');
select test.ok((select count(*) from public.campaigns) = 0, 'Müşteri kampanya listesini göremez');
reset role;

select 'ABONELİK TESTLERİ GEÇTİ' as sonuc;
