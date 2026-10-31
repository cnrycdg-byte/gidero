-- Müşteri bulma: yalnızca Gidero yöneticisi görür ve yönetir; ret listesindeki adrese taslak hazırlanmaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select test.ok((public.admin_upsert_leads('[{"name":"Demir Mali Müşavirlik","city":"İzmir","email":"Info@Demir.com.tr"},{"name":"Ege SMMM","email":"ege@ornek.com","kind":"bureau"},{"name":"Demir kopya","email":"info@demir.com.tr"},{"name":""},{"name":"Bozuk","email":"bozuk-adres"}]')->>'added')::int = 2, 'Firmalar eklenir; kopya, adsız ve bozuk adresli atlanır');
select test.ok((select email = 'info@demir.com.tr' from public.leads where name = 'Demir Mali Müşavirlik'), 'E-posta küçük harfe çevrilir');
select test.ok(public.admin_prepare_sequence(array(select id from public.leads)) = 2, 'İki firma için dizi hazırlanır');
select test.ok((select count(*) = 6 from public.lead_messages where status = 'draft'), 'Her firmaya 3 adım taslak');
select test.ok((select subject like 'Demir Mali Müşavirlik için%' and body like '%İzmir bölgesindeki%' from public.lead_messages m join public.leads l on l.id = m.lead_id where l.name = 'Demir Mali Müşavirlik' and step = 1), 'Şablon alanları doldurulur');
select test.ok((select due_at > now() + interval '2 days' from public.lead_messages m join public.leads l on l.id = m.lead_id where l.name = 'Ege SMMM' and step = 2), 'Takip e-postası 3 gün sonraya planlanır');
select public.admin_update_lead((select id from public.leads where name = 'Ege SMMM'), 'unsubscribed', 'ege@ornek.com', null, null);
select test.ok((select count(*) = 0 from public.lead_messages m join public.leads l on l.id = m.lead_id where l.name = 'Ege SMMM' and m.status = 'draft'), 'Listeden çıkan firmanın taslakları atlanır');
select test.ok((select count(*) = 1 from public.email_optouts where email = 'ege@ornek.com'), 'Çıkan adres kalıcı ret listesine yazılır');
select test.ok((public.admin_upsert_leads('[{"name":"Ege SMMM yeni kayıt","email":"ege@ornek.com"}]')->>'added')::int = 0, 'Ret listesindeki adres yeniden eklenemez');
select test.expect_error($q$select public.admin_set_setting('usd_try', '1')$q$, 'Gönderim dışı ayar buradan değiştirilemez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.ok((select count(*) = 0 from public.leads), 'Şirket kullanıcısı firma listesini göremez');
select test.ok((select count(*) = 0 from public.lead_messages), 'Şirket kullanıcısı e-postaları göremez');
select test.expect_error($q$select public.admin_upsert_leads('[{"name":"X"}]')$q$, 'Şirket kullanıcısı firma ekleyemez');
select test.expect_error($q$select public.lead_unsubscribe(gen_random_uuid())$q$, 'Ret bağlantısı yalnızca sunucudan çağrılır');
reset role;

-- E-postadaki bağlantı (sunucu fonksiyonu) firmayı listeden çıkarır
select test.ok(public.lead_unsubscribe((select unsubscribe_token from public.leads where name = 'Demir Mali Müşavirlik')), 'Ret bağlantısı çalışır');
select test.ok((select status = 'unsubscribed' from public.leads where name = 'Demir Mali Müşavirlik') and exists (select 1 from public.email_optouts where email = 'info@demir.com.tr'), 'Bağlantıyla çıkan firma ret listesine girer');
insert into public.ai_usage (feature, model, input_tokens, output_tokens, web_searches) values ('lead_search', 'claude-haiku-5-5', 0, 0, 3);
select test.ok((select cost_usd = 0.03 from public.ai_usage where feature = 'lead_search'), 'Web araması maliyete girer');
