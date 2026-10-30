-- Uygulama içi geri bildirim: kullanıcı öneri, hata, soru ya da beğeni yazar; Gidero yöneticisi panelde görür.
-- Kayıt kişiye ve (varsa) çalıştığı şirkete bağlıdır. Kullanıcı yalnızca kendi kayıtlarını görür,
-- başka şirket adına kayıt açamaz. Okuma ve durum değiştirme platform yöneticisine açıktır.

create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  kind text not null check (kind in ('idea', 'bug', 'question', 'praise')),
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  screen text check (screen is null or char_length(screen) <= 200),
  app_info text check (app_info is null or char_length(app_info) <= 200),
  status text not null default 'new' check (status in ('new', 'seen', 'done')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_user_idx on public.feedback (user_id, created_at desc);
create index feedback_company_idx on public.feedback (company_id);
create index feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;

-- Kişi kendi geri bildirimini, Gidero yöneticisi hepsini görür
create policy feedback_select on public.feedback for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

-- Gönderme: şirket verildiyse kişinin etkin üyeliği olmalı; saatte en çok 10 kayıt
create or replace function public.submit_feedback(p_kind text, p_message text, p_company uuid default null, p_screen text default null, p_app_info text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_id bigint;
begin
  if v_me is null then raise exception 'Önce giriş yapın.' using errcode = '42501'; end if;
  if p_company is not null and not exists (
    select 1 from public.memberships m where m.user_id = v_me and m.company_id = p_company and m.status = 'active'
  ) then
    raise exception 'Bu şirket adına geri bildirim gönderemezsiniz.' using errcode = '42501';
  end if;
  if p_message is null or char_length(btrim(p_message)) < 3 then
    raise exception 'Geri bildiriminizi birkaç kelimeyle yazın.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.feedback f where f.user_id = v_me and f.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Bir saatte en çok 10 geri bildirim gönderebilirsiniz. Biraz sonra tekrar deneyin.' using errcode = 'P0001';
  end if;
  insert into public.feedback (user_id, company_id, kind, message, screen, app_info)
  values (v_me, p_company, p_kind, btrim(p_message), nullif(btrim(p_screen), ''), nullif(btrim(p_app_info), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_feedback(text, text, uuid, text, text) from public, anon;
grant execute on function public.submit_feedback(text, text, uuid, text, text) to authenticated;

-- Yönetim paneli listesi: gönderenin adı, e-postası ve şirketiyle
create or replace function public.admin_feedback(p_status text default null)
returns table (id bigint, kind text, message text, screen text, app_info text, status text, admin_note text,
               created_at timestamptz, user_name text, user_email text, company_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Bu liste yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  return query
    select f.id, f.kind, f.message, f.screen, f.app_info, f.status, f.admin_note, f.created_at,
           p.full_name, u.email::text, c.legal_name
      from public.feedback f
      left join public.profiles p on p.id = f.user_id
      left join auth.users u on u.id = f.user_id
      left join public.companies c on c.id = f.company_id
     where p_status is null or f.status = p_status
     order by (f.status = 'new') desc, f.created_at desc
     limit 500;
end;
$$;
revoke all on function public.admin_feedback(text) from public, anon;
grant execute on function public.admin_feedback(text) to authenticated;

-- Yönetici durumu (yeni, görüldü, tamamlandı) ve kendi notunu değiştirir
create or replace function public.admin_set_feedback(p_id bigint, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Bu işlem yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  update public.feedback
     set status = p_status, admin_note = nullif(btrim(p_note), ''), updated_at = now()
   where id = p_id;
  if not found then raise exception 'Geri bildirim bulunamadı.' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.admin_set_feedback(bigint, text, text) from public, anon;
grant execute on function public.admin_set_feedback(bigint, text, text) to authenticated;
