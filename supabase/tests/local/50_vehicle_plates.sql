-- Kişi kartı plakaları: kim yazabilir, nasıl saklanır, şirketler arası ayrım
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
set role authenticated;
select public.set_member_plates(
  (select id from public.companies where legal_name = 'E Ticaret Ltd'),
  '00000000-0000-0000-0000-0000000000e2', array['35 abc-123', '35ABC123', '06 şk 45']);
select test.ok((select vehicle_plates from public.memberships
                where user_id = '00000000-0000-0000-0000-0000000000e2'
                  and company_id = (select id from public.companies where legal_name = 'E Ticaret Ltd'))
               @> array['35ABC123','06SK45'], 'Plakalar sade biçimde ve tekrarsız saklanır');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', false);
set role authenticated;
select test.expect_error($q$select public.set_member_plates(
  (select id from public.companies where legal_name = 'E Ticaret Ltd'),
  '00000000-0000-0000-0000-0000000000e2', array['34XYZ1'])$q$, 'Çalışan kendi kartına plaka ekleyemez');
select test.ok(test.affected($q$update public.memberships set vehicle_plates = array['34XYZ1']
  where user_id = '00000000-0000-0000-0000-0000000000e2'$q$) = 0, 'Çalışan üyelik satırından da plaka değiştiremez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', false);
set role authenticated;
select test.expect_error($q$select public.set_member_plates(
  (select company_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000e2' limit 1),
  '00000000-0000-0000-0000-0000000000e2', array['34XYZ1'])$q$, 'Başka şirketin kullanıcısı plaka yazamaz');
reset role;

select 'PLAKA TESTLERİ GEÇTİ' as sonuc;
