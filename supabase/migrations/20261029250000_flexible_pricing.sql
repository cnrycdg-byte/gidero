-- Esnek fiyat: kaydırıcıyla kişi (şirket) ya da firma (büro) sayısı seçilir; sayı arttıkça birim fiyat kademeli düşer,
-- yıllık tek ödemede daha da düşer. Kademeler price_bands tablosunda, Gidero yöneticisi değiştirir.
-- Büroda sabit 3/5/10/50/150 paketlerin yerine firma başı fiyatlı tek esnek paket satılır (eski aboneler etkilenmez).

alter table public.plans drop constraint if exists plans_unit_check;
alter table public.plans add constraint plans_unit_check check (unit in ('user', 'account', 'company'));

create table public.price_bands (
  id uuid not null default gen_random_uuid() unique,
  plan_id text not null references public.plans (id) on delete cascade,
  min_qty int not null check (min_qty >= 1),
  factor numeric(5,4) not null check (factor > 0 and factor <= 1),
  primary key (plan_id, min_qty)
);
alter table public.price_bands enable row level security;
grant select on public.price_bands to anon, authenticated;
grant insert, update, delete on public.price_bands to authenticated;
create policy price_bands_select on public.price_bands for select to anon, authenticated using (true);
create policy price_bands_write on public.price_bands for all to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());
create trigger audit_price_bands after insert or update or delete on public.price_bands
  for each row execute function private.platform_audit();

create or replace function private.band_factor(p_plan text, p_qty int)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select b.factor from public.price_bands b where b.plan_id = p_plan and b.min_qty <= p_qty
                   order by b.min_qty desc limit 1), 1);
$$;

-- Esnek büro paketi (firma başı)
insert into public.plans (id, kind, name, description, unit, price_monthly, price_yearly_monthly, min_seats, max_companies, users_per_company, features, sort)
values ('buro_esnek', 'bureau', 'Büro', 'Müşteri firma sayısını siz seçin; firma arttıkça firma başı fiyat düşer', 'company', 199, 165, 1, null, 3,
        '["Firma başı 3 çalışan","Büro personeli sınırsız","WhatsApp ve toplu fiş yükleme","Logo, Luca, Excel aktarımı"]', 34)
on conflict (id) do nothing;
update public.plans set active = false where kind = 'bureau' and id <> 'buro_esnek';

-- Başlangıç kademeleri (fiyatlar sonra gözden geçirilecek)
insert into public.price_bands (plan_id, min_qty, factor) values
  ('sirket_baslangic', 10, 0.92), ('sirket_baslangic', 25, 0.85), ('sirket_baslangic', 50, 0.78), ('sirket_baslangic', 100, 0.70), ('sirket_baslangic', 250, 0.62),
  ('sirket_standart', 10, 0.92), ('sirket_standart', 25, 0.85), ('sirket_standart', 50, 0.78), ('sirket_standart', 100, 0.70), ('sirket_standart', 250, 0.62),
  ('sirket_pro', 25, 0.90), ('sirket_pro', 50, 0.82), ('sirket_pro', 100, 0.74), ('sirket_pro', 250, 0.65),
  ('buro_esnek', 5, 0.90), ('buro_esnek', 10, 0.80), ('buro_esnek', 25, 0.70), ('buro_esnek', 50, 0.60), ('buro_esnek', 100, 0.50), ('buro_esnek', 150, 0.45)
on conflict do nothing;

-- Site için herkese açık fiyat listesi (giriş gerekmez)
create or replace function public.public_pricing()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'name', p.name, 'description', p.description, 'unit', p.unit,
    'price_monthly', p.price_monthly, 'price_yearly_monthly', p.price_yearly_monthly, 'min_seats', p.min_seats,
    'users_per_company', p.users_per_company, 'features', p.features,
    'bands', coalesce((select jsonb_agg(jsonb_build_object('min_qty', b.min_qty, 'factor', b.factor) order by b.min_qty)
                       from public.price_bands b where b.plan_id = p.id), '[]'::jsonb)
  ) order by p.sort), '[]'::jsonb)
  from public.plans p where p.active;
$$;
revoke all on function public.public_pricing() from public;
grant execute on function public.public_pricing() to anon, authenticated;

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
  seats := case when pl.unit in ('user', 'company') then greatest(coalesce(p_seats, pl.min_seats), pl.min_seats) else 1 end;
  -- Kademeli fiyat: kişi ya da firma sayısı arttıkça birim fiyat düşer (price_bands); yıllıkta ayrıca indirimli
  unit_price := round((case p_period when 'year' then pl.price_yearly_monthly else pl.price_monthly end)
                      * private.band_factor(pl.id, seats), 2);
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
  values (o.account_id, o.plan_id, 'active', o.billing_period, o.seats,
          case pl.unit when 'company' then o.seats else pl.max_companies end,
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
          coalesce(case pl.unit when 'company' then p_seats end, pl.max_companies, case when (select kind from public.accounts where id = p_account) = 'bureau' then 3 end),
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
