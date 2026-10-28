-- İki ayrı akış:
--  * Muhasebe bürosu: müşteri firmalara kimse giriş yapmaz; büro fişi firma adına girer ve onaysız kayda alır.
--  * Tekil şirket: kişiler ünvanlarıyla eklenir, şirket onay zincirini kendisi çizer (kim kimin altında,
--    zincir kimde biter). Onaylanan form muhasebeye düşer; muhasebeci aktarır, ödendi işaretler, form arşive gider.
-- Test müşterisi: Gidero yöneticisinin açtığı test hesaplarındaki herkese şifresiz geçilebilir.

-- ---------------------------------------------------------------------------
-- Kolonlar
-- ---------------------------------------------------------------------------
alter table public.accounts add column is_demo boolean not null default false;
alter table public.companies add column approval_mode text not null default 'chain'
  check (approval_mode in ('chain', 'steps'));
-- İleride büro, müşteri firmasına kendi girişini açabilecek (ayrı ücretli). Şimdilik hep false.
alter table public.companies add column self_service boolean not null default false;
alter table public.memberships add column title text check (title is null or length(title) <= 80);
alter table public.memberships add column final_approver boolean not null default false;

alter table public.reports drop constraint reports_status_check;
alter table public.reports add constraint reports_status_check
  check (status in ('draft','pending','returned','approved','booked','exported','paid'));
alter table public.reports add column paid_at timestamptz;
alter table public.reports add column paid_by uuid references auth.users (id);
alter table public.reports add column paid_note text check (paid_note is null or length(paid_note) <= 300);
create index reports_paid_by_idx on public.reports (paid_by);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('approval_needed', 'approved', 'returned', 'ready_for_accounting', 'paid'));

-- ---------------------------------------------------------------------------
-- Büro firması: girişleri büro yapar
-- ---------------------------------------------------------------------------
create or replace function private.bureau_managed(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.companies c where c.id = p_company and c.bureau_account_id is not null and not c.self_service); $$;

drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (
  status = 'draft' and created_by = (select auth.uid())
  and private.company_active(company_id)
  and (
    (
      ((owner_user_id = (select auth.uid()) and private.is_member(company_id))
       or private.has_any_role(company_id, array['accountant']))
      and exists (select 1 from public.memberships m where m.company_id = reports.company_id
                  and m.user_id = owner_user_id and m.status = 'active')
    )
    or (owner_user_id = (select auth.uid()) and private.bureau_managed(company_id)
        and private.has_any_role(company_id, array['accountant']))
  )
);

-- ---------------------------------------------------------------------------
-- Onay zinciri: raporu gönderenin yöneticisinden yukarı, "son onay" işaretli kişide ya da en tepede biter
-- ---------------------------------------------------------------------------
create or replace function private.would_cycle(p_company uuid, p_user uuid, p_manager uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare v_cur uuid := p_manager; v_n int := 0;
begin
  while v_cur is not null and v_n < 50 loop
    if v_cur = p_user then return true; end if;
    v_cur := private.manager_of(p_company, v_cur);
    v_n := v_n + 1;
  end loop;
  return false;
end;
$$;

create or replace function private.chain_steps(p_company uuid, p_owner uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cur uuid := p_owner;
  v_mgr uuid;
  v_seen uuid[] := array[p_owner];
  v_steps jsonb := '[]'::jsonb;
  v_label text;
  v_final boolean;
begin
  loop
    v_mgr := private.manager_of(p_company, v_cur);
    exit when v_mgr is null or v_mgr = any (v_seen) or cardinality(v_seen) > 15;
    select coalesce(nullif(trim(m.title), ''), 'Yönetici') || ': ' || coalesce(nullif(trim(p.full_name), ''), 'İsimsiz'),
           m.final_approver
      into v_label, v_final
      from public.memberships m left join public.profiles p on p.id = m.user_id
     where m.company_id = p_company and m.user_id = v_mgr and m.status = 'active';
    exit when not found;
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
      'approver_type', 'user', 'approver_user_id', v_mgr, 'name', left(v_label, 120)));
    exit when v_final;
    v_seen := v_seen || v_mgr;
    v_cur := v_mgr;
  end loop;

  -- En tepedeki kişinin raporu: başka bir yönetici, o da yoksa muhasebe onaylar (kimse kendini onaylayamaz)
  if jsonb_array_length(v_steps) = 0 then
    if exists (select 1 from public.memberships m where m.company_id = p_company and m.status = 'active'
                 and 'admin' = any (m.roles) and m.user_id <> p_owner) then
      v_steps := jsonb_build_array(jsonb_build_object('approver_type', 'role', 'approver_role', 'admin', 'name', 'Şirket yöneticisi'));
    elsif exists (select 1 from private.company_accountants(p_company) a where a <> p_owner) then
      v_steps := jsonb_build_array(jsonb_build_object('approver_type', 'role', 'approver_role', 'accountant', 'name', 'Muhasebe'));
    end if;
  end if;
  return v_steps;
