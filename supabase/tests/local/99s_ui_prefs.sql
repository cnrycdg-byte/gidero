-- Görünüm tercihi: kişi yalnızca kendi tercihini yazar; geçersiz renk ve görünüm reddedilir
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select public.set_ui_prefs('light', '#1e3a8a');
select test.ok((select ui_theme = 'light' and ui_accent = '#1E3A8A' from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'Kişi kendi görünümünü ve rengini kaydeder');
select test.expect_error($q$select public.set_ui_prefs('mor', null)$q$, 'Geçersiz görünüm reddedilir');
select test.expect_error($q$select public.set_ui_prefs('dark', 'kırmızı')$q$, 'Geçersiz renk reddedilir');
select test.expect_error($q$update public.profiles set ui_theme = 'dark' where id = '00000000-0000-0000-0000-0000000000b1'$q$, 'Başkasının tercihi doğrudan değiştirilemez');
reset role;
select test.ok((select ui_theme = 'system' and ui_accent is null from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'Başka şirketteki kişinin tercihi etkilenmez');
