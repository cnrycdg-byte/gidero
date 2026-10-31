-- Yapay zekâ kullanım kaydı: maliyet kayıt anındaki fiyatla yazılır; rapor ve fiyatlar yalnızca Gidero yöneticisine açık
insert into public.ai_usage (company_id, feature, model, input_tokens, output_tokens, expense_id) values
  ('20000000-0000-0000-0000-00000000000a', 'receipt', 'claude-haiku-5-5', 4000, 700, gen_random_uuid()),
  ('20000000-0000-0000-0000-00000000000a', 'receipt', 'claude-sonnet-5-5', 4000, 700, gen_random_uuid()),
  (null, 'site_chat', 'claude-haiku-5-5', 1500, 200, null),
  ('20000000-0000-0000-0000-00000000000b', 'receipt', 'bilinmeyen-model', 1000, 100, gen_random_uuid());
select test.ok((select cost_usd = 0.000750 from public.ai_usage where model = 'claude-haiku-5-5' and feature = 'receipt'), 'Haiku maliyeti fiyat tablosundan hesaplanır');
select test.ok((select cost_usd = 0.015000 from public.ai_usage where model = 'claude-sonnet-5-5'), 'Sonnet maliyeti fiyat tablosundan hesaplanır');
select test.ok((select cost_usd = 0 from public.ai_usage where model = 'bilinmeyen-model'), 'Fiyatı olmayan model sıfır yazılır');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.ok((select count(*) = 0 from public.ai_usage), 'Şirket kullanıcısı kullanım kaydını göremez');
select test.ok((select count(*) = 0 from public.ai_prices), 'Şirket kullanıcısı fiyatları göremez');
select test.expect_error($q$insert into public.ai_usage (feature, model) values ('receipt', 'x')$q$, 'Kullanıcı kullanım kaydı yazamaz');
select test.expect_error($q$select public.admin_ai_usage(30)$q$, 'Yönetici olmayan raporu alamaz');
select test.expect_error($q$select public.admin_set_ai_price('claude-haiku-5-5', 0, 0)$q$, 'Yönetici olmayan fiyat değiştiremez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
set role authenticated;
select test.ok((select count(*) = 0 from public.ai_usage where company_id = '20000000-0000-0000-0000-00000000000b'), 'Başka şirket kendi kaydını bile göremez (yalnızca yönetici)');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select test.ok((select (public.admin_ai_usage(7)->'today'->>'calls')::int = 4), 'Yönetici bugünkü çağrıları görür');
select test.ok((select (public.admin_ai_usage(7)->'month'->>'receipts')::int = 3), 'Okunan fiş sayısı ayrı sayılır');
select test.ok((select jsonb_array_length(public.admin_ai_usage(7)->'daily') = 7), 'Günlük dizi istenen gün sayısı kadar');
select test.ok((select public.admin_ai_usage(7)->'by_company'->0->>'company' = 'A Ltd'), 'En çok kullanan şirket başta');
select public.admin_set_ai_price('claude-haiku-5-5', 0.20, 1.00, 0.02, 0.25);
select public.admin_set_usd_try(51.25);
reset role;
insert into public.ai_usage (feature, model, input_tokens, output_tokens) values ('site_chat', 'claude-haiku-5-5', 1000000, 0);
select test.ok((select cost_usd = 0.200000 from public.ai_usage where input_tokens = 1000000), 'Yeni fiyat yeni kayda uygulanır');
select test.ok((select cost_usd = 0.000750 from public.ai_usage where model = 'claude-haiku-5-5' and feature = 'receipt'), 'Eski kaydın maliyeti değişmez');
select test.ok((select value = '51.25'::jsonb from public.platform_settings where key = 'usd_try'), 'Kur güncellenir');
select test.ok((select count(*) = 2 from public.platform_audit_log where table_name in ('ai_prices', 'platform_settings')), 'Fiyat ve kur değişikliği denetim izine yazılır');
