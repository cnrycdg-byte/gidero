-- Müşteri bulma ve e-posta ile ulaşma (yalnızca Gidero yöneticisi).
-- Bu tablolar bir şirkete ait değildir (site sohbeti gibi platform verisidir); bu yüzden company_id taşımaz.
-- Yazma işlemleri yönetici RPC'leri ve sunucu fonksiyonları (service_role) ile yapılır.
--
-- Hukuki çerçeve (6563 sayılı Kanun m.6/2): tacir ve esnafa önceden onay almadan ticari ileti gönderilebilir;
-- her iletide gönderen kimliği, iletişim bilgisi ve ücretsiz ret yolu bulunur, ret 3 iş günü içinde uygulanır.
-- Ret eden e-posta adresleri email_optouts tablosunda kalıcı tutulur; bu adreslere bir daha yazılmaz.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 200),
  kind text not null default 'bureau' check (kind in ('bureau', 'company')),
  sector text check (sector is null or char_length(sector) <= 100),
  city text check (city is null or char_length(city) <= 80),
  district text check (district is null or char_length(district) <= 80),
  address text check (address is null or char_length(address) <= 300),
  phone text check (phone is null or char_length(phone) <= 40),
  website text check (website is null or char_length(website) <= 300),
  email text check (email is null or (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  source text not null default 'manual' check (source in ('manual', 'csv', 'web', 'maps')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 300),
  status text not null default 'new' check (status in ('new', 'contacted', 'replied', 'interested', 'customer', 'lost', 'unsubscribed')),
  notes text check (notes is null or char_length(notes) <= 4000),
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index leads_email_key on public.leads (lower(email)) where email is not null;
create unique index leads_source_ref_key on public.leads (source, source_ref) where source_ref is not null;
create index leads_status_idx on public.leads (status, created_at desc);

create table public.lead_messages (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  step smallint not null check (step between 1 and 3),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 8000),
  status text not null default 'draft' check (status in ('draft', 'sent', 'failed', 'skipped')),
  due_at timestamptz not null default now(),
  sent_at timestamptz,
  error text check (error is null or char_length(error) <= 500),
  provider_id text,
  created_at timestamptz not null default now(),
  unique (lead_id, step)
);
create index lead_messages_due_idx on public.lead_messages (status, due_at);

create table public.email_optouts (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now(),
  source text not null default 'link' check (source in ('link', 'manual', 'reply'))
);

alter table public.leads enable row level security;
alter table public.lead_messages enable row level security;
alter table public.email_optouts enable row level security;
revoke all on public.leads, public.lead_messages, public.email_optouts from anon, authenticated;
grant select on public.leads, public.lead_messages, public.email_optouts to authenticated;
create policy leads_admin_select on public.leads for select to authenticated using ((select private.is_platform_admin()));
create policy lead_messages_admin_select on public.lead_messages for select to authenticated using ((select private.is_platform_admin()));
create policy email_optouts_admin_select on public.email_optouts for select to authenticated using ((select private.is_platform_admin()));

-- Varsayılan gönderim ayarları ve 3 adımlı e-posta dizisi ({firma}, {sehir}, {gonderen} alanları doldurulur)
insert into public.platform_settings (key, value) values
  ('web_search_usd', '0.01'::jsonb),
  ('outreach_daily_cap', '40'::jsonb),
  ('outreach_sender', jsonb_build_object('name', 'Caner Yücedağ', 'company', 'Gidero', 'address', '', 'phone', '', 'website', 'gidero.expo.app')),
  ('outreach_templates', jsonb_build_object(
    'bureau', jsonb_build_array(
      jsonb_build_object('step', 1, 'delay_days', 0, 'subject', '{firma} için fiş girişini yarıya indirmek',
        'body', E'Merhaba,\n\nMüşterilerinizin fişleri WhatsApp''tan geliyor ve ekibiniz bunları tek tek programa yazıyorsa Gidero bu işi sizin yerinize yapar. Sohbeti dışa aktarıp yüklersiniz; Gidero fişleri okur, alkol, fatura sınırı ve mükerrer fiş gibi riskleri işaretler, yevmiye kaydını hazırlar. Excel, Logo ya da Luca dosyası olarak alırsınız.\n\n{sehir} bölgesindeki bürolarla ilk ay ücretsiz bir deneme yapıyoruz. 15 dakikalık bir görüşme için uygun bir gününüzü yazar mısınız?\n\nSaygılarımla,\n{gonderen}'),
      jsonb_build_object('step', 2, 'delay_days', 3, 'subject', 'Ynt: {firma} için fiş girişini yarıya indirmek',
        'body', E'Merhaba,\n\nGeçen hafta yazdığım e-postayı görme fırsatınız olmamış olabilir. Kısaca: bir müşterinizin bir aylık fişlerini Gidero''ya yükleyip sonucu birlikte görelim; kurulum gerekmez, ücret alınmaz.\n\nUygunsanız bu hafta 15 dakika yeterli.\n\n{gonderen}'),
      jsonb_build_object('step', 3, 'delay_days', 7, 'subject', 'Son olarak: {firma}',
        'body', E'Merhaba,\n\nSizi daha fazla meşgul etmek istemem; bu son e-postam. İleride fiş girişini hızlandırmak isterseniz bu adrese yazmanız yeterli.\n\nİyi çalışmalar dilerim,\n{gonderen}')
    ),
    'company', jsonb_build_array(
      jsonb_build_object('step', 1, 'delay_days', 0, 'subject', '{firma} çalışanlarının masraf fişleri',
        'body', E'Merhaba,\n\nSahada çalışan ekibinizin masraf fişleri ay sonunda zarfla ya da Excel''le geliyorsa Gidero bu işi kısaltır. Çalışan fişin fotoğrafını çeker, Gidero okur, sizin onay zincirinizden geçirir, vergi riskini söyler ve muhasebe programınıza aktarır.\n\n{sehir} bölgesindeki şirketlerle 14 günlük ücretsiz deneme yapıyoruz. 15 dakikalık bir tanıtım için uygun bir gününüzü yazar mısınız?\n\nSaygılarımla,\n{gonderen}'),
      jsonb_build_object('step', 2, 'delay_days', 3, 'subject', 'Ynt: {firma} çalışanlarının masraf fişleri',
        'body', E'Merhaba,\n\nGeçen hafta yazdığım e-postayı hatırlatmak istedim. Bir ekibinizle 14 gün deneyip sonucu görmek, kurulum gerektirmiyor.\n\n{gonderen}'),
      jsonb_build_object('step', 3, 'delay_days', 7, 'subject', 'Son olarak: {firma}',
        'body', E'Merhaba,\n\nBu son e-postam. Masraf sürecinizi kısaltmak isterseniz bu adrese yazmanız yeterli.\n\nİyi çalışmalar dilerim,\n{gonderen}')
    )
  ))
on conflict (key) do nothing;

-- Yapay zekâ maliyetine web araması da girer
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check check (feature in ('receipt', 'site_chat', 'lead_search'));
alter table public.ai_usage add column web_searches integer not null default 0 check (web_searches >= 0);

create or replace function private.ai_usage_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.ai_prices; v_search numeric := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'web_search_usd'), 0.01);
begin
  select * into p from public.ai_prices where model = new.model;
  new.cost_usd := case when found then
      round((new.input_tokens * p.input_per_mtok + new.output_tokens * p.output_per_mtok
             + new.cache_read_tokens * p.cache_read_per_mtok + new.cache_write_tokens * p.cache_write_per_mtok) / 1000000.0, 6)
    else 0 end + round(new.web_searches * v_search, 6);
  return new;
