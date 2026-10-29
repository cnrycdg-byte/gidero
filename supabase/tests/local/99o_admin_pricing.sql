-- Gidero yöneticisi fiyatı kademelerle tek işlemde kaydeder; başkası değiştiremez, hatalı kademe reddedilir
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select public.admin_set_pricing('sirket', 320, 260, 3, '[{"min_qty":10,"factor":0.9},{"min_qty":50,"factor":0.75},{"min_qty":200,"factor":0.6}]');
reset role;
select test.ok((select price_monthly = 320 and price_yearly_monthly = 260 and min_seats = 3 from public.plans where id = 'sirket'), 'Paket fiyatı kaydedilir');
select test.ok((select count(*) = 3 from public.price_bands where plan_id = 'sirket'), 'Eski kademeler silinip yenileri yazılır');
select test.ok(private.band_factor('sirket', 60) = 0.75, 'Yeni kademe fiyatı hesaba girer');
select test.ok(exists (select 1 from public.platform_audit_log where table_name = 'price_bands') and exists (select 1 from public.platform_audit_log where table_name = 'plans' and action = 'update'), 'Fiyat ve kademe değişikliği denetim izine yazılır');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select test.expect_error($q$select public.admin_set_pricing('sirket', 320, 260, 3, '[{"min_qty":50,"factor":0.9},{"min_qty":10,"factor":0.8}]')$q$, 'Kademe başlangıçları artan sırada olmalı');
select test.expect_error($q$select public.admin_set_pricing('sirket', 320, 260, 3, '[{"min_qty":10,"factor":0.7},{"min_qty":50,"factor":0.8}]')$q$, 'Adet arttıkça fiyat yükselemez');
select test.expect_error($q$select public.admin_set_pricing('sirket', 200, 260, 3, '[]')$q$, 'Yıllık fiyat aylıktan yüksek olamaz');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$select public.admin_set_pricing('sirket', 1, 1, 1, '[]')$q$, 'Şirket kullanıcısı fiyat değiştiremez');
reset role;
select test.ok((select price_monthly = 320 from public.plans where id = 'sirket'), 'Hatalı denemeler fiyatı bozmaz');
-- Önceki fiyatlara dön (diğer testler etkilenmesin)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select public.admin_set_pricing('sirket', 299, 249, 3, '[{"min_qty":10,"factor":0.92},{"min_qty":25,"factor":0.85},{"min_qty":50,"factor":0.78},{"min_qty":100,"factor":0.70},{"min_qty":250,"factor":0.62}]');
reset role;
