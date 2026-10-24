-- Satış altyapısı: paketler, abonelikler, siparişler, kampanyalar, platform yöneticisi.
-- * Her müşteri hesabının (şirket veya muhasebe bürosu) tek bir aboneliği vardır.
-- * Yeni hesap 14 gün ücretsiz denemeyle başlar.
-- * Limitler veritabanında uygulanır: büro paketindeki firma sayısı, şirket paketindeki kullanıcı sayısı;
--   süresi biten hesap yeni rapor ve fiş giremez (eski kayıtlar görünür kalır).
-- * Kartla ödenen sipariş paketi kendiliğinden açar; havale / elle verilen paketi platform yöneticisi onaylar.

-- ---------------------------------------------------------------------------
-- Platform yöneticisi (Gidero'nun sahibi)
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
grant select on public.platform_admins to authenticated;
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid())); $$;
grant execute on function private.is_platform_admin() to authenticated;

-- Sahibin e-postası depoda açık yazılmaz; yalnızca özeti tutulur. E-postası doğrulanmış bu hesap
-- giriş yaptığında claim_platform_admin() ile yönetici olur.
create table private.platform_owner_hashes (email_sha256 text primary key);
insert into private.platform_owner_hashes values ('31f3bb28cc687fb0ccb383c4a8b23d1064b073cdf05d1f0f7af4f7295843369e');

create or replace function public.claim_platform_admin()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then return false; end if;
  if exists (
    select 1 from auth.users u
    join private.platform_owner_hashes h on h.email_sha256 = encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex')
    where u.id = v_me and u.email_confirmed_at is not null
  ) then
    insert into public.platform_admins (user_id) values (v_me) on conflict do nothing;
  end if;
  return private.is_platform_admin();
end;
$$;
revoke all on function public.claim_platform_admin() from public, anon;
grant execute on function public.claim_platform_admin() to authenticated;

-- Platform düzeyindeki değişikliklerin denetim izi (şirkete bağlı olmayan kayıtlar)
create table public.platform_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
alter table public.platform_audit_log enable row level security;
grant select on public.platform_audit_log to authenticated;
create policy platform_audit_select on public.platform_audit_log for select to authenticated
  using (private.is_platform_admin());

create or replace function private.platform_audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.platform_audit_log (table_name, row_id, action, old_data, new_data, actor_user_id)
  values (tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'account_id', v_row ->> 'code'), lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          (select auth.uid()));
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Paketler
-- ---------------------------------------------------------------------------
create table public.plans (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  kind text not null check (kind in ('company','bureau')),
  name text not null,
  description text not null default '',
  -- user: kullanıcı başı fiyat (şirket); account: hesap başı fiyat (büro)
  unit text not null check (unit in ('user','account')),
  price_monthly numeric(14,2) not null check (price_monthly >= 0),          -- aylık ödemede, aylık birim fiyat (KDV hariç)
  price_yearly_monthly numeric(14,2) not null check (price_yearly_monthly >= 0), -- yıllık ödemede, aylık birim fiyat
  min_seats int not null default 1 check (min_seats >= 1),
  max_companies int check (max_companies is null or max_companies > 0),    -- büro: müşteri firma sayısı
  users_per_company int check (users_per_company is null or users_per_company > 0), -- büro: firma başı çalışan
  features jsonb not null default '[]',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.plans enable row level security;
grant select, insert, update on public.plans to authenticated;
create policy plans_select on public.plans for select to authenticated
  using (active or private.is_platform_admin());
create policy plans_write on public.plans for all to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());
create trigger audit_plans after insert or update or delete on public.plans
  for each row execute function private.platform_audit();

insert into public.plans (id, kind, name, description, unit, price_monthly, price_yearly_monthly, min_seats, max_companies, users_per_company, features, sort) values
  ('sirket_baslangic', 'company', 'Başlangıç', 'Fiş okuma, tek adımlı onay, Excel çıktısı', 'user', 179, 149, 3, null, null,
   '["Fiş ve fatura okuma","Tek adımlı onay","Vergi uyarıları","Excel çıktısı"]', 10),
  ('sirket_standart', 'company', 'Standart', 'Çok adımlı onay, sınırlar, muhasebe programı aktarımı', 'user', 299, 249, 3, null, null,
   '["Başlangıç paketindeki her şey","Çok adımlı onay akışı","Gider grubu sınırları","Logo, Luca, Mikro, Zirve aktarımı"]', 20),
  ('sirket_pro', 'company', 'Pro', 'Masraf merkezi, proje, denetçi rolü, öncelikli destek', 'user', 479, 399, 10, null, null,
   '["Standart paketteki her şey","Masraf merkezi ve proje","Denetçi rolü","Öncelikli destek"]', 30),
  ('buro_5', 'bureau', 'Büro 5', '5 müşteri firmaya kadar', 'account', 890, 740, 1, 5, 3,
   '["5 müşteri firma","Firma başı 3 çalışan","Büro personeli sınırsız"]', 40),
  ('buro_10', 'bureau', 'Büro 10', '10 müşteri firmaya kadar', 'account', 1790, 1490, 1, 10, 3,
   '["10 müşteri firma","Firma başı 3 çalışan","Büro personeli sınırsız"]', 50),
  ('buro_50', 'bureau', 'Büro 50', '50 müşteri firmaya kadar', 'account', 5990, 4990, 1, 50, 3,
   '["50 müşteri firma","Firma başı 3 çalışan","Büro personeli sınırsız"]', 60),
  ('buro_150', 'bureau', 'Büro 150', '150 müşteri firmaya kadar', 'account', 10790, 8990, 1, 150, 3,
   '["150 müşteri firma","Firma başı 3 çalışan","Büro personeli sınırsız"]', 70)
