-- Hesap ve erişim: geçici şifre, ekipten çıkarma
reset role;
insert into auth.users (id, email, encrypted_password, raw_user_meta_data, last_sign_in_at) values
 ('00000000-0000-0000-0000-00000000aee1', 'gecici@x.test', 'gecici', '{"must_change_password":"true"}', null),
 ('00000000-0000-0000-0000-00000000aee2', 'girdi@x.test', 'gecici', '{"must_change_password":"true"}', now());
insert into public.memberships (company_id, user_id, roles, manager_user_id) values
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000aee1', '{employee}', '00000000-0000-0000-0000-000000000ae5'),
 ('20000000-0000-0000-0000-000000000ae0', '00000000-0000-0000-0000-00000000aee2', '{employee}', null);
select test.ok(not private.user_activated('00000000-0000-0000-0000-00000000aee1'), 'Geçici şifreyle hiç girmemiş kişi davet bekliyor sayılır');
select test.ok(private.user_activated('00000000-0000-0000-0000-00000000aee2'), 'Geçici şifreyle giriş yapmış kişi hesabını kullanıyor sayılır');

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
select test.ok(not exists (select 1 from public.bureau_assignments where user_id = '00000000-0000-0000-0000-0000000000c3'), 'Çıkarılan muhasebecinin firma atamaları kalkar');
