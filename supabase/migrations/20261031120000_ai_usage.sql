-- Yapay zekâ (Claude API) kullanım kaydı ve maliyeti.
-- Her çağrı sunucu fonksiyonundan (service_role) yazılır: hangi özellik, hangi model, kaç token.
-- Maliyet, kayıt anındaki fiyatla hesaplanıp satıra yazılır; fiyat sonradan değişse de geçmiş değişmez.
-- Fiyatlar kodda sabit değil, ai_prices tablosundadır; Gidero yöneticisi panelden günceller.
-- Okuma yalnızca platform yöneticisine açıktır; şirket kullanıcıları bu tabloları göremez.

create table public.ai_prices (
  model text primary key check (char_length(model) <= 80),
  input_per_mtok numeric(12,4) not null check (input_per_mtok >= 0),
  output_per_mtok numeric(12,4) not null check (output_per_mtok >= 0),
  cache_read_per_mtok numeric(12,4) not null default 0 check (cache_read_per_mtok >= 0),
  cache_write_per_mtok numeric(12,4) not null default 0 check (cache_write_per_mtok >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
create index ai_prices_updated_by_idx on public.ai_prices (updated_by);

-- Anthropic liste fiyatları, ABD doları / 1 milyon token (Ekim 2026)
insert into public.ai_prices (model, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok) values
  ('claude-haiku-5-5', 0.10, 0.50, 0.01, 0.125),
  ('claude-sonnet-5-5', 2.00, 10.00, 0.10, 2.50);

create table public.platform_settings (
  key text primary key check (char_length(key) <= 60),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
create index platform_settings_updated_by_idx on public.platform_settings (updated_by);
insert into public.platform_settings (key, value) values ('usd_try', '50'::jsonb);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  company_id uuid references public.companies (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  feature text not null check (feature in ('receipt', 'site_chat')),
  model text not null check (char_length(model) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  expense_id uuid,
  cost_usd numeric(14,6) not null default 0
);
create index ai_usage_created_idx on public.ai_usage (created_at desc);
create index ai_usage_company_idx on public.ai_usage (company_id, created_at desc);
create index ai_usage_user_idx on public.ai_usage (user_id);

alter table public.ai_prices enable row level security;
alter table public.platform_settings enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.ai_prices, public.platform_settings, public.ai_usage from anon, authenticated;
-- Platform yöneticisi doğrudan okuyabilir (yazma yalnızca fonksiyonlarla)
grant select on public.ai_prices, public.platform_settings, public.ai_usage to authenticated;
create policy ai_prices_admin_select on public.ai_prices for select to authenticated using ((select private.is_platform_admin()));
create policy platform_settings_admin_select on public.platform_settings for select to authenticated using ((select private.is_platform_admin()));
create policy ai_usage_admin_select on public.ai_usage for select to authenticated using ((select private.is_platform_admin()));

-- Maliyet kayıt anındaki fiyatla hesaplanır (bilinmeyen model için 0)
create or replace function private.ai_usage_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.ai_prices;
begin
  select * into p from public.ai_prices where model = new.model;
  if found then
    new.cost_usd := round((new.input_tokens * p.input_per_mtok + new.output_tokens * p.output_per_mtok
                     + new.cache_read_tokens * p.cache_read_per_mtok + new.cache_write_tokens * p.cache_write_per_mtok) / 1000000.0, 6);
  else
    new.cost_usd := 0;
  end if;
  return new;
end;
$$;
create trigger ai_usage_cost before insert on public.ai_usage for each row execute function private.ai_usage_cost();

-- Panel özeti: son N gün (İstanbul saatine göre), özellik ve model dağılımı, en çok kullanan şirketler
create or replace function public.admin_ai_usage(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 366);
  v_from date := (now() at time zone 'Europe/Istanbul')::date - (v_days - 1);
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_month date := date_trunc('month', now() at time zone 'Europe/Istanbul')::date;
begin
  if not private.is_platform_admin() then raise exception 'Bu rapor yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'usd_try', (select value from public.platform_settings where key = 'usd_try'),
    'today', (select jsonb_build_object('cost', coalesce(sum(cost_usd), 0), 'calls', count(*))
                from public.ai_usage where (created_at at time zone 'Europe/Istanbul')::date = v_today),
    'yesterday', (select jsonb_build_object('cost', coalesce(sum(cost_usd), 0), 'calls', count(*))
                from public.ai_usage where (created_at at time zone 'Europe/Istanbul')::date = v_today - 1),
    'month', (select jsonb_build_object('cost', coalesce(sum(cost_usd), 0), 'calls', count(*),
                     'receipts', count(distinct expense_id) filter (where feature = 'receipt'))
                from public.ai_usage where (created_at at time zone 'Europe/Istanbul')::date >= v_month),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'cost', coalesce(u.cost, 0), 'calls', coalesce(u.calls, 0),
                                                           'receipts', coalesce(u.receipts, 0)) order by d.day), '[]'::jsonb)
                from generate_series(v_from, v_today, interval '1 day') as d(day)
                left join (select (created_at at time zone 'Europe/Istanbul')::date as day, sum(cost_usd) as cost, count(*) as calls,
                                  count(distinct expense_id) filter (where feature = 'receipt') as receipts
                             from public.ai_usage where created_at >= v_from::timestamp at time zone 'Europe/Istanbul'
                            group by 1) u on u.day = d.day::date),
    'by_model', (select coalesce(jsonb_agg(x order by x->>'cost' desc), '[]'::jsonb) from (
                  select jsonb_build_object('model', model, 'cost', sum(cost_usd), 'calls', count(*),
                                            'input', sum(input_tokens), 'output', sum(output_tokens)) as x
                    from public.ai_usage where created_at >= v_from::timestamp at time zone 'Europe/Istanbul' group by model) m),
    'by_feature', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                  select jsonb_build_object('feature', feature, 'cost', sum(cost_usd), 'calls', count(*)) as x
                    from public.ai_usage where created_at >= v_from::timestamp at time zone 'Europe/Istanbul' group by feature) f),
    'by_company', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                  select jsonb_build_object('company', coalesce(c.legal_name, case when a.feature = 'site_chat' then 'Site sohbeti' else 'Firma yok' end),
                                            'cost', sum(a.cost_usd), 'calls', count(*),
                                            'receipts', count(distinct a.expense_id) filter (where a.feature = 'receipt')) as x
                    from public.ai_usage a left join public.companies c on c.id = a.company_id
                   where a.created_at >= v_month::timestamp at time zone 'Europe/Istanbul'
                   group by coalesce(c.legal_name, case when a.feature = 'site_chat' then 'Site sohbeti' else 'Firma yok' end)
                   order by sum(a.cost_usd) desc limit 20) t),
    'prices', (select coalesce(jsonb_agg(to_jsonb(p) - 'updated_by' order by p.model), '[]'::jsonb) from public.ai_prices p)
  );