end;
$$;

create or replace function public.submit_report(p_report uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reports;
  v_me uuid := (select auth.uid());
  v_flow public.approval_flows;
  v_steps jsonb;
  v_mode text;
begin
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'Rapor bulunamadı' using errcode = 'P0002'; end if;
  if r.status not in ('draft','returned') then
    raise exception 'Bu rapor gönderilemez (durum: %)', r.status using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.expenses e where e.report_id = r.id) then
    raise exception 'Rapor boş; önce en az bir fiş ekleyin' using errcode = 'P0001';
  end if;

  -- Büro firması ya da muhasebecinin başkası adına girdiği rapor: onaysız kayıt
  if (private.bureau_managed(r.company_id) and r.created_by = v_me
        and private.has_any_role(r.company_id, array['accountant']))
     or (r.created_by = v_me and r.owner_user_id <> v_me
        and private.has_any_role(r.company_id, array['accountant'])) then
    update public.reports set status = 'approved', submitted_at = now(), approved_at = now(),
                              flow_snapshot = '[]'::jsonb, current_step = null, current_approver_ids = '{}'
     where id = r.id;
    insert into public.approval_actions (report_id, company_id, actor_user_id, action)
    values (r.id, r.company_id, v_me, 'booked_without_approval');
    return 'approved';
  end if;

  if r.owner_user_id <> v_me then
    raise exception 'Raporu yalnızca sahibi gönderebilir' using errcode = '42501';
  end if;

  select c.approval_mode into v_mode from public.companies c where c.id = r.company_id;
  if v_mode = 'chain' then
    v_steps := private.chain_steps(r.company_id, r.owner_user_id);
  else
    select * into v_flow from public.approval_flows f
     where f.company_id = r.company_id and f.active
       and (f.min_total is null or r.total >= f.min_total)
       and (cardinality(f.cost_center_ids) = 0 or r.cost_center_id = any (f.cost_center_ids))
     order by f.priority desc, f.created_at
     limit 1;
    select coalesce(jsonb_agg(to_jsonb(s) order by s.position), '[]'::jsonb) into v_steps
      from public.approval_steps s
     where s.flow_id = v_flow.id and (s.min_total is null or r.total >= s.min_total);
  end if;

  update public.reports
     set flow_id = v_flow.id, flow_snapshot = v_steps, submitted_at = now()
   where id = r.id;
  insert into public.approval_actions (report_id, company_id, actor_user_id, action)
  values (r.id, r.company_id, v_me, 'submitted');

  if jsonb_array_length(v_steps) = 0 then
    update public.reports set status = 'approved', approved_at = now(), current_step = null,
                              current_approver_ids = '{}'
     where id = r.id;
    insert into public.approval_actions (report_id, company_id, actor_user_id, action)
    values (r.id, r.company_id, v_me, 'auto_approved');
    return 'approved';
  end if;

  perform private.advance_report(r.id, -1);
  return (select status from public.reports where id = r.id);