end;
$$;

-- Yönetici: firma ekle / güncelle (elle ya da Excel'den); ret listesindeki adresler eklenmez
create or replace function public.admin_upsert_leads(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_added int := 0; v_skipped int := 0; v_email text;
begin
  if not private.is_platform_admin() then raise exception 'Bu işlem yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Bir seferde en çok 1000 firma eklenebilir.' using errcode = 'P0001';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_email := nullif(lower(btrim(r->>'email')), '');
    if coalesce(btrim(r->>'name'), '') = ''
       or (v_email is not null and exists (select 1 from public.email_optouts o where o.email = v_email))
       or (v_email is not null and exists (select 1 from public.leads l where lower(l.email) = v_email))
       or (r->>'source_ref' is not null and exists (select 1 from public.leads l where l.source = coalesce(r->>'source', 'manual') and l.source_ref = r->>'source_ref')) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    begin
      insert into public.leads (name, kind, sector, city, district, address, phone, website, email, contact_name, source, source_ref, notes)
      values (btrim(r->>'name'), coalesce(r->>'kind', 'bureau'), nullif(btrim(r->>'sector'), ''), nullif(btrim(r->>'city'), ''),
              nullif(btrim(r->>'district'), ''), nullif(btrim(r->>'address'), ''), nullif(btrim(r->>'phone'), ''),
              nullif(btrim(r->>'website'), ''), v_email, nullif(btrim(r->>'contact_name'), ''),
              coalesce(r->>'source', 'manual'), nullif(r->>'source_ref', ''), nullif(btrim(r->>'notes'), ''));
      v_added := v_added + 1;
    exception when check_violation then
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end;
$$;
revoke all on function public.admin_upsert_leads(jsonb) from public, anon;
grant execute on function public.admin_upsert_leads(jsonb) to authenticated;

-- Yönetici: durum, e-posta, kişi ve not güncelleme. "Listeden çıktı" kalıcı ret listesine yazılır
create or replace function public.admin_update_lead(p_id uuid, p_status text, p_email text default null, p_contact text default null, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := nullif(lower(btrim(p_email)), '');
begin
  if not private.is_platform_admin() then raise exception 'Bu işlem yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  if v_email is not null and exists (select 1 from public.email_optouts o where o.email = v_email) and p_status <> 'unsubscribed' then
    raise exception 'Bu adres daha önce listeden çıkmak istedi; ona e-posta gönderilemez.' using errcode = 'P0001';
  end if;
  update public.leads set status = p_status, email = v_email, contact_name = nullif(btrim(p_contact), ''),
         notes = nullif(btrim(p_notes), ''), updated_at = now()
   where id = p_id;
  if not found then raise exception 'Firma bulunamadı.' using errcode = 'P0002'; end if;
  if p_status = 'unsubscribed' and v_email is not null then
    insert into public.email_optouts (email, source) values (v_email, 'manual') on conflict do nothing;
  end if;
  -- Yanıt veren, ilgilenen, müşteri olan ya da çıkan firmaya kalan takip e-postaları gönderilmez
  if p_status in ('replied', 'interested', 'customer', 'lost', 'unsubscribed') then
    update public.lead_messages set status = 'skipped' where lead_id = p_id and status = 'draft';
  end if;
end;
$$;
revoke all on function public.admin_update_lead(uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_update_lead(uuid, text, text, text, text) to authenticated;

-- Yönetici: seçilen firmalar için 3 adımlı diziyi taslak olarak hazırlar (gönderim ayrı, onayla yapılır)
create or replace function public.admin_prepare_sequence(p_lead_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare l public.leads; t jsonb; s jsonb; v_sender jsonb; v_count int := 0; v_sig text;
begin
  if not private.is_platform_admin() then raise exception 'Bu işlem yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  select value into v_sender from public.platform_settings where key = 'outreach_sender';
  v_sig := concat_ws(E'\n', v_sender->>'name', v_sender->>'company');
  for l in select * from public.leads where id = any(p_lead_ids) and email is not null and status in ('new', 'contacted')
             and not exists (select 1 from public.email_optouts o where o.email = lower(leads.email)) loop
    select value -> l.kind into t from public.platform_settings where key = 'outreach_templates';
    for s in select * from jsonb_array_elements(coalesce(t, '[]'::jsonb)) loop
      insert into public.lead_messages (lead_id, step, subject, body, due_at)
      values (l.id, (s->>'step')::smallint,
              replace(replace(replace(s->>'subject', '{firma}', l.name), '{sehir}', coalesce(l.city, 'bölgenizdeki')), '{gonderen}', v_sig),
              replace(replace(replace(s->>'body', '{firma}', l.name), '{sehir}', coalesce(l.city, 'bölgenizdeki')), '{gonderen}', v_sig),
              now() + make_interval(days => coalesce((s->>'delay_days')::int, 0)))
      on conflict (lead_id, step) do nothing;
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.admin_prepare_sequence(uuid[]) from public, anon;
grant execute on function public.admin_prepare_sequence(uuid[]) to authenticated;

-- Yönetici: taslağın konusunu ve metnini düzenler ya da atlar
create or replace function public.admin_edit_message(p_id bigint, p_subject text, p_body text, p_skip boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Bu işlem yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  update public.lead_messages set subject = p_subject, body = p_body, status = case when p_skip then 'skipped' else status end
   where id = p_id and status = 'draft';
  if not found then raise exception 'Bu e-posta artık düzenlenemez.' using errcode = 'P0001'; end if;
end;
$$;
revoke all on function public.admin_edit_message(bigint, text, text, boolean) from public, anon;
grant execute on function public.admin_edit_message(bigint, text, text, boolean) to authenticated;

-- Gönderim ayarları (gönderen kimliği, günlük sınır, şablonlar)
create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old jsonb;
begin
  if not private.is_platform_admin() then raise exception 'Bu işlem yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  if p_key not in ('outreach_sender', 'outreach_daily_cap', 'outreach_templates') then
    raise exception 'Bu ayar buradan değiştirilemez.' using errcode = 'P0001';
  end if;
  select value into v_old from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.platform_audit_log (actor_user_id, table_name, row_id, action, old_data, new_data)
  values ((select auth.uid()), 'platform_settings', p_key, 'update', v_old, p_value);
end;
$$;
revoke all on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

-- Liste dışı kalma: e-postadaki bağlantıdan (sunucu fonksiyonu, service_role) çağrılır
create or replace function public.lead_unsubscribe(p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare l public.leads;
begin
  select * into l from public.leads where unsubscribe_token = p_token;
  if not found then return false; end if;
  update public.leads set status = 'unsubscribed', updated_at = now() where id = l.id;
  update public.lead_messages set status = 'skipped' where lead_id = l.id and status = 'draft';
  if l.email is not null then
    insert into public.email_optouts (email, source) values (lower(l.email), 'link') on conflict do nothing;
  end if;
  return true;
end;
$$;
revoke all on function public.lead_unsubscribe(uuid) from public, anon, authenticated;
grant execute on function public.lead_unsubscribe(uuid) to service_role;
