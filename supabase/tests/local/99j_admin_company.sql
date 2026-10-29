-- Gidero yöneticisi firma ayarlarını değiştirir; şirket yöneticisi bu yolu kullanamaz
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select test.ok((public.admin_company('20000000-0000-0000-0000-00000000000b') ->> 'legal_name') is not null, 'Gidero yöneticisi firmanın ayarlarını görür');
select public.admin_set_company('20000000-0000-0000-0000-00000000000b', '{"alcohol_policy":"reject","tax_office":"Konak","accounting_software":"logo"}');
reset role;
select test.ok((select alcohol_policy = 'reject' and tax_office = 'Konak' and accounting_software = 'logo' from public.companies where id = '20000000-0000-0000-0000-00000000000b'), 'Ayarlar kaydedilir');
select test.ok(exists (select 1 from public.audit_log where table_name = 'companies' and action = 'admin_settings'), 'Değişiklik denetim izine yazılır');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', false);
set role authenticated;
select test.expect_error($q$select public.admin_set_company('20000000-0000-0000-0000-00000000000b', '{"alcohol_policy":"kkeg"}')$q$, 'Şirket yöneticisi Gidero yönetim yolunu kullanamaz');
select test.expect_error($q$select public.admin_company('20000000-0000-0000-0000-00000000000a')$q$, 'Başka şirketin ayarları görünmez');
reset role;
