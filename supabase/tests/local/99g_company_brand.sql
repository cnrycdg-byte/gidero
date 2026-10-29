-- Şirket markası: yönetici ve Gidero yöneticisi değiştirir; çalışan ve başka şirket değiştiremez
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', false);
set role authenticated;
select public.set_company_brand('20000000-0000-0000-0000-00000000000a', '#c8102e', '#FFB81C', '20000000-0000-0000-0000-00000000000a/logo.png');
select test.ok((select (x ->> 'brand_primary') = '#C8102E' from public.my_workspace() w, jsonb_array_elements(w -> 'companies') x
                where x ->> 'company_id' = '20000000-0000-0000-0000-00000000000a'), 'Yönetici renkleri kaydeder, çalışma alanında görünür');
insert into storage.objects (bucket_id, name) values ('logos', '20000000-0000-0000-0000-00000000000a/logo2.png');
select test.expect_error($q$insert into storage.objects (bucket_id, name) values ('logos', '20000000-0000-0000-0000-00000000000b/logo.png')$q$,
 'Yönetici başka şirketin klasörüne logo yükleyemez');
select test.expect_error($q$select public.set_company_brand('20000000-0000-0000-0000-00000000000a', 'kirmizi', null, null)$q$, 'Geçersiz renk reddedilir');
select test.expect_error($q$select public.set_company_brand('20000000-0000-0000-0000-00000000000a', null, null, '20000000-0000-0000-0000-00000000000b/logo.png')$q$,
 'Başka şirketin logosu bağlanamaz');
select test.expect_error($q$select public.set_company_brand('20000000-0000-0000-0000-00000000000b', '#000000', null, null)$q$,
 'A yöneticisi B şirketinin markasını değiştiremez');
select test.expect_error($q$select public.company_brand('20000000-0000-0000-0000-00000000000b')$q$, 'A yöneticisi B şirketinin markasını göremez');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$select public.set_company_brand('20000000-0000-0000-0000-00000000000a', '#000000', null, null)$q$, 'Çalışan markayı değiştiremez');
select test.expect_error($q$insert into storage.objects (bucket_id, name) values ('logos', '20000000-0000-0000-0000-00000000000a/calisan.png')$q$,
 'Çalışan logo yükleyemez');
select test.ok((public.company_brand('20000000-0000-0000-0000-00000000000a') ->> 'can_edit')::boolean = false, 'Çalışan markayı görür ama düzenleyemez');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select public.set_company_brand('20000000-0000-0000-0000-00000000000b', '#003DA5', null, null);
reset role;
select test.ok((select brand_primary = '#003DA5' from public.companies where id = '20000000-0000-0000-0000-00000000000b'), 'Gidero yöneticisi her şirketin markasını ayarlar');
select test.ok((select count(*) from public.audit_log where table_name = 'companies' and action = 'brand') = 2, 'Marka değişiklikleri denetim izine yazılır');
