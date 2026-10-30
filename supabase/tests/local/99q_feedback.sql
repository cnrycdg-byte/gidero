-- Geri bildirim: kişi kendi şirketi adına gönderir, başkasınınkini göremez; yalnızca Gidero yöneticisi listeler
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.ok(public.submit_feedback('idea', 'Fiş listesinde arama olsun', '20000000-0000-0000-0000-00000000000a', 'Raporlarım', 'ios 1.0') > 0, 'Çalışan kendi şirketi adına geri bildirim gönderir');
select test.ok(public.submit_feedback('bug', 'Şirketsiz geri bildirim') > 0, 'Şirket belirtmeden de gönderilir');
select test.expect_error($q$select public.submit_feedback('idea', 'Başka şirket adına', '20000000-0000-0000-0000-00000000000b')$q$, 'Başka şirket adına gönderilemez');
select test.expect_error($q$select public.submit_feedback('idea', '  ')$q$, 'Boş geri bildirim kabul edilmez');
select test.expect_error($q$select public.submit_feedback('spam', 'Bilinmeyen tür')$q$, 'Bilinmeyen tür kabul edilmez');
select test.expect_error($q$insert into public.feedback (user_id, kind, message) values ('00000000-0000-0000-0000-0000000000a1', 'idea', 'doğrudan')$q$, 'Tabloya doğrudan yazılamaz');
select test.ok((select count(*) = 2 from public.feedback), 'Kişi kendi geri bildirimlerini görür');
select test.expect_error($q$select * from public.admin_feedback()$q$, 'Yönetici olmayan listeyi alamaz');
select test.expect_error($q$select public.admin_set_feedback((select min(id) from public.feedback), 'done')$q$, 'Yönetici olmayan durumu değiştiremez');
reset role;

-- B şirketinin kişisi A'nın geri bildirimini görmez
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
set role authenticated;
select test.ok((select count(*) = 0 from public.feedback), 'Başka şirketin kişisi geri bildirimleri göremez');
reset role;

-- Gidero yöneticisi hepsini gönderen ve şirketle birlikte görür, durumunu değiştirir
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select test.ok((select count(*) = 2 from public.admin_feedback()), 'Yönetici bütün geri bildirimleri görür');
select test.ok((select company_name = 'A Ltd' from public.admin_feedback() where message like 'Fiş listesinde%'), 'Şirket adı listede görünür');
select public.admin_set_feedback((select id from public.feedback where message like 'Fiş listesinde%'), 'done', 'Sonraki sürümde');
select test.ok((select count(*) = 1 from public.admin_feedback('new')), 'Tamamlanan yeni listesinden çıkar');
reset role;