on conflict (id) do nothing;

-- Satış KDV oranı (kodda sabit değil)
insert into public.tax_parameters (year, key, value, legal_ref) values
  (2025, 'sales_vat_rate', '20', 'KDVK 28'),
  (2026, 'sales_vat_rate', '20', 'KDVK 28'),
  (2027, 'sales_vat_rate', '20', 'KDVK 28')
on conflict (year, key) do nothing;

-- ---------------------------------------------------------------------------
-- Abonelikler
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  plan_id text references public.plans(id),
  status text not null check (status in ('trial','active','canceled','expired')),
  billing_period text check (billing_period in ('month','year')),
  seats int,                    -- şirket paketlerinde satın alınan kullanıcı sayısı
  max_companies int,            -- büro: müşteri firma hakkı (deneme dahil)
  max_users int,                -- şirket: çalışan hakkı; büro: firma başı çalışan hakkı
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
grant select on public.subscriptions to authenticated;
create trigger audit_subscriptions after insert or update or delete on public.subscriptions
  for each row execute function private.platform_audit();

-- Hesabı yöneten kişi: şirket hesabında bir şirketin yöneticisi, büroda büro sahibi
create or replace function private.can_manage_account(p_account uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_platform_admin()
      or private.is_bureau_staff(p_account, true)
      or exists (select 1 from public.companies c where c.account_id = p_account
                 and private.has_any_role(c.id, array['admin']));
$$;
grant execute on function private.can_manage_account(uuid) to authenticated;

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (private.can_manage_account(account_id));

create or replace function private.subscription_end(s public.subscriptions)
returns timestamptz language sql immutable set search_path = ''
as $$ select case s.status when 'trial' then s.trial_ends_at when 'active' then s.current_period_end end; $$;

-- Hesap aktif mi (deneme veya ödenmiş dönem içinde)
create or replace function private.account_active(p_account uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.status in ('trial','active') and coalesce(private.subscription_end(s), 'infinity') > now()
                   from public.subscriptions s where s.account_id = p_account), false);
$$;

-- Şirketin faturalandığı hesap: büroya bağlı firmada büro, değilse şirketin kendi hesabı
create or replace function private.billing_account(p_company uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select coalesce(c.bureau_account_id, c.account_id) from public.companies c where c.id = p_company; $$;

create or replace function private.company_active(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.account_active(private.billing_account(p_company)); $$;
grant execute on function private.company_active(uuid) to authenticated;

-- Mevcut hesaplara 14 günlük deneme
insert into public.subscriptions (account_id, status, trial_ends_at, max_companies, max_users)
select a.id, 'trial', now() + interval '14 days',
       case when a.kind = 'bureau' then 3 end, case when a.kind = 'bureau' then 3 else 10 end
from public.accounts a
on conflict (account_id) do nothing;

-- ---------------------------------------------------------------------------
-- Kampanyalar
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  name text not null,
  discount_type text not null check (discount_type in ('percent','amount','none')),
  discount_value numeric(14,2) not null default 0 check (discount_value >= 0),
  extra_months int not null default 0 check (extra_months between 0 and 24),  -- ör. 12 al 14 kullan
  plan_ids text[] not null default '{}',           -- boş = tüm paketler
  billing_periods text[] not null default '{}',    -- boş = aylık ve yıllık
  first_order_only boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  used_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100)
);
alter table public.campaigns enable row level security;
grant select, insert, update on public.campaigns to authenticated;
create policy campaigns_admin on public.campaigns for all to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());
create trigger audit_campaigns after insert or update or delete on public.campaigns
  for each row execute function private.platform_audit();

