-- Şirketler arası veri ayrımı, roller ve onay akışı testleri.
-- Her test başarısız olursa hata fırlatır; psql ON_ERROR_STOP ile çalıştırılır.

-- ---------- test yardımcıları ----------
create schema test;
grant usage on schema test to anon, authenticated;

create function test.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'BAŞARISIZ: %', p_msg; end if;
  raise notice 'geçti: %', p_msg;
end $$;

create function test.expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'geçti: % (hata: %)', p_msg, sqlerrm;
    return;
  end;
  raise exception 'BAŞARISIZ: % (hata bekleniyordu)', p_msg;
end $$;

create function test.affected(p_sql text) returns int language plpgsql as $$
declare n int;
begin execute p_sql; get diagnostics n = row_count; return n; end $$;

grant execute on all functions in schema test to anon, authenticated;

-- ---------- tohum veriler (süper kullanıcı, RLS dışında) ----------
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','a_emp@a.test'),
 ('00000000-0000-0000-0000-0000000000a2','a_mgr@a.test'),
 ('00000000-0000-0000-0000-0000000000a3','a_gm@a.test'),
 ('00000000-0000-0000-0000-0000000000a4','a_acct@a.test'),
 ('00000000-0000-0000-0000-0000000000b1','b_emp@b.test'),
 ('00000000-0000-0000-0000-0000000000b2','b_admin@b.test'),
 ('00000000-0000-0000-0000-0000000000c1','z_owner@buro.test'),
 ('00000000-0000-0000-0000-0000000000c2','z_acct@buro.test'),
 ('00000000-0000-0000-0000-0000000000c3','z_acct2@buro.test'),
 ('00000000-0000-0000-0000-0000000000d1','c_contact@c.test');
insert into public.profiles (id, full_name) select id, email from auth.users;

insert into public.accounts (id, kind, name) values
 ('10000000-0000-0000-0000-00000000000a','company','A Ltd hesabı'),
 ('10000000-0000-0000-0000-00000000000b','company','B AŞ hesabı'),
 ('10000000-0000-0000-0000-00000000000c','bureau','Z Mali Müşavirlik');

insert into public.companies (id, account_id, bureau_account_id, legal_name, tax_number) values
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a', null, 'A Ltd', '1111111111'),
 ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b', null, 'B AŞ', '2222222222'),
 ('20000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-00000000000c','C Gıda', '3333333333');

insert into public.memberships (company_id, user_id, roles, manager_user_id) values
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','{employee}','00000000-0000-0000-0000-0000000000a2'),
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a2','{employee,approver}','00000000-0000-0000-0000-0000000000a3'),
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a3','{employee,admin}', null),
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','{employee,accountant}','00000000-0000-0000-0000-0000000000a2'),
 ('20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b1','{employee}','00000000-0000-0000-0000-0000000000b2'),
 ('20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b2','{employee,admin}', null),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000d1','{employee,approver}', null);

insert into public.bureau_staff (account_id, user_id, role) values
 ('10000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c1','owner'),
 ('10000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c2','accountant'),
 ('10000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c3','accountant');
insert into public.bureau_assignments (account_id, user_id, company_id) values
 ('10000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c2','20000000-0000-0000-0000-00000000000c');

-- A şirketinin akışı: yönetici; 25.000 TL ve üstünde ek olarak yönetici rolü (genel müdür)
insert into public.approval_flows (id, company_id, name) values
 ('30000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','Standart');
insert into public.approval_steps (flow_id, company_id, position, name, approver_type, approver_role, min_total) values
 ('30000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a',0,'Yönetici onayı','manager',null,null),
 ('30000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a',1,'Genel müdür onayı','role','admin',25000);

-- B şirketinde gizli bir rapor
insert into public.reports (id, company_id, owner_user_id, created_by, title) values
 ('40000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1','B Ekim');
insert into public.expenses (company_id, report_id, created_by, total, description) values
 ('20000000-0000-0000-0000-00000000000b','40000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1', 777, 'B gizli masraf');

-- C (büro müşterisi) için bir rapor
insert into public.reports (id, company_id, owner_user_id, created_by, title) values
 ('40000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','C Ekim');

-- ================= A çalışanı =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;

insert into public.reports (id, company_id, owner_user_id, created_by, title, period) values
 ('40000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','Ekim 2026','2026-10');
insert into public.expenses (company_id, report_id, created_by, total, description, doc_type) values
 ('20000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1', 5000, 'Antalya ziyareti', 'e_arsiv');

select test.ok((select count(*) from public.reports) = 1, 'A çalışanı sadece kendi raporunu görür');
select test.ok((select count(*) from public.expenses where company_id = '20000000-0000-0000-0000-00000000000b') = 0, 'A çalışanı B masraflarını göremez');
select test.ok((select count(*) from public.companies) = 1, 'A çalışanı sadece kendi şirketini görür');
select test.expect_error($q$insert into public.reports (company_id, owner_user_id, created_by, title)
  values ('20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','sızma')$q$,
  'A çalışanı B şirketine rapor açamaz');
