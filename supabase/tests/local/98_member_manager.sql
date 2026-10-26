-- Ekip düzenleme: rol ve yönetici yalnızca şirket yöneticisi tarafından, yalnızca kendi şirketinde değiştirilir
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.expect_error($q$select public.set_member('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', array['employee','admin'], null)$q$,
 'Çalışan kendine yönetici rolü veremez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', false);
set role authenticated;
select public.set_member('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', array['employee'], '00000000-0000-0000-0000-0000000000a4');
select test.ok((select manager_user_id from public.memberships where company_id = '20000000-0000-0000-0000-00000000000a'
                and user_id = '00000000-0000-0000-0000-0000000000a1') = '00000000-0000-0000-0000-0000000000a4',
 'Şirket yöneticisi çalışanın bağlı olduğu yöneticiyi değiştirir');
select public.set_member('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', array['employee'], '00000000-0000-0000-0000-0000000000a2');
select test.expect_error($q$select public.set_member('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', array['employee'], '00000000-0000-0000-0000-0000000000b1')$q$,
 'Başka şirketten biri yönetici yapılamaz');
select test.expect_error($q$select public.set_member('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', array['employee'], '00000000-0000-0000-0000-0000000000a1')$q$,
 'Kişi kendi yöneticisi olamaz');
select test.expect_error($q$select public.set_member('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', array['employee'], null)$q$,
 'A şirketinin yöneticisi B şirketinin ekibini düzenleyemez');
select test.expect_error($q$select public.set_member('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a3', array['employee'], null)$q$,
 'Yönetici kendi yönetici rolünü kaldıramaz');
reset role;
