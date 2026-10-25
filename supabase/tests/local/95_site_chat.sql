-- Site sohbeti: kayıtları yalnızca platform yöneticisi okur; ziyaretçiler ve müşteri kullanıcıları göremez
insert into public.site_chat_sessions (id, page, contact, needs_human)
values ('00000000-0000-0000-0000-00000000c4a1', '/', 'muhasebe@ornek.test', true);
insert into public.site_chat_messages (session_id, role, content)
values ('00000000-0000-0000-0000-00000000c4a1', 'visitor', 'Büro paketi kaç firma içeriyor?'),
       ('00000000-0000-0000-0000-00000000c4a1', 'assistant', 'Büro 5 paketi 5 müşteri firma içerir.');

set role anon;
select test.expect_error($q$select * from public.site_chat_messages$q$, 'Ziyaretçi sohbet kayıtlarını okuyamaz');
select test.expect_error($q$insert into public.site_chat_messages (session_id, role, content) values ('00000000-0000-0000-0000-00000000c4a1', 'visitor', 'x')$q$,
 'Ziyaretçi doğrudan kayıt yazamaz');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
set role authenticated;
select test.ok((select count(*) from public.site_chat_messages) = 0, 'Müşteri kullanıcısı sohbet kayıtlarını göremez');
select test.ok((select count(*) from public.site_chat_sessions) = 0, 'Müşteri kullanıcısı sohbetleri göremez');
select test.expect_error($q$insert into public.site_chat_sessions (page) values ('/')$q$, 'Müşteri kullanıcısı sohbet açamaz');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', false);
set role authenticated;
select test.ok((select count(*) from public.site_chat_messages where session_id = '00000000-0000-0000-0000-00000000c4a1') = 2,
 'Platform yöneticisi sohbeti mesajlarıyla görür');
update public.site_chat_sessions set handled = true where id = '00000000-0000-0000-0000-00000000c4a1';
select test.ok((select handled from public.site_chat_sessions where id = '00000000-0000-0000-0000-00000000c4a1'),
 'Platform yöneticisi sohbeti ilgilenildi olarak işaretler');
select test.expect_error($q$update public.site_chat_sessions set contact = 'x' where id = '00000000-0000-0000-0000-00000000c4a1'$q$,
 'Yönetici ziyaretçinin bilgisini değiştiremez');
reset role;