end;
$$;
revoke all on function public.submit_report(uuid) from public, anon;
grant execute on function public.submit_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Kişi düzenleme: ünvan, son onay, bağlı olduğu kişi (döngü engellenir)
-- ---------------------------------------------------------------------------
create or replace function public.set_member(p_company uuid, p_user uuid, p_roles text[], p_manager uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Ekibi yalnızca şirket yöneticisi düzenleyebilir.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_roles), 0) = 0 then
    raise exception 'Kişiye en az bir rol verin.' using errcode = 'P0001';
  end if;
  if p_manager is not null and p_manager = p_user then
    raise exception 'Kişi kendi yöneticisi olamaz.' using errcode = 'P0001';
  end if;
  if p_manager is not null and not exists (
      select 1 from public.memberships m where m.company_id = p_company and m.user_id = p_manager and m.status = 'active') then
    raise exception 'Seçilen yönetici bu şirkette değil.' using errcode = 'P0001';
  end if;
  if p_manager is not null and private.would_cycle(p_company, p_user, p_manager) then
    raise exception 'Bu kişi zaten seçtiğiniz yöneticinin üstünde; zincir kendi içine döner.' using errcode = 'P0001';
  end if;
  if p_user = (select auth.uid()) and not ('admin' = any (p_roles)) then
    raise exception 'Kendi yönetici rolünüzü kaldıramazsınız.' using errcode = 'P0001';
  end if;
  update public.memberships set roles = p_roles, manager_user_id = p_manager
   where company_id = p_company and user_id = p_user and status = 'active';
  if not found then
    raise exception 'Kişi bu şirketin ekibinde değil.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_manager(p_company uuid, p_user uuid, p_manager uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Onay zincirini yalnızca şirket yöneticisi değiştirebilir.' using errcode = '42501';
  end if;
  if p_manager is not null and p_manager = p_user then
    raise exception 'Kişi kendi yöneticisi olamaz.' using errcode = 'P0001';
  end if;
  if p_manager is not null and not exists (
      select 1 from public.memberships m where m.company_id = p_company and m.user_id = p_manager and m.status = 'active') then
    raise exception 'Seçilen yönetici bu şirkette değil.' using errcode = 'P0001';
  end if;
  if p_manager is not null and private.would_cycle(p_company, p_user, p_manager) then
    raise exception 'Bu kişi zaten seçtiğiniz yöneticinin üstünde; zincir kendi içine döner.' using errcode = 'P0001';
  end if;
  update public.memberships set manager_user_id = p_manager
   where company_id = p_company and user_id = p_user and status = 'active';
  if not found then
    raise exception 'Kişi bu şirketin ekibinde değil.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_member_details(p_company uuid, p_user uuid, p_title text, p_final_approver boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Kişi bilgilerini yalnızca şirket yöneticisi değiştirebilir.' using errcode = '42501';
  end if;
  update public.memberships
     set title = nullif(left(trim(coalesce(p_title, '')), 80), ''), final_approver = coalesce(p_final_approver, false)
   where company_id = p_company and user_id = p_user and status = 'active';
  if not found then
    raise exception 'Kişi bu şirketin ekibinde değil.' using errcode = 'P0002';
  end if;
end;
$$;

-- Ad soyad: yönetici, kendi şirketindeki kişinin adını düzeltebilir
create or replace function public.set_member_name(p_company uuid, p_user uuid, p_full_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Kişi bilgilerini yalnızca şirket yöneticisi değiştirebilir.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships m where m.company_id = p_company and m.user_id = p_user) then
    raise exception 'Kişi bu şirketin ekibinde değil.' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Ad soyad yazın.' using errcode = '22023';
  end if;
  insert into public.profiles (id, full_name) values (p_user, trim(p_full_name))
  on conflict (id) do update set full_name = excluded.full_name;
end;
$$;

