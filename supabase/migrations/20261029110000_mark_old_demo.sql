-- Önceki test modunun deneme kişileriyle (gidero.demo.*@example.com) açılan hesaplar test müşterisi sayılır;
-- böylece Test sürüşü ekranında görünür ve "Test verilerini sıfırla" ile silinir.
with attached as (
  select s.account_id, s.user_id from public.bureau_staff s
  union all
  select coalesce(c.bureau_account_id, c.account_id), m.user_id
    from public.memberships m join public.companies c on c.id = m.company_id
  union all
  select i.account_id, u.id from public.platform_invites i join auth.users u on lower(u.email) = lower(i.email)
)
update public.accounts a set is_demo = true
 where exists (select 1 from attached t join auth.users u on u.id = t.user_id
                where t.account_id = a.id and u.email like 'gidero.demo.%@example.com')
   and not exists (select 1 from attached t join auth.users u on u.id = t.user_id
                    where t.account_id = a.id and u.email not like 'gidero.demo.%@example.com');