end;
$$;
revoke all on function public.admin_ai_usage(integer) from public, anon;
grant execute on function public.admin_ai_usage(integer) to authenticated;

-- Fiyat ve kur güncelleme (yalnızca Gidero yöneticisi; değişiklik denetim izine yazılır)
create or replace function public.admin_set_ai_price(p_model text, p_input numeric, p_output numeric, p_cache_read numeric default 0, p_cache_write numeric default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old jsonb;
begin
  if not private.is_platform_admin() then raise exception 'Bu işlem yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  if p_input < 0 or p_output < 0 or p_cache_read < 0 or p_cache_write < 0 then
    raise exception 'Fiyat eksi olamaz.' using errcode = 'P0001';
  end if;
  select to_jsonb(p) into v_old from public.ai_prices p where model = p_model;
  insert into public.ai_prices (model, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok, updated_at, updated_by)
  values (btrim(p_model), p_input, p_output, coalesce(p_cache_read, 0), coalesce(p_cache_write, 0), now(), (select auth.uid()))
  on conflict (model) do update set input_per_mtok = excluded.input_per_mtok, output_per_mtok = excluded.output_per_mtok,
    cache_read_per_mtok = excluded.cache_read_per_mtok, cache_write_per_mtok = excluded.cache_write_per_mtok,
    updated_at = now(), updated_by = excluded.updated_by;
  insert into public.platform_audit_log (actor_user_id, table_name, row_id, action, old_data, new_data)
  values ((select auth.uid()), 'ai_prices', p_model, case when v_old is null then 'insert' else 'update' end, v_old,
          (select to_jsonb(p) from public.ai_prices p where model = p_model));
end;
$$;
revoke all on function public.admin_set_ai_price(text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_set_ai_price(text, numeric, numeric, numeric, numeric) to authenticated;

create or replace function public.admin_set_usd_try(p_rate numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old jsonb;
begin
  if not private.is_platform_admin() then raise exception 'Bu işlem yalnızca Gidero yöneticisine açıktır.' using errcode = '42501'; end if;
  if p_rate is null or p_rate <= 0 or p_rate > 10000 then raise exception 'Geçerli bir kur yazın.' using errcode = 'P0001'; end if;
  select value into v_old from public.platform_settings where key = 'usd_try';
  insert into public.platform_settings (key, value, updated_at, updated_by) values ('usd_try', to_jsonb(round(p_rate, 4)), now(), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.platform_audit_log (actor_user_id, table_name, row_id, action, old_data, new_data)
  values ((select auth.uid()), 'platform_settings', 'usd_try', 'update', v_old, to_jsonb(round(p_rate, 4)));
end;
$$;
revoke all on function public.admin_set_usd_try(numeric) from public, anon;
grant execute on function public.admin_set_usd_try(numeric) to authenticated;
