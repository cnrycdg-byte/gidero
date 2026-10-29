-- Hesap ve erişim: geçici şifre, ekipten çıkarma
reset role;
insert into auth.users (id, email, encrypted_password, raw_user_meta_data, last_sign_in_at) values
 ('00000000-0000-0000-0000-00000000aee3', 'sifresiz.girdi@x.test', null, '{}', now()),
 ('00000000-0000-0000-0000-00000000aee1', 'gecici@x.test', 'gecici', '{"must_change_password":"true"}', null),
 ('00000000-0000-0000-0000-00000000aee2', 'girdi@x.test', 'gecici', '{"must_change_password":"true"}', now());
insert into public.memberships (company_id, user_id, roles, manager_user_id) values
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000aee1', '{employee}', '00000000-0000-0000-0000-000000000ae5'),
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000aee2', '{employee}', null);
select test.ok(not private.user_activated('00000000-0000-0000-0000-00000000aee1'), 'Geçici şifreyle hiç girmemiş kişi davet bekliyor sayılır');
select test.ok(private.user_activated('00000000-0000-0000-0000-00000000aee2'), 'Geçici şifreyle giriş yapmış kişi hesabını kullanıyor sayılır');
select test.ok(private.user_activated('00000000-0000-0000-0000-00000000aee3'), 'Davetle girip şifre koymadan çıkan kişi de hesabını kullanıyor sayılır (yönetici şifresine dokunamaz)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae4"}', false);
set role authenticated;
select test.ok(public.can_issue_invite('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000aee1'), 'Yönetici geçici şifresini yeniden belirleyebilir');
select test.ok(not public.can_issue_invite('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000aee2'), 'Giriş yapmış kişinin şifresine dokunulamaz');
select test.ok((public.team_status('20000000-0000-0000-0000-000000000ae0') -> '00000000-0000-0000-0000-00000000aee1' ->> 'activated') = 'false', 'Ekip ekranı davet bekleyeni gösterir');
select public.remove_member('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae5');
select test.expect_error($q$select public.remove_member('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae4')$q$, 'Yönetici kendini çıkaramaz');
select test.expect_error($q$select public.remove_member('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1')$q$, 'Başka şirketin çalışanı çıkarılamaz');
reset role;
select test.ok((select status from public.memberships where company_id = '20000000-0000-0000-0000-000000000ae0' and user_id = '00000000-0000-0000-0000-000000000ae5') = 'inactive', 'Çıkarılan kişi pasif olur, kaydı silinmez');
select test.ok((select manager_user_id from public.memberships where user_id = '00000000-0000-0000-0000-00000000aee1') = '00000000-0000-0000-0000-000000000ae4', 'Ona bağlı kişi onun yöneticisine bağlanır');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae1"}', false);
set role authenticated;
select test.expect_error($q$select public.team_status('20000000-0000-0000-0000-000000000ae0')$q$, 'Çalışan ekip durumunu göremez');
select test.ok(test.affected($q$update public.profiles set full_name = 'Başkası' where id = '00000000-0000-0000-0000-000000000ae2'$q$) = 0, 'Kimse başkasının profilini değiştiremez');
update public.profiles set email_notifications = false where id = '00000000-0000-0000-0000-000000000ae1';
reset role;
select test.ok((select not email_notifications from public.profiles where id = '00000000-0000-0000-0000-000000000ae1'), 'Kişi e-posta bildirimini kapatır');

-- Büro: muhasebeci çıkarma
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', false);
set role authenticated;
select test.expect_error($q$select public.bureau_remove_staff('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c3')$q$, 'Büro muhasebecisi başkasını çıkaramaz');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
set role authenticated;
select public.bureau_remove_staff('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c3');
reset role;
select test.ok((select status from public.bureau_staff where user_id = '00000000-0000-0000-0000-0000000000c3') = 'inactive', 'Çıkarılan muhasebeci pasif olur, atama kayıtları silinmez');

-- Ayrılan onaylayıcı bekleyen raporu onaylayamaz; rapor başka onaylayıcıya geçer
reset role;
insert into public.reports (id, company_id, owner_user_id, created_by, title, period, status, current_step, current_approver_ids, flow_snapshot)
values ('50000000-0000-0000-0000-00000000aee9', '20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae1',
        '00000000-0000-0000-0000-000000000ae1', 'Bekleyen', '2026-11', 'pending', 0, array['00000000-0000-0000-0000-000000000ae3'::uuid],
        '[{"approver_type":"user","approver_user_id":"00000000-0000-0000-0000-000000000ae3","name":"GMY"}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae4"}', false);
set role authenticated;
select public.remove_member('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-000000000ae3');
reset role;
select test.ok(not (select '00000000-0000-0000-0000-000000000ae3'::uuid = any (current_approver_ids) from public.reports where id = '50000000-0000-0000-0000-00000000aee9'),
 'Ayrılan kişi bekleyen raporun onaylayıcısı olmaktan çıkar');
select test.ok((select cardinality(current_approver_ids) > 0 from public.reports where id = '50000000-0000-0000-0000-00000000aee9'), 'Rapor yöneticiye devredilir');
update public.reports set current_approver_ids = array['00000000-0000-0000-0000-000000000ae3'::uuid] where id = '50000000-0000-0000-0000-00000000aee9';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000ae3"}', false);
set role authenticated;
select test.expect_error($q$select public.approve_report('50000000-0000-0000-0000-00000000aee9', null)$q$, 'Ayrılan kişi onay veremez');
select test.expect_error($q$select public.return_report('50000000-0000-0000-0000-00000000aee9', 'x')$q$, 'Ayrılan kişi iade edemez');
reset role;