-- ---------------------------------------------------------------------------
-- Siparişler
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated always as identity,
  account_id uuid not null references public.accounts(id),
  plan_id text not null references public.plans(id),
  billing_period text not null check (billing_period in ('month','year')),
  seats int not null default 1 check (seats >= 1),
  months int not null,
  campaign_id uuid references public.campaigns(id),
  campaign_code text,
  list_price numeric(14,2) not null,
  discount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null,
  vat_rate numeric(5,2) not null,
  vat_amount numeric(14,2) not null,
  total numeric(14,2) not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment','paid','approved','failed','canceled','refunded')),
  payment_method text not null check (payment_method in ('card','transfer','manual')),
  provider text,
  provider_token text,
  provider_payment_id text,
  billing jsonb not null default '{}',    -- fatura bilgileri: unvan, vergi no/daire, adres, e-posta, telefon
  created_by uuid references auth.users(id),
  paid_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index orders_account_id_idx on public.orders (account_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create unique index orders_provider_token_uidx on public.orders (provider_token) where provider_token is not null;
alter table public.orders enable row level security;
grant select on public.orders to authenticated;
create policy orders_select on public.orders for select to authenticated
  using (private.can_manage_account(account_id));
create trigger audit_orders after insert or update or delete on public.orders
  for each row execute function private.platform_audit();

-- Fiyat hesabı: liste fiyatı, kampanya indirimi, KDV. Hem uygulama hem ödeme fonksiyonu bunu kullanır.
create or replace function private.compute_quote(
  p_account uuid, p_plan text, p_period text, p_seats int, p_code text,
  out plan_name text, out months int, out seats int, out list_price numeric, out discount numeric,
  out net_amount numeric, out vat_rate numeric, out vat_amount numeric, out total numeric,
  out extra_months int, out campaign_id uuid, out campaign_note text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  pl public.plans;
  cp public.campaigns;
  v_kind text;
  unit_price numeric;
begin
  select * into pl from public.plans where id = p_plan and active;
  if not found then raise exception 'Paket bulunamadı.' using errcode = 'P0002'; end if;
  select kind into v_kind from public.accounts where id = p_account;
  if v_kind is distinct from pl.kind then
    raise exception 'Bu paket % hesapları için değil.', case pl.kind when 'bureau' then 'muhasebe bürosu' else 'şirket' end
      using errcode = '22023';
  end if;
  if p_period not in ('month','year') then raise exception 'Ödeme dönemi aylık veya yıllık olmalı.' using errcode = '22023'; end if;

  plan_name := pl.name;
  months := case p_period when 'year' then 12 else 1 end;
  seats := case pl.unit when 'user' then greatest(coalesce(p_seats, pl.min_seats), pl.min_seats) else 1 end;
  unit_price := case p_period when 'year' then pl.price_yearly_monthly else pl.price_monthly end;
  list_price := round(unit_price * months * seats, 2);
  discount := 0;
  extra_months := 0;

  if nullif(btrim(coalesce(p_code, '')), '') is not null then
    select * into cp from public.campaigns where code = upper(btrim(p_code));
    if not found or not cp.active
       or (cp.starts_at is not null and now() < cp.starts_at)
       or (cp.ends_at is not null and now() > cp.ends_at)
       or (cp.max_uses is not null and cp.used_count >= cp.max_uses) then
      raise exception 'Kampanya kodu geçersiz ya da süresi dolmuş.' using errcode = '22023';
    end if;
    if cardinality(cp.plan_ids) > 0 and not (p_plan = any (cp.plan_ids)) then
      raise exception 'Bu kampanya kodu seçtiğiniz pakette geçerli değil.' using errcode = '22023';
    end if;
    if cardinality(cp.billing_periods) > 0 and not (p_period = any (cp.billing_periods)) then
      raise exception 'Bu kampanya kodu yalnızca % ödemede geçerli.',
        case when 'year' = any (cp.billing_periods) then 'yıllık' else 'aylık' end using errcode = '22023';
    end if;
    if cp.first_order_only and exists (select 1 from public.orders o where o.account_id = p_account
                                       and o.status in ('paid','approved')) then
      raise exception 'Bu kampanya yalnızca ilk siparişte geçerli.' using errcode = '22023';
    end if;
    campaign_id := cp.id;
    discount := case cp.discount_type
                  when 'percent' then round(list_price * cp.discount_value / 100, 2)
                  when 'amount' then least(cp.discount_value, list_price)
                  else 0 end;
    extra_months := cp.extra_months;
    campaign_note := cp.name;
  end if;

  net_amount := list_price - discount;
  vat_rate := coalesce((select (value #>> '{}')::numeric from public.tax_parameters
                        where key = 'sales_vat_rate' and year = extract(year from now())::int), 20);
  vat_amount := round(net_amount * vat_rate / 100, 2);
  total := net_amount + vat_amount;
end;
$$;

-- Uygulamanın gösterdiği fiyat özeti
create or replace function public.quote_order(p_account uuid, p_plan text, p_period text, p_seats int default null, p_code text default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare q record;
begin
  if not private.can_manage_account(p_account) then
    raise exception 'Bu hesabın aboneliğini yalnızca yöneticisi yönetebilir.' using errcode = '42501';
  end if;
  select * into q from private.compute_quote(p_account, p_plan, p_period, p_seats, p_code);
  return to_jsonb(q);
end;
$$;

-- Sipariş oluşturma (kart ödemesi başlamadan veya havale bildirimi için)
create or replace function public.create_order(p_account uuid, p_plan text, p_period text, p_seats int,
                                               p_code text, p_method text, p_billing jsonb)
returns public.orders
language plpgsql security definer set search_path = ''
as $$
declare
  q record;
  o public.orders;
begin
  if not private.can_manage_account(p_account) then
    raise exception 'Bu hesabın aboneliğini yalnızca yöneticisi yönetebilir.' using errcode = '42501';
  end if;
  if p_method not in ('card','transfer') then raise exception 'Geçersiz ödeme yöntemi.' using errcode = '22023'; end if;
  if coalesce(btrim(p_billing ->> 'title'), '') = '' or coalesce(p_billing ->> 'tax_number', '') !~ '^[0-9]{10,11}$'
     or coalesce(btrim(p_billing ->> 'address'), '') = '' or coalesce(btrim(p_billing ->> 'city'), '') = ''
     or coalesce(p_billing ->> 'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Fatura bilgilerini eksiksiz yazın: unvan, vergi no, adres, şehir, e-posta.' using errcode = '22023';
  end if;
  select * into q from private.compute_quote(p_account, p_plan, p_period, p_seats, p_code);
  insert into public.orders (account_id, plan_id, billing_period, seats, months, campaign_id, campaign_code,
                             list_price, discount, net_amount, vat_rate, vat_amount, total, payment_method, billing, created_by)
  values (p_account, p_plan, p_period, q.seats, q.months + q.extra_months, q.campaign_id,
          case when q.campaign_id is not null then upper(btrim(p_code)) end,
          q.list_price, q.discount, q.net_amount, q.vat_rate, q.vat_amount, q.total, p_method, p_billing, (select auth.uid()))
  returning * into o;
  return o;
end;
$$;

-- Siparişi aboneliğe uygular: aynı paket devam ediyorsa süre uzar, değilse bugünden başlar
create or replace function private.apply_order(p_order uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  o public.orders;
  pl public.plans;
  s public.subscriptions;
  v_from timestamptz;
begin
  select * into o from public.orders where id = p_order for update;
  select * into pl from public.plans where id = o.plan_id;
  select * into s from public.subscriptions where account_id = o.account_id for update;
  v_from := case when s.status = 'active' and s.plan_id = o.plan_id and s.current_period_end > now()
                 then s.current_period_end else now() end;
  insert into public.subscriptions (account_id, plan_id, status, billing_period, seats, max_companies, max_users,
                                    trial_ends_at, current_period_end, updated_at)
  values (o.account_id, o.plan_id, 'active', o.billing_period, o.seats, pl.max_companies,
          case pl.unit when 'user' then o.seats else pl.users_per_company end,
          s.trial_ends_at, v_from + make_interval(months => o.months), now())
  on conflict (account_id) do update set
    plan_id = excluded.plan_id, status = 'active', billing_period = excluded.billing_period, seats = excluded.seats,
    max_companies = excluded.max_companies, max_users = excluded.max_users,
    current_period_end = excluded.current_period_end, updated_at = now();
  if o.campaign_id is not null then
    update public.campaigns set used_count = used_count + 1 where id = o.campaign_id;
  end if;
end;
$$;

-- Kart ödemesi doğrulandığında yalnızca sunucu (service_role) çağırır
create or replace function public.complete_card_order(p_order uuid, p_payment_id text, p_paid numeric)
returns public.orders
language plpgsql security definer set search_path = ''
as $$
declare o public.orders;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Yetkisiz.' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Sipariş bulunamadı.' using errcode = 'P0002'; end if;
  if o.status in ('paid','approved') then return o; end if;   -- aynı bildirim iki kez gelebilir
  if round(p_paid, 2) <> o.total then
    update public.orders set status = 'failed', note = 'Ödenen tutar siparişle uyuşmuyor: ' || p_paid where id = o.id
    returning * into o;
    return o;
  end if;
  update public.orders set status = 'paid', paid_at = now(), provider_payment_id = p_payment_id where id = o.id;
  perform private.apply_order(o.id);
  select * into o from public.orders where id = p_order;
  return o;
end;
$$;

create or replace function public.fail_card_order(p_order uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Yetkisiz.' using errcode = '42501';
  end if;
  update public.orders set status = 'failed', note = left(p_reason, 500) where id = p_order and status = 'pending_payment';
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform yöneticisi işlemleri
-- ---------------------------------------------------------------------------
create or replace function private.require_platform_admin()
returns void language plpgsql stable security definer set search_path = ''
as $$ begin
  if not private.is_platform_admin() then raise exception 'Bu işlem yalnızca Gidero yöneticisine açık.' using errcode = '42501'; end if;
end; $$;

-- Havale siparişini veya bekleyen siparişi onaylar ve paketi açar
create or replace function public.admin_approve_order(p_order uuid, p_note text default null)
returns public.orders
language plpgsql security definer set search_path = ''
as $$
declare o public.orders;
begin
  perform private.require_platform_admin();
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Sipariş bulunamadı.' using errcode = 'P0002'; end if;
  if o.status = 'approved' then return o; end if;
  if o.status not in ('pending_payment','paid') then
    raise exception 'Bu sipariş onaylanamaz (durum: %).', o.status using errcode = 'P0001';
  end if;
  update public.orders set status = 'approved', approved_by = (select auth.uid()), approved_at = now(),
         paid_at = coalesce(paid_at, now()), note = coalesce(p_note, note)
   where id = o.id;
  if o.status = 'pending_payment' then perform private.apply_order(o.id); end if;  -- kartla ödenmişse zaten uygulandı
  select * into o from public.orders where id = p_order;
  return o;
end;
$$;

create or replace function public.admin_cancel_order(p_order uuid, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  update public.orders set status = 'canceled', note = p_note where id = p_order and status = 'pending_payment';
  if not found then raise exception 'Yalnızca ödeme bekleyen sipariş iptal edilebilir.' using errcode = 'P0001'; end if;
end;
$$;

-- Elle paket tanımlama: ör. telefonla anlaşılan müşteri, hediye süre, deneme uzatma
create or replace function public.admin_set_subscription(p_account uuid, p_plan text, p_status text,
                                                         p_period text, p_seats int, p_end date, p_note text)
returns public.subscriptions
language plpgsql security definer set search_path = ''
as $$
declare
  pl public.plans;
  s public.subscriptions;
begin
  perform private.require_platform_admin();
  if p_status not in ('trial','active','canceled','expired') then raise exception 'Geçersiz durum.' using errcode = '22023'; end if;
  if p_plan is not null then
    select * into pl from public.plans where id = p_plan;
    if not found then raise exception 'Paket bulunamadı.' using errcode = 'P0002'; end if;
  end if;
  insert into public.subscriptions (account_id, plan_id, status, billing_period, seats, max_companies, max_users,
                                    trial_ends_at, current_period_end, note, updated_at)
  values (p_account, p_plan, p_status, p_period, p_seats,
          coalesce(pl.max_companies, case when (select kind from public.accounts where id = p_account) = 'bureau' then 3 end),
          coalesce(case pl.unit when 'user' then greatest(coalesce(p_seats, pl.min_seats), pl.min_seats) else pl.users_per_company end, 10),
          case when p_status = 'trial' then p_end::timestamptz + interval '1 day' - interval '1 second' end,
          case when p_status <> 'trial' then p_end::timestamptz + interval '1 day' - interval '1 second' end,
          p_note, now())
  on conflict (account_id) do update set
    plan_id = excluded.plan_id, status = excluded.status, billing_period = excluded.billing_period,
    seats = excluded.seats, max_companies = excluded.max_companies, max_users = excluded.max_users,
    trial_ends_at = coalesce(excluded.trial_ends_at, public.subscriptions.trial_ends_at),
    current_period_end = coalesce(excluded.current_period_end, public.subscriptions.current_period_end),
    note = excluded.note, updated_at = now()
  returning * into s;
  return s;
end;
$$;

-- Müşteri listesi
create or replace function public.admin_accounts()
returns table (
  account_id uuid, kind text, name text, created_at timestamptz, owner_email text,
  plan_id text, plan_name text, status text, ends_at timestamptz, active boolean,
  companies int, max_companies int, employees int, max_users int, accountants int, last_activity timestamptz,
  open_orders int
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
  select a.id, a.kind, a.name, a.created_at,
         (select u.email::text from auth.users u
           where u.id = coalesce(
             (select bs.user_id from public.bureau_staff bs where bs.account_id = a.id and bs.role = 'owner' limit 1),
             (select m.user_id from public.memberships m join public.companies c on c.id = m.company_id
               where c.account_id = a.id and 'admin' = any (m.roles) order by m.created_at limit 1))),
         s.plan_id, p.name, coalesce(s.status, 'expired'), private.subscription_end(s), private.account_active(a.id),
         (select count(*)::int from public.companies c where coalesce(c.bureau_account_id, c.account_id) = a.id),
         s.max_companies,
         (select count(distinct m.user_id)::int from public.memberships m join public.companies c on c.id = m.company_id
           where coalesce(c.bureau_account_id, c.account_id) = a.id and m.status = 'active' and 'employee' = any (m.roles)),
         s.max_users,
         (select count(distinct x.user_id)::int from (
            select m.user_id from public.memberships m join public.companies c on c.id = m.company_id
             where coalesce(c.bureau_account_id, c.account_id) = a.id and m.status = 'active' and 'accountant' = any (m.roles)
            union select bs.user_id from public.bureau_staff bs where bs.account_id = a.id and bs.status = 'active') x),
         (select max(e.created_at) from public.expenses e join public.companies c on c.id = e.company_id
           where coalesce(c.bureau_account_id, c.account_id) = a.id),
         (select count(*)::int from public.orders o where o.account_id = a.id and o.status in ('pending_payment','paid'))
  from public.accounts a
  left join public.subscriptions s on s.account_id = a.id
  left join public.plans p on p.id = s.plan_id
  order by a.created_at desc;
end;
$$;

-- Müşteri detayı: firmalar ve kişiler
create or replace function public.admin_account_people(p_account uuid)
returns table (company_id uuid, company_name text, tax_number text, user_id uuid, full_name text, email text,
               roles text[], member_status text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
  select c.id, c.legal_name, c.tax_number, m.user_id, coalesce(pr.full_name, ''), u.email::text, m.roles, m.status
  from public.companies c
  left join public.memberships m on m.company_id = c.id
  left join public.profiles pr on pr.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where coalesce(c.bureau_account_id, c.account_id) = p_account
  union all
  select null, 'Büro personeli', null, bs.user_id, coalesce(pr.full_name, ''), u.email::text,
         array[case bs.role when 'owner' then 'bureau_owner' else 'bureau_accountant' end], bs.status
  from public.bureau_staff bs
  left join public.profiles pr on pr.id = bs.user_id
  left join auth.users u on u.id = bs.user_id
  where bs.account_id = p_account
  order by 2, 5;
end;
$$;

-- Platform yöneticisi her şeyi okuyabilsin (yalnızca okuma)
create policy accounts_platform_select on public.accounts for select to authenticated using (private.is_platform_admin());
create policy companies_platform_select on public.companies for select to authenticated using (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Müşteri tarafı: büro hesabı, müşteri firma, hesap durumu
-- ---------------------------------------------------------------------------

-- Yeni şirket/firmaya varsayılan kategoriler ve onay akışı
create or replace function private.seed_company(p_company uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_flow uuid;
begin
  insert into public.categories (company_id, name, expense_account, default_vat_rate, tax_rule, attendees_required) values
    (p_company, 'Yemek',                 '770.01', 10, 'meal',           true),
    (p_company, 'Temsil ve ağırlama',    '770.02', 10, 'representation', true),
    (p_company, 'Konaklama',             '770.03', 10, 'accommodation',  false),
    (p_company, 'Akaryakıt',             '770.04', 20, 'fuel',           false),
    (p_company, 'Araç gideri',           '770.05', 20, 'car_running',    false),
    (p_company, 'Ulaşım (taksi, bilet)', '770.06', 20, 'travel',         false),
    (p_company, 'Kırtasiye ve ofis',     '770.07', 20, 'standard',       false),
    (p_company, 'Diğer',                 '770.99', 20, 'standard',       false);
  insert into public.approval_flows (company_id, name, priority)
    values (p_company, 'Yönetici onayı', 0) returning id into v_flow;
  insert into public.approval_steps (flow_id, company_id, position, name, approver_type)
    values (v_flow, p_company, 0, 'Yönetici', 'manager');
end;
$$;

-- Şirket kurulumu: deneme aboneliği de açılır
create or replace function public.create_company(p_legal_name text, p_tax_number text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(coalesce(p_legal_name, ''));
  v_vkn text := regexp_replace(coalesce(p_tax_number, ''), '\D', '', 'g');
  v_account uuid;
  v_company uuid;
begin
  if v_uid is null then raise exception 'Oturum gerekli.' using errcode = '42501'; end if;
  if length(v_name) < 2 then raise exception 'Şirket adını yazın.' using errcode = '22023'; end if;
  if v_vkn !~ '^[0-9]{10,11}$' then
    raise exception 'Vergi numarası 10, TC kimlik numarası 11 haneli olmalı.' using errcode = '22023';
  end if;
  if (select count(*) from public.memberships m where m.user_id = v_uid and 'admin' = any (m.roles)) >= 5 then
    raise exception 'En fazla 5 şirket kurabilirsiniz. Daha fazlası için bizimle iletişime geçin.' using errcode = 'P0001';
  end if;
  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.accounts (kind, name) values ('company', v_name) returning id into v_account;
  insert into public.subscriptions (account_id, status, trial_ends_at, max_users)
    values (v_account, 'trial', now() + interval '14 days', 10);
  insert into public.companies (account_id, legal_name, tax_number)
    values (v_account, v_name, v_vkn) returning id into v_company;
  insert into public.memberships (company_id, user_id, roles)
    values (v_company, v_uid, array['employee','admin','accountant']);
  perform private.seed_company(v_company);
  return v_company;
end;
$$;

-- Muhasebe bürosu kurulumu
create or replace function public.create_bureau(p_name text, p_tax_number text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(coalesce(p_name, ''));
  v_vkn text := regexp_replace(coalesce(p_tax_number, ''), '\D', '', 'g');
  v_account uuid;
begin
  if v_uid is null then raise exception 'Oturum gerekli.' using errcode = '42501'; end if;
  if length(v_name) < 2 then raise exception 'Büronun adını yazın.' using errcode = '22023'; end if;
  if v_vkn !~ '^[0-9]{10,11}$' then
    raise exception 'Vergi numarası 10, TC kimlik numarası 11 haneli olmalı.' using errcode = '22023';
  end if;
  if (select count(*) from public.bureau_staff s where s.user_id = v_uid and s.role = 'owner') >= 3 then
    raise exception 'En fazla 3 büro hesabı açabilirsiniz.' using errcode = 'P0001';
  end if;
  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.accounts (kind, name) values ('bureau', v_name) returning id into v_account;
  insert into public.subscriptions (account_id, status, trial_ends_at, max_companies, max_users)
    values (v_account, 'trial', now() + interval '14 days', 3, 3);
  insert into public.bureau_staff (account_id, user_id, role) values (v_account, v_uid, 'owner');
  return v_account;
end;
$$;

-- Büro müşteri firma ekler (paket sınırı uygulanır)
create or replace function public.bureau_add_company(p_account uuid, p_legal_name text, p_tax_number text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_legal_name, ''));
  v_vkn text := regexp_replace(coalesce(p_tax_number, ''), '\D', '', 'g');
  v_max int;
  v_used int;
  v_company uuid;
begin
  if not private.is_bureau_staff(p_account, true) then
    raise exception 'Müşteri firmayı yalnızca büro sahibi ekleyebilir.' using errcode = '42501';
  end if;
  if not private.account_active(p_account) then
    raise exception 'Büro aboneliğiniz sona erdi. Firma eklemek için paketinizi yenileyin.' using errcode = 'P0001';
  end if;
  if length(v_name) < 2 then raise exception 'Firmanın adını yazın.' using errcode = '22023'; end if;
  if v_vkn !~ '^[0-9]{10,11}$' then
    raise exception 'Vergi numarası 10, TC kimlik numarası 11 haneli olmalı.' using errcode = '22023';
  end if;
  select max_companies into v_max from public.subscriptions where account_id = p_account;
  select count(*) into v_used from public.companies where bureau_account_id = p_account;
  if v_max is not null and v_used >= v_max then
    raise exception 'Paketinizdeki % firma hakkının hepsi kullanılıyor. Daha fazla firma için paketinizi büyütün.', v_max
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.companies where bureau_account_id = p_account and tax_number = v_vkn) then
    raise exception 'Bu vergi numarasıyla bir firmanız zaten var.' using errcode = '23505';
  end if;
  insert into public.companies (account_id, bureau_account_id, legal_name, tax_number)
    values (p_account, p_account, v_name, v_vkn) returning id into v_company;
  perform private.seed_company(v_company);
  return v_company;
end;
$$;

-- Ekibe kişi ekleme: paketin kullanıcı sınırı uygulanır (çalışan rolü sayılır; onaylayıcı ve muhasebeci ücretsiz)
create or replace function public.add_member(p_company uuid, p_email text, p_roles text[] default array['employee'],
                                             p_manager uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_manager uuid := coalesce(p_manager, (select auth.uid()));
  v_account uuid := private.billing_account(p_company);
  v_kind text;
  v_max int;
  v_used int;
begin
  if not private.has_any_role(p_company, array['admin']) then
    raise exception 'Kişi eklemek için yönetici olmalısınız.' using errcode = '42501';
  end if;
  if not private.account_active(v_account) then
    raise exception 'Aboneliğiniz sona erdi. Kişi eklemek için paketinizi yenileyin.' using errcode = 'P0001';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Bu e-postayla kayıtlı kullanıcı yok. Önce kişinin Gidero''ya kaydolmasını isteyin.'
      using errcode = 'P0002';
  end if;
  if 'employee' = any (coalesce(p_roles, array['employee'])) and not exists (
       select 1 from public.memberships m where m.company_id = p_company and m.user_id = v_user
         and m.status = 'active' and 'employee' = any (m.roles)) then
    select kind into v_kind from public.accounts where id = v_account;
    select max_users into v_max from public.subscriptions where account_id = v_account;
    select count(distinct m.user_id) into v_used from public.memberships m join public.companies c on c.id = m.company_id
     where m.status = 'active' and 'employee' = any (m.roles)
       and (case when v_kind = 'bureau' then c.id = p_company else c.account_id = v_account end);
    if v_max is not null and v_used >= v_max then
      raise exception 'Paketinizdeki % çalışan hakkı dolu. Onaylayıcı ve muhasebeci rolleri ücretsizdir; çalışan eklemek için paketinizi büyütün.', v_max
        using errcode = 'P0001';
    end if;
  end if;
  if v_user = v_manager then v_manager := null; end if;
  if v_manager is not null and not exists (
      select 1 from public.memberships m where m.company_id = p_company and m.user_id = v_manager and m.status = 'active') then
    v_manager := null;   -- büro personeli ekliyorsa yöneticisi firmada değildir
  end if;
  insert into public.memberships (company_id, user_id, roles, manager_user_id)
  values (p_company, v_user, coalesce(p_roles, array['employee']), v_manager)
  on conflict (company_id, user_id) do update
    set roles = excluded.roles, manager_user_id = excluded.manager_user_id, status = 'active';
  return v_user;
end;
$$;

-- Süresi biten hesapta yeni rapor ve fiş girilemez
drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (
  status = 'draft' and created_by = (select auth.uid())
  and private.company_active(company_id)
  and (
    (owner_user_id = (select auth.uid()) and private.is_member(company_id))
    or private.has_any_role(company_id, array['accountant'])
  )
  and exists (select 1 from public.memberships m where m.company_id = reports.company_id
              and m.user_id = owner_user_id and m.status = 'active')
);
drop policy expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated with check (
  created_by = (select auth.uid()) and private.can_edit_report(report_id)
  and private.company_active(company_id)
  and exists (select 1 from public.reports r where r.id = report_id and r.company_id = expenses.company_id)
);

-- Kullanıcının çalışma alanı: erişebildiği firmalar (üyelik + büro), bürolar, platform yöneticiliği
create or replace function public.my_workspace()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then return null; end if;
  return jsonb_build_object(
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'company_id', c.id, 'legal_name', c.legal_name, 'tax_number', c.tax_number,
        'roles', to_jsonb(private.my_roles(c.id)),
        'vehicle_plates', to_jsonb(coalesce((select m.vehicle_plates from public.memberships m
                                             where m.company_id = c.id and m.user_id = v_me), '{}'::text[])),
        'bureau_account_id', c.bureau_account_id,
        'billing_account_id', private.billing_account(c.id),
        'active', private.company_active(c.id)
      ) order by c.legal_name)
      from public.companies c where cardinality(private.my_roles(c.id)) > 0), '[]'::jsonb),
    'bureaus', coalesce((
      select jsonb_agg(jsonb_build_object('account_id', a.id, 'name', a.name, 'role', s.role))
      from public.bureau_staff s join public.accounts a on a.id = s.account_id
      where s.user_id = v_me and s.status = 'active'), '[]'::jsonb),
    'platform_admin', private.is_platform_admin()
  );
end;
$$;

-- Hesap durumu: paket, süre, kullanım (abonelik ekranı ve uyarı şeridi için)
create or replace function public.account_status(p_account uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.subscriptions;
  a public.accounts;
begin
  select * into a from public.accounts where id = p_account;
  if not found then raise exception 'Hesap bulunamadı.' using errcode = 'P0002'; end if;
  if not (private.can_manage_account(p_account)
          or exists (select 1 from public.companies c where coalesce(c.bureau_account_id, c.account_id) = p_account
                     and private.is_member(c.id))) then
    raise exception 'Bu hesabı göremezsiniz.' using errcode = '42501';
  end if;
  select * into s from public.subscriptions where account_id = p_account;
  return jsonb_build_object(
    'account_id', a.id, 'kind', a.kind, 'name', a.name,
    'plan_id', s.plan_id, 'plan_name', (select name from public.plans where id = s.plan_id),
    'status', coalesce(s.status, 'expired'), 'billing_period', s.billing_period,
    'ends_at', private.subscription_end(s), 'active', private.account_active(a.id),
    'can_manage', private.can_manage_account(a.id),
    'max_companies', s.max_companies, 'max_users', s.max_users, 'seats', s.seats,
    'companies_used', (select count(*) from public.companies c where coalesce(c.bureau_account_id, c.account_id) = a.id),
    'users_used', (select count(distinct m.user_id) from public.memberships m join public.companies c on c.id = m.company_id
                   where coalesce(c.bureau_account_id, c.account_id) = a.id and m.status = 'active' and 'employee' = any (m.roles))
  );
end;
$$;

-- Yetkiler
revoke all on function public.quote_order(uuid, text, text, int, text) from public, anon;
revoke all on function public.create_order(uuid, text, text, int, text, text, jsonb) from public, anon;
revoke all on function public.complete_card_order(uuid, text, numeric) from public, anon;
revoke all on function public.fail_card_order(uuid, text) from public, anon;
revoke all on function public.admin_approve_order(uuid, text) from public, anon;
revoke all on function public.admin_cancel_order(uuid, text) from public, anon;
revoke all on function public.admin_set_subscription(uuid, text, text, text, int, date, text) from public, anon;
revoke all on function public.admin_accounts() from public, anon;
revoke all on function public.admin_account_people(uuid) from public, anon;
revoke all on function public.create_bureau(text, text) from public, anon;
revoke all on function public.bureau_add_company(uuid, text, text) from public, anon;
revoke all on function public.my_workspace() from public, anon;
revoke all on function public.account_status(uuid) from public, anon;
grant execute on function public.quote_order(uuid, text, text, int, text) to authenticated;
grant execute on function public.create_order(uuid, text, text, int, text, text, jsonb) to authenticated;
grant execute on function public.complete_card_order(uuid, text, numeric) to authenticated, service_role;
grant execute on function public.fail_card_order(uuid, text) to authenticated, service_role;
grant execute on function public.admin_approve_order(uuid, text) to authenticated;
grant execute on function public.admin_cancel_order(uuid, text) to authenticated;
grant execute on function public.admin_set_subscription(uuid, text, text, text, int, date, text) to authenticated;
grant execute on function public.admin_accounts() to authenticated;
grant execute on function public.admin_account_people(uuid) to authenticated;
grant execute on function public.create_bureau(text, text) to authenticated;
grant execute on function public.bureau_add_company(uuid, text, text) to authenticated;
grant execute on function public.my_workspace() to authenticated;
grant execute on function public.account_status(uuid) to authenticated;
grant execute on function private.account_active(uuid) to authenticated;
grant execute on function private.billing_account(uuid) to authenticated;
