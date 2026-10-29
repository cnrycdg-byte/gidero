-- Uygulama tanıtımı bir kez gösterilir: görülen bölümler kişinin kendi profiline yazılır
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.ok((select tour_seen = '{}' from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'Yeni kişide tanıtım görülmemiş');
select test.ok(public.mark_tour_seen('{basics,approver}') = '{approver,basics}', 'Görülen bölümler kaydedilir');
select test.ok(public.mark_tour_seen('{basics,accountant}') = '{accountant,approver,basics}', 'Yeni rol bölümü eklenir, tekrar yazılmaz');
select test.expect_error($q$select public.mark_tour_seen('{hepsi}')$q$, 'Bilinmeyen bölüm kabul edilmez');
select test.expect_error($q$update public.profiles set tour_seen = '{}' where id = '00000000-0000-0000-0000-0000000000a1'$q$, 'Tanıtım kaydı doğrudan güncellenmez');
reset role;
select test.ok((select tour_seen = '{}' from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'Başka kişinin kaydı etkilenmez');