-- Yönetici kontrolü (sunucu fonksiyonu kişi açmadan önce sorar)
create or replace function public.can_manage_company(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.has_any_role(p_company, array['admin']); $$;

revoke all on function public.set_manager(uuid, uuid, uuid) from public, anon;
revoke all on function public.set_member_details(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.set_member_name(uuid, uuid, text) from public, anon;
revoke all on function public.can_manage_company(uuid) from public, anon;
grant execute on function public.set_manager(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_member_details(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.set_member_name(uuid, uuid, text) to authenticated;
grant execute on function public.can_manage_company(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ödendi: muhasebeci ödenen formları işaretler, form arşive geçer
-- ---------------------------------------------------------------------------
create or replace function public.mark_paid(p_company uuid, p_report_ids uuid[], p_note text default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_bad int; v_n int;
begin
  if not private.has_any_role(p_company, array['accountant']) then
    raise exception 'Ödemeyi yalnızca muhasebeci işaretleyebilir.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_report_ids), 0) = 0 then
    raise exception 'Ödenen rapor seçilmedi.' using errcode = 'P0001';
  end if;
  select count(*) into v_bad
    from unnest(p_report_ids) as x(id)
    left join public.reports r on r.id = x.id and r.company_id = p_company
   where r.id is null or r.status not in ('approved', 'booked', 'exported');
  if v_bad > 0 then
    raise exception 'Yalnızca onaylanmış raporlar ödendi işaretlenebilir (% rapor uygun değil).', v_bad using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reports r where r.id = any (p_report_ids) and r.owner_user_id = v_me
               and not private.bureau_managed(r.company_id)) then
    raise exception 'Kendi masrafınızı ödendi olarak işaretleyemezsiniz; başka bir muhasebeci ya da yönetici işaretlemeli.' using errcode = '42501';
  end if;
  update public.reports
     set status = 'paid', paid_at = now(), paid_by = v_me, paid_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = any (p_report_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.mark_paid(uuid, uuid[], text) from public, anon;
grant execute on function public.mark_paid(uuid, uuid[], text) to authenticated;

-- Bildirim: ödendi
create or replace function private.notify_report_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner text;
  v_what text;
  v_note text;
  v_uid uuid;
begin
  select coalesce(nullif(p.full_name, ''), 'Bir çalışan') into v_owner from public.profiles p where p.id = new.owner_user_id;
  v_owner := coalesce(v_owner, 'Bir çalışan');
  v_what := new.title || ', ' || private.tl(new.total);

  if new.status = 'pending' and (old.status is distinct from 'pending' or old.current_step is distinct from new.current_step) then
    foreach v_uid in array new.current_approver_ids loop
      insert into public.notifications (user_id, company_id, report_id, kind, title, body)
      values (v_uid, new.company_id, new.id, 'approval_needed', 'Onayınızı bekleyen rapor', v_owner || ': ' || v_what);
    end loop;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    if old.status = 'pending' then
      insert into public.notifications (user_id, company_id, report_id, kind, title, body)
      values (new.owner_user_id, new.company_id, new.id, 'approved', 'Raporunuz onaylandı', v_what);
    end if;
    insert into public.notifications (user_id, company_id, report_id, kind, title, body)
    select a, new.company_id, new.id, 'ready_for_accounting', 'Muhasebeye hazır rapor', v_owner || ': ' || v_what
      from private.company_accountants(new.company_id) as a
     where a <> new.owner_user_id and a <> (select auth.uid());
  end if;

  if new.status = 'returned' and old.status is distinct from 'returned' then
    select a.note into v_note from public.approval_actions a
     where a.report_id = new.id and a.action = 'returned' order by a.created_at desc limit 1;
    insert into public.notifications (user_id, company_id, report_id, kind, title, body)
    values (new.owner_user_id, new.company_id, new.id, 'returned', 'Raporunuz iade edildi',
            new.title || coalesce('. Gerekçe: ' || v_note, ''));
  end if;

  if new.status = 'paid' and old.status is distinct from 'paid' and new.owner_user_id <> coalesce((select auth.uid()), new.owner_user_id) then
    insert into public.notifications (user_id, company_id, report_id, kind, title, body)
    values (new.owner_user_id, new.company_id, new.id, 'paid', 'Masrafınız ödendi',
            v_what || coalesce('. ' || new.paid_note, ''));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Test müşterileri
-- ---------------------------------------------------------------------------
drop function if exists public.demo_reset();
drop table if exists public.demo_users cascade;
drop function if exists private.is_demo_user();

-- Yalnızca test hesaplarına bağlı kişiler (Gidero yöneticisi hariç)
create or replace function private.demo_user_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  with attached as (
    select s.account_id, s.user_id from public.bureau_staff s
    union all
    select coalesce(c.bureau_account_id, c.account_id), m.user_id
      from public.memberships m join public.companies c on c.id = m.company_id
  )
  select distinct t.user_id from attached t
   where exists (select 1 from public.accounts a where a.id = t.account_id and a.is_demo)
     and not exists (select 1 from attached t2 join public.accounts a2 on a2.id = t2.account_id
                      where t2.user_id = t.user_id and not a2.is_demo)
     and not exists (select 1 from public.platform_admins pa where pa.user_id = t.user_id);
$$;

create or replace function private.is_demo_user()
returns boolean
language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) in (select private.demo_user_ids()); $$;

-- Test ekranı: test müşterileri ve içlerindeki kişiler
create or replace function public.demo_people()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (private.is_platform_admin() or private.is_demo_user()) then
    raise exception 'Test ekranı yalnızca Gidero yöneticisine açıktır.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'account_id', a.id, 'kind', a.kind, 'name', a.name,
      'people', coalesce((
        select jsonb_agg(x order by x ->> 'sort', x ->> 'full_name') from (
          select jsonb_build_object(
                   'user_id', s.user_id, 'email', u.email,
                   'full_name', coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)),
                   'label', case s.role when 'owner' then 'Büro sahibi' else 'Büro muhasebecisi' end,
                   'company', null, 'sort', case s.role when 'owner' then '0' else '1' end) as x
            from public.bureau_staff s join auth.users u on u.id = s.user_id left join public.profiles p on p.id = s.user_id
           where s.account_id = a.id and s.status = 'active'
          union all
          select jsonb_build_object(
                   'user_id', m.user_id, 'email', u.email,
                   'full_name', coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)),
                   'label', coalesce(nullif(m.title, ''),
                              case when 'admin' = any (m.roles) then 'Şirket yöneticisi'
                                   when 'accountant' = any (m.roles) then 'Muhasebeci'
                                   when 'approver' = any (m.roles) then 'Onaylayıcı' else 'Çalışan' end),
                   'company', c.legal_name,
                   'sort', case when 'admin' = any (m.roles) then '2' when 'accountant' = any (m.roles) then '4' else '3' end)
            from public.memberships m join public.companies c on c.id = m.company_id
            join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id
           where c.account_id = a.id and c.bureau_account_id is null and m.status = 'active'
        ) q), '[]'::jsonb)
    ) order by a.created_at desc)
    from public.accounts a where a.is_demo), '[]'::jsonb);
