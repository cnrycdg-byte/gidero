-- Bildirimler: rapor onaya gidince onaylayıcıya, onaylanınca sahibine ve muhasebeye, iade edilince sahibine.
-- Bildirim satırları reports tablosundaki durum değişikliğinden tetikleyiciyle üretilir (atlanamaz).
-- Telefon bildirimi ve e-posta notify sunucu fonksiyonu tarafından gönderilir ve *_sent_at ile işaretlenir.

create table public.push_tokens (
  token text primary key check (length(token) <= 300),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  report_id uuid references public.reports (id) on delete cascade,
  kind text not null check (kind in ('approval_needed', 'approved', 'returned', 'ready_for_accounting')),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_sent_at timestamptz,
  email_sent_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_company_idx on public.notifications (company_id);
create index notifications_report_idx on public.notifications (report_id);
create index notifications_unsent_idx on public.notifications (created_at) where push_sent_at is null;

alter table public.notifications enable row level security;
revoke insert, delete on public.notifications from authenticated, anon;
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 1234.5 → "1.234,50 TL"
create or replace function private.tl(p numeric)
returns text language sql immutable set search_path = '' as $$
  select translate(to_char(coalesce(p, 0), 'FM999,999,999,990.00'), ',.', '.,') || ' TL';
$$;

-- Şirketin muhasebecileri: şirket içi muhasebeci rolü + bu firmaya atanmış büro muhasebecileri
create or replace function private.company_accountants(p_company uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.user_id from public.memberships m
   where m.company_id = p_company and m.status = 'active' and 'accountant' = any (m.roles)
  union
  select a.user_id from public.bureau_assignments a
    join public.companies c on c.id = a.company_id and c.bureau_account_id = a.account_id
    join public.bureau_staff s on s.account_id = a.account_id and s.user_id = a.user_id and s.status = 'active'
   where a.company_id = p_company;
$$;

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

  -- Onaya gitti ya da bir sonraki adıma geçti
  if new.status = 'pending' and (old.status is distinct from 'pending' or old.current_step is distinct from new.current_step) then
    foreach v_uid in array new.current_approver_ids loop
      insert into public.notifications (user_id, company_id, report_id, kind, title, body)
      values (v_uid, new.company_id, new.id, 'approval_needed', 'Onayınızı bekleyen rapor', v_owner || ': ' || v_what);
    end loop;
  end if;

  -- Onaylandı (onay akışından ya da muhasebecinin onaysız kaydından)
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

  -- İade edildi: gerekçe son iade kaydından
  if new.status = 'returned' and old.status is distinct from 'returned' then
    select a.note into v_note from public.approval_actions a
     where a.report_id = new.id and a.action = 'returned' order by a.created_at desc limit 1;
    insert into public.notifications (user_id, company_id, report_id, kind, title, body)
    values (new.owner_user_id, new.company_id, new.id, 'returned', 'Raporunuz iade edildi',
            new.title || coalesce('. Gerekçe: ' || v_note, ''));
  end if;
  return new;
end;
$$;

create trigger reports_notify after update of status, current_step on public.reports
  for each row execute function private.notify_report_change();

-- Bildirimi okundu yap ya da hepsini okundu yap
create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
   where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids));
$$;
revoke all on function public.mark_notifications_read(bigint[]) from public, anon;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
