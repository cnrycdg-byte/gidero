-- Tanıtım sitesindeki sohbet asistanı: ziyaretçi soruları ve verilen yanıtlar.
-- Bu tablolar bir şirkete ait değildir (plans gibi platform verisidir); bu yüzden company_id taşımaz.
-- Yazma yalnızca site-chat sunucu fonksiyonundan (service_role) yapılır; okuma yalnızca platform yöneticisine açıktır.

create table public.site_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  page text check (page is null or length(page) <= 300),
  message_count integer not null default 0,
  contact text check (contact is null or length(contact) <= 200),
  needs_human boolean not null default false,
  handled boolean not null default false
);

create table public.site_chat_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.site_chat_sessions (id) on delete cascade,
  role text not null check (role in ('visitor', 'assistant')),
  content text not null check (length(content) <= 4000),
  created_at timestamptz not null default now()
);

create index site_chat_sessions_last_at_idx on public.site_chat_sessions (last_at desc);
create index site_chat_messages_session_idx on public.site_chat_messages (session_id, created_at);

alter table public.site_chat_sessions enable row level security;
alter table public.site_chat_messages enable row level security;

revoke all on public.site_chat_sessions, public.site_chat_messages from anon, authenticated;
grant select on public.site_chat_sessions, public.site_chat_messages to authenticated;
grant update (handled) on public.site_chat_sessions to authenticated;

create policy site_chat_sessions_admin_select on public.site_chat_sessions
  for select to authenticated using ((select private.is_platform_admin()));
create policy site_chat_sessions_admin_update on public.site_chat_sessions
  for update to authenticated using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));
create policy site_chat_messages_admin_select on public.site_chat_messages
  for select to authenticated using ((select private.is_platform_admin()));