end;
$$;

-- Test verilerini sıfırlar; silinecek kişi kimliklerini döndürür (kişileri sunucu fonksiyonu siler)
create or replace function public.demo_reset()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_accounts uuid[];
  v_companies uuid[];
  v_users uuid[];
begin
  if not (private.is_platform_admin() or private.is_demo_user()) then
    raise exception 'Test verilerini yalnızca Gidero yöneticisi sıfırlayabilir.' using errcode = '42501';
  end if;
  select coalesce(array_agg(u), '{}') into v_users from private.demo_user_ids() u;
  select coalesce(array_agg(a.id), '{}') into v_accounts from public.accounts a where a.is_demo;
  select coalesce(array_agg(c.id), '{}') into v_companies from public.companies c
   where c.account_id = any (v_accounts) or c.bureau_account_id = any (v_accounts);
  delete from public.companies where id = any (v_companies);
  delete from public.orders where account_id = any (v_accounts);
  delete from public.accounts where id = any (v_accounts);
  return jsonb_build_object('accounts', cardinality(v_accounts), 'companies', cardinality(v_companies), 'user_ids', to_jsonb(v_users));
end;
$$;

revoke all on function public.demo_people() from public, anon;
revoke all on function public.demo_reset() from public, anon;
grant execute on function public.demo_people() to authenticated;
grant execute on function public.demo_reset() to authenticated;

