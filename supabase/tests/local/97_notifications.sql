-- Bildirimler: onay akışındaki her adım doğru kişiye bildirim üretir; kimse başkasının bildirimini göremez
reset role;
insert into public.reports (id, company_id, owner_user_id, created_by, title, period)
values ('50000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Bildirim testi', '2026-10'),
       ('50000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'İade testi', '2026-10');
insert into public.expenses (company_id, report_id, created_by, total)
values ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 1234.5),
       ('20000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', 50);

-- Çalışan gönderir → yöneticisi (a2) bildirim alır
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.check_all();
select public.submit_report('50000000-0000-0000-0000-0000000000f1');
select test.check_all();
select public.submit_report('50000000-0000-0000-0000-0000000000f2');
select test.ok((select count(*) from public.notifications where user_id <> '00000000-0000-0000-0000-0000000000a1') = 0, 'Çalışan yöneticisinin bildirimlerini göremez');
select test.expect_error($q$insert into public.notifications (user_id, company_id, kind, title, body) values ('00000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'approved', 'x', 'y')$q$,
 'Kullanıcı başkası adına bildirim oluşturamaz');
reset role;
select test.ok((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a2'
                and report_id = '50000000-0000-0000-0000-0000000000f1' and kind = 'approval_needed') = 1,
 'Rapor onaya gidince yönetici bildirim alır');
select test.ok((select body from public.notifications where report_id = '50000000-0000-0000-0000-0000000000f1' and kind = 'approval_needed') like '%1.234,50 TL',
 'Bildirimde tutar Türkçe biçimde yazılır');

-- Yönetici onaylar → sahibi ve şirket muhasebecisi (a4) bildirim alır
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
set role authenticated;
select test.ok((select count(*) from public.notifications where kind = 'approval_needed') >= 1, 'Yönetici kendi bildirimini görür');
select public.approve_report('50000000-0000-0000-0000-0000000000f1', null);
select public.return_report('50000000-0000-0000-0000-0000000000f2', 'Fatura eksik');
select public.mark_notifications_read();
select test.ok((select count(*) from public.notifications where read_at is null) = 0, 'Yönetici bildirimlerini okundu yapar');
reset role;
select test.ok((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and kind = 'approved' and report_id = '50000000-0000-0000-0000-0000000000f1') = 1,
 'Rapor onaylanınca sahibi bildirim alır');
select test.ok((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a4' and kind = 'ready_for_accounting'
                and report_id = '50000000-0000-0000-0000-0000000000f1') = 1,
 'Onaylanan rapor muhasebeciye bildirilir');
select test.ok((select body from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and kind = 'returned' and report_id = '50000000-0000-0000-0000-0000000000f2') like '%Gerekçe: Fatura eksik',
 'Geri gönderme bildiriminde gerekçe yazar');
select test.ok((select title from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and kind = 'returned' and report_id = '50000000-0000-0000-0000-0000000000f2') = 'Raporunuz geri gönderildi',
 'Bildirim başlığı "geri gönderildi" der');

-- Başka şirket bildirimleri göremez; kullanıcı yalnızca okundu bilgisini değiştirebilir
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', false);
set role authenticated;
select test.ok((select count(*) from public.notifications where company_id = '20000000-0000-0000-0000-00000000000a') = 0, 'B şirketi A şirketinin bildirimlerini göremez');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$update public.notifications set body = 'x' where user_id = '00000000-0000-0000-0000-0000000000a1'$q$,
 'Kullanıcı bildirim metnini değiştiremez');
insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[test]', '00000000-0000-0000-0000-0000000000a1', 'ios');
select test.expect_error($q$insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[x]', '00000000-0000-0000-0000-0000000000a2', 'ios')$q$,
 'Kullanıcı başkası adına bildirim adresi kaydedemez');
reset role;
