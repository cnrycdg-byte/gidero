-- Esnek fiyat: sayı arttıkça birim fiyat düşer, yıllık daha ucuz, büroda firma sayısı pakete yazılır
select test.ok(private.band_factor('sirket_standart', 3) = 1 and private.band_factor('sirket_standart', 30) = 0.85, 'Kişi sayısına göre kademe');
select test.ok((select (q.list_price / q.seats) from private.compute_quote('10000000-0000-0000-0000-00000000000a', 'sirket_standart', 'month', 30, null) q)
               < (select (q.list_price / q.seats) from private.compute_quote('10000000-0000-0000-0000-00000000000a', 'sirket_standart', 'month', 5, null) q),
 'Kişi arttıkça kişi başı fiyat düşer');
select test.ok((select q.list_price from private.compute_quote('10000000-0000-0000-0000-00000000000a', 'sirket_standart', 'year', 10, null) q)
               < (select q.list_price * 12 from private.compute_quote('10000000-0000-0000-0000-00000000000a', 'sirket_standart', 'month', 10, null) q),
 'Yıllık tek ödeme daha ucuz');
select test.ok((select q.seats = 12 from private.compute_quote('10000000-0000-0000-0000-00000000000c', 'buro_esnek', 'month', 12, null) q), 'Büroda firma sayısı seçilir');
select test.ok(jsonb_array_length(public.public_pricing()) >= 4, 'Site için fiyat listesi herkese açık');
select test.ok(not exists (select 1 from public.plans where kind = 'bureau' and active and id <> 'buro_esnek'), 'Büroda yalnızca esnek paket satılır');
