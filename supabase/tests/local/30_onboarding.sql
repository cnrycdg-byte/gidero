-- İlk kullanım: profil, şirket kurulumu ve ekibe kişi ekleme (10_ testindeki tohum veriler de durur)
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000e1','yeni@e.test','{"full_name":"Yeni Kurucu"}'),
 ('00000000-0000-0000-0000-0000000000e2','calisan@e.test','{}'),
 ('00000000-0000-0000-0000-0000000000f1','baska@f.test','{}');
select test.ok((select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000e1') = 'Yeni Kurucu',
 'Kayıt olan kullanıcıya profil açılır');

-- E şirketini kurucu kurar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
set role authenticated;
create temp table e_co as select public.create_company('E Ticaret Ltd', '123 456 7890') as id;
select test.ok((select roles from public.memberships where company_id = (select id from e_co))
               @> array['admin','accountant','employee'], 'Kurucu yönetici, muhasebeci ve çalışan olur');
select test.ok((select tax_number from public.companies where id = (select id from e_co)) = '1234567890',
 'Vergi numarasındaki boşluklar temizlenir');
select test.ok((select count(*) from public.categories where company_id = (select id from e_co)) = 8,
 'Varsayılan kategoriler eklenir');
select test.ok((select count(*) from public.approval_steps where company_id = (select id from e_co)) = 1,
 'Varsayılan onay akışı eklenir');
select test.expect_error($q$select public.create_company('X', '1234567890')$q$, 'Kısa şirket adı reddedilir');
select test.expect_error($q$select public.create_company('X Ltd', '12345')$q$, 'Hatalı vergi numarası reddedilir');
select test.expect_error($q$select public.add_member((select id from e_co), 'olmayan@e.test')$q$,
 'Kayıtsız e-posta eklenemez');
select public.add_member((select id from e_co), 'CALISAN@e.test');
select test.ok((select manager_user_id from public.memberships where company_id = (select id from e_co)
                and user_id = '00000000-0000-0000-0000-0000000000e2') = '00000000-0000-0000-0000-0000000000e1',
 'Eklenen çalışanın yöneticisi ekleyen kişi olur');
grant select on e_co to authenticated;
reset role;

-- Kurucu tek başınayken kendi raporunu kendisi onaylayamaz; çalışanın raporu kurucuya gider
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', false);
set role authenticated;
insert into public.reports (id, company_id, owner_user_id, created_by, title)
values ('40000000-0000-0000-0000-0000000000e1', (select id from e_co),
        '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', 'Ekim');
insert into public.expenses (company_id, report_id, created_by, total)
values ((select id from e_co), '40000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', 250);
select test.ok(public.submit_report('40000000-0000-0000-0000-0000000000e1') = 'pending', 'Çalışan raporu onaya gider');
select test.ok((select current_approver_ids from public.reports where id = '40000000-0000-0000-0000-0000000000e1')
               = array['00000000-0000-0000-0000-0000000000e1'::uuid], 'Onaylayıcı kurucudur');
select test.expect_error($q$select public.add_member((select id from e_co), 'baska@f.test')$q$,
 'Çalışan ekibe kişi ekleyemez');
reset role;

-- Başka şirketin kullanıcısı E şirketini göremez, ekleyemez
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', false);
set role authenticated;
select test.ok((select count(*) from public.companies where id = (select id from e_co)) = 0,
 'F kullanıcısı E şirketini göremez');
select test.ok((select count(*) from public.categories where company_id = (select id from e_co)) = 0,
 'F kullanıcısı E şirketinin kategorilerini göremez');
select test.expect_error($q$select public.add_member((select id from e_co), 'baska@f.test')$q$,
 'F kullanıcısı kendini E şirketine ekleyemez');
reset role;

select set_config('request.jwt.claims', '', false);
set role anon;
select test.expect_error($q$select public.create_company('Anonim Ltd', '1234567890')$q$, 'Oturumsuz şirket kurulamaz');
reset role;

select 'İLK KULLANIM TESTLERİ GEÇTİ' as sonuc;