select test.expect_error($q$insert into public.expenses (company_id, report_id, created_by, total)
  values ('20000000-0000-0000-0000-00000000000b','40000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1', 1)$q$,
  'A çalışanı B raporuna masraf ekleyemez');
select test.expect_error($q$insert into public.expenses (company_id, report_id, created_by, total)
  values ('20000000-0000-0000-0000-00000000000b','40000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1', 1)$q$,
  'Masraf, raporun şirketinden farklı şirket kimliğiyle eklenemez');
select test.expect_error($q$update public.reports set status = 'approved' where id = '40000000-0000-0000-0000-0000000000a1'$q$,
  'Çalışan rapor durumunu doğrudan değiştiremez');
select test.ok(test.affected($q$update public.memberships set roles = '{employee,admin}' where user_id = '00000000-0000-0000-0000-0000000000a1'$q$) = 0,
  'Çalışan kendine yönetici rolü veremez');
select test.ok((select count(*) from public.tax_parameters where year = 2026) > 0, 'Vergi parametreleri okunabilir');
select test.expect_error($q$insert into public.tax_parameters (year, key, value) values (2026,'x','1')$q$, 'Vergi parametreleri yazılamaz');
select test.ok((select count(*) from public.audit_log) = 0, 'Çalışan denetim izini göremez');

select test.ok(public.submit_report('40000000-0000-0000-0000-0000000000a1') = 'pending', 'Rapor onaya gider');
select test.ok((select current_approver_ids from public.reports where id = '40000000-0000-0000-0000-0000000000a1')
               = array['00000000-0000-0000-0000-0000000000a2']::uuid[], 'İlk onaylayıcı çalışanın yöneticisi');
select test.expect_error($q$select public.approve_report('40000000-0000-0000-0000-0000000000a1')$q$, 'Çalışan kendi raporunu onaylayamaz');
select test.ok(test.affected($q$update public.expenses set total = 1 where report_id = '40000000-0000-0000-0000-0000000000a1'$q$) = 0,
  'Onaydaki raporun masrafı çalışan tarafından değiştirilemez');

-- büyük rapor
insert into public.reports (id, company_id, owner_user_id, created_by, title) values
 ('40000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','Fuar');
insert into public.expenses (company_id, report_id, created_by, total) values
 ('20000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a1', 30000);
select test.ok(public.submit_report('40000000-0000-0000-0000-0000000000a2') = 'pending', 'Büyük rapor onaya gider');
select test.ok((select jsonb_array_length(flow_snapshot) from public.reports where id = '40000000-0000-0000-0000-0000000000a2') = 2,
  '25.000 TL üstü rapor iki adımlı');
reset role;

-- ================= B çalışanı A'ya dokunamaz =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', false);
set role authenticated;
select test.ok((select count(*) from public.reports where company_id = '20000000-0000-0000-0000-00000000000a') = 0, 'B çalışanı A raporlarını göremez');
select test.ok(test.affected($q$update public.expenses set total = 1 where company_id = '20000000-0000-0000-0000-00000000000a'$q$) = 0, 'B çalışanı A masraflarını güncelleyemez');
select test.ok(test.affected($q$delete from public.expenses where company_id = '20000000-0000-0000-0000-00000000000a'$q$) = 0, 'B çalışanı A masraflarını silemez');
select test.expect_error($q$select public.approve_report('40000000-0000-0000-0000-0000000000a1')$q$, 'B çalışanı A raporunu onaylayamaz');
reset role;

-- ================= A yöneticisi =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', false);
set role authenticated;
select test.ok((select count(*) from public.reports where owner_user_id = '00000000-0000-0000-0000-0000000000a1') = 2, 'Yönetici ekibinin raporlarını görür');
select test.expect_error($q$select public.return_report('40000000-0000-0000-0000-0000000000a1', '  ')$q$, 'İade gerekçesiz yapılamaz');
select test.ok(public.approve_report('40000000-0000-0000-0000-0000000000a1', 'Uygun') = 'approved', 'Küçük rapor tek onayla tamamlanır');
select test.ok(public.approve_report('40000000-0000-0000-0000-0000000000a2') = 'pending', 'Büyük rapor ikinci adıma geçer');
select test.ok((select current_approver_ids from public.reports where id = '40000000-0000-0000-0000-0000000000a2')
               = array['00000000-0000-0000-0000-0000000000a3']::uuid[], 'İkinci adım genel müdürde');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', false);
set role authenticated;
select test.ok(public.approve_report('40000000-0000-0000-0000-0000000000a2') = 'approved', 'Genel müdür onaylar');
-- Genel müdürün kendi raporu: yöneticisi yok, başka yönetici rolü de yok -> açık hata
insert into public.reports (id, company_id, owner_user_id, created_by, title) values
 ('40000000-0000-0000-0000-0000000000a3','20000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','GM seyahat');
