-- Kişi rehberi: herkes yalnızca kendi rehberini görür
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.ok(public.remember_contacts('20000000-0000-0000-0000-00000000000a',
  '[{"full_name":"Ayşe Demir","org_name":"ABC Ltd"},{"full_name":"Mehmet Kaya","org_name":""},{"full_name":"x"}]') = 2,
  'Kişiler rehbere eklenir, geçersiz ad atlanır');
select public.remember_contacts('20000000-0000-0000-0000-00000000000a', '[{"full_name":"ayşe demir","org_name":"abc ltd"}]');
select test.ok((select use_count from public.contacts where full_name = 'Ayşe Demir') = 2, 'Aynı kişi tekrar kullanılınca sayaç artar');
select test.ok((select count(*) from public.contacts) = 2, 'Çalışan kendi rehberini görür');
select test.expect_error($q$select public.remember_contacts('20000000-0000-0000-0000-00000000000b', '[{"full_name":"Sızma"}]')$q$,
  'Üyesi olmadığı şirkette rehber tutulamaz');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
set role authenticated;
select test.ok((select count(*) from public.contacts) = 0, 'Aynı şirketteki başka kişi (yöneticisi bile) rehberi göremez');
select test.ok(test.affected($q$delete from public.contacts$q$) = 0, 'Başkasının rehberi silinemez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
set role authenticated;
select test.ok((select count(*) from public.contacts) = 0, 'Başka şirketin kullanıcısı rehberi göremez');
reset role;

select 'REHBER TESTLERİ GEÇTİ' as sonuc;