-- Müşteri ekleme: test müşterisi işareti
drop function public.admin_create_customer(text, text, text, text, text, text, text, int, date, text, numeric);
create or replace function public.admin_create_customer(
  p_kind text, p_name text, p_tax_number text, p_owner_email text,
  p_plan text, p_status text, p_period text, p_seats int, p_end date, p_note text,
  p_paid_net numeric default null, p_demo boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_vkn text := regexp_replace(coalesce(p_tax_number, ''), '\D', '', 'g');
  v_email text := lower(trim(coalesce(p_owner_email, '')));
  v_account uuid;
  v_company uuid;
  v_user uuid;
  v_vat numeric := coalesce((select (t.value #>> '{}')::numeric from public.tax_parameters t
                              where t.key = 'sales_vat_rate' and t.year = extract(year from now())::int), 20);
begin
  perform private.require_platform_admin();
  if p_kind not in ('company', 'bureau') then raise exception 'Müşteri türünü seçin.' using errcode = '22023'; end if;
  if length(v_name) < 2 then raise exception 'Unvanı yazın.' using errcode = '22023'; end if;
  if v_vkn !~ '^[0-9]{10,11}$' then
    raise exception 'Vergi numarası 10, TC kimlik numarası 11 haneli olmalı.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Hesap sahibinin e-postasını yazın.' using errcode = '22023'; end if;
  if p_end is null or p_end < current_date then raise exception 'Bitiş tarihini bugünden sonra seçin.' using errcode = '22023'; end if;
  if p_kind = 'company' and not coalesce(p_demo, false)
     and exists (select 1 from public.companies c join public.accounts a on a.id = c.account_id
                  where c.tax_number = v_vkn and c.bureau_account_id is null and not a.is_demo) then
    raise exception 'Bu vergi numarasıyla kayıtlı bir şirket zaten var.' using errcode = '23505';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if coalesce(p_demo, false) and v_user is not null and (
       exists (select 1 from public.platform_admins pa where pa.user_id = v_user)
       or exists (select 1 from public.bureau_staff s join public.accounts a on a.id = s.account_id
                   where s.user_id = v_user and not a.is_demo)
       or exists (select 1 from public.memberships m join public.companies c on c.id = m.company_id
                    join public.accounts a on a.id = coalesce(c.bureau_account_id, c.account_id)
                   where m.user_id = v_user and not a.is_demo)) then
    raise exception 'Test müşterisi için gerçek bir kullanıcının e-postası kullanılamaz; yeni bir e-posta yazın (örn. ad@test.gidero.app).'
      using errcode = '22023';
  end if;

  insert into public.accounts (kind, name, is_demo) values (p_kind, v_name, coalesce(p_demo, false)) returning id into v_account;
  perform public.admin_set_subscription(v_account, p_plan, coalesce(p_status, 'trial'), p_period, p_seats, p_end, p_note);
  if p_kind = 'company' then
    insert into public.companies (account_id, legal_name, tax_number) values (v_account, v_name, v_vkn) returning id into v_company;
    perform private.seed_company(v_company);
  end if;

  if v_user is not null then
    perform private.attach_owner(v_user, v_account, v_company);
  else
    insert into public.platform_invites (email, account_id, company_id, created_by)
    values (v_email, v_account, v_company, (select auth.uid()));
  end if;
  if coalesce(p_paid_net, 0) > 0 and not coalesce(p_demo, false) then
    if p_plan is null or p_period is null then
      raise exception 'Tahsilat kaydı için paket ve ödeme dönemi seçin.' using errcode = '22023';
    end if;
    insert into public.orders (account_id, plan_id, billing_period, seats, months, list_price, discount, net_amount,
                               vat_rate, vat_amount, total, status, payment_method, created_by, approved_by, approved_at, note)
    values (v_account, p_plan, p_period, coalesce(p_seats, 1), case p_period when 'year' then 12 else 1 end,
            round(p_paid_net, 2), 0, round(p_paid_net, 2), v_vat, round(p_paid_net * v_vat / 100, 2),
            round(p_paid_net * (1 + v_vat / 100), 2), 'approved', 'manual', (select auth.uid()), (select auth.uid()), now(),
            coalesce(p_note, 'Panelden satış'));
  end if;
  return jsonb_build_object('account_id', v_account, 'company_id', v_company, 'invited', v_user is null,
                            'owner_email', v_email);
end;
$$;
revoke all on function public.admin_create_customer(text, text, text, text, text, text, text, int, date, text, numeric, boolean) from public, anon;
grant execute on function public.admin_create_customer(text, text, text, text, text, text, text, int, date, text, numeric, boolean) to authenticated;

-- Davet bağlantısı için: hesabın sahibinin e-postası (bekleyen davet ya da bağlı sahip)
create or replace function public.admin_owner_email(p_account uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare v text;
begin
  perform private.require_platform_admin();
  select i.email into v from public.platform_invites i where i.account_id = p_account and i.accepted_at is null
   order by i.created_at desc limit 1;
  if v is null then
    select u.email into v from auth.users u
     where u.id = coalesce(
       (select s.user_id from public.bureau_staff s where s.account_id = p_account and s.role = 'owner' limit 1),
       (select m.user_id from public.memberships m join public.companies c on c.id = m.company_id
         where c.account_id = p_account and 'admin' = any (m.roles) order by m.created_at limit 1));
  end if;
  return v;
end;
$$;
revoke all on function public.admin_owner_email(uuid) from public, anon;
grant execute on function public.admin_owner_email(uuid) to authenticated;

-- Kişi e-postası (davet bağlantısı yenileme): yalnızca o şirketin yöneticisi
create or replace function public.member_email(p_company uuid, p_user uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Bu bilgiyi yalnızca şirket yöneticisi görebilir.' using errcode = '42501';
  end if;
  return (select u.email from auth.users u join public.memberships m on m.user_id = u.id
           where m.company_id = p_company and m.user_id = p_user);
end;
$$;
revoke all on function public.member_email(uuid, uuid) from public, anon;
grant execute on function public.member_email(uuid, uuid) to authenticated;