insert into public.expenses (company_id, report_id, created_by, total) values
 ('20000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3', 1000);
select test.expect_error($q$select public.submit_report('40000000-0000-0000-0000-0000000000a3')$q$,
  'Onaylayıcı bulunamazsa kendi kendine onay yerine hata verir');
reset role;

-- ================= A muhasebecisi =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', false);
set role authenticated;
select test.ok((select count(*) from public.reports) = 3, 'Muhasebeci şirketin tüm raporlarını görür');
select test.ok((select count(*) from public.reports where company_id = '20000000-0000-0000-0000-00000000000b') = 0, 'Muhasebeci başka şirketi göremez');
select test.ok((select count(*) from public.audit_log where company_id = '20000000-0000-0000-0000-00000000000a') > 0, 'Muhasebeci denetim izini görür');
select test.ok((select count(*) from public.audit_log where company_id <> '20000000-0000-0000-0000-00000000000a') = 0, 'Denetim izinde başka şirket yok');
-- başkası adına giriş: onaysız kayıt
insert into public.reports (id, company_id, owner_user_id, created_by, title) values
 ('40000000-0000-0000-0000-0000000000a4','20000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a4','Çalışan adına');
insert into public.expenses (company_id, report_id, created_by, total) values
 ('20000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4', 250);
select test.ok(public.submit_report('40000000-0000-0000-0000-0000000000a4') = 'approved', 'Muhasebecinin başkası adına girdiği rapor onaysız kaydedilir');
select test.ok(exists (select 1 from public.approval_actions where report_id = '40000000-0000-0000-0000-0000000000a4'
                       and action = 'booked_without_approval'), 'Onaysız kayıt denetim izine düşer');
-- kendi masrafı: akıştan geçer
insert into public.reports (id, company_id, owner_user_id, created_by, title) values
 ('40000000-0000-0000-0000-0000000000a5','20000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4','Muhasebeci kendi');
insert into public.expenses (company_id, report_id, created_by, total) values
 ('20000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a4', 400);
select test.ok(public.submit_report('40000000-0000-0000-0000-0000000000a5') = 'pending', 'Muhasebecinin kendi masrafı onaya gider (görevler ayrılığı)');
reset role;

-- ================= Büro =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', false);
set role authenticated;
select test.ok((select count(*) from public.reports where company_id = '20000000-0000-0000-0000-00000000000c') = 1, 'Atanmış büro muhasebecisi müşteri raporunu görür');
select test.ok((select count(*) from public.reports where company_id <> '20000000-0000-0000-0000-00000000000c') = 0, 'Büro muhasebecisi başka şirketi göremez');
insert into public.reports (id, company_id, owner_user_id, created_by, title) values
 ('40000000-0000-0000-0000-0000000000c2','20000000-0000-0000-0000-00000000000c',
  '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c2','Büro girişi');
insert into public.expenses (company_id, report_id, created_by, total) values
 ('20000000-0000-0000-0000-00000000000c','40000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c2', 120);
select test.ok(public.submit_report('40000000-0000-0000-0000-0000000000c2') = 'approved', 'Büro müşteri adına girdiğinde onaysız kaydedilir');
select test.expect_error($q$insert into public.bureau_assignments (account_id, user_id, company_id)
  values ('10000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c3','20000000-0000-0000-0000-00000000000c')$q$,
  'Büro muhasebecisi personel ataması yapamaz');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3"}', false);
set role authenticated;
select test.ok((select count(*) from public.reports) = 0, 'Atanmamış büro muhasebecisi müşteriyi göremez');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
set role authenticated;
select test.ok((select count(*) from public.reports where company_id = '20000000-0000-0000-0000-00000000000c') = 2, 'Büro sahibi tüm müşterilerini görür');
select test.ok((select count(*) from public.reports where company_id = '20000000-0000-0000-0000-00000000000a') = 0, 'Büro sahibi müşterisi olmayan şirketi göremez');
insert into public.bureau_assignments (account_id, user_id, company_id) values
 ('10000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c3','20000000-0000-0000-0000-00000000000c');
select test.expect_error($q$insert into public.bureau_assignments (account_id, user_id, company_id)
  values ('10000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c3','20000000-0000-0000-0000-00000000000a')$q$,
  'Büro, müşterisi olmayan şirkete personel atayamaz');
reset role;

-- ================= Anonim =================
select set_config('request.jwt.claims', '', false);
set role anon;
select test.expect_error($q$select count(*) from public.companies$q$, 'Giriş yapmamış kullanıcı hiçbir şey okuyamaz');
select test.expect_error($q$select public.submit_report('40000000-0000-0000-0000-0000000000a1')$q$, 'Giriş yapmamış kullanıcı fonksiyon çağıramaz');
reset role;

select 'TÜM TESTLER GEÇTİ' as sonuc;
