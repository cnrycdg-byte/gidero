-- Gidero yöneticisi: panelden müşteri ekleme (sahibi henüz kayıtlı değilse davet), platform giderleri ve gelir-gider özeti.

-- ---------------------------------------------------------------------------
-- Davet: müşteri hesabı açılır, sahibi o e-postayla kaydolunca kendiliğinden bağlanır
-- ---------------------------------------------------------------------------
create table public.platform_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  account_id uuid not null references public.accounts (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index platform_invites_email_idx on public.platform_invites (lower(email)) where accepted_at is null;
create index platform_invites_account_idx on public.platform_invites (account_id);
create index platform_invites_company_idx on public.platform_invites (company_id);
alter table public.platform_invites enable row level security;
create policy platform_invites_admin on public.platform_invites for select to authenticated
  using ((select private.is_platform_admin()));

-- Hesabın sahibini bağlar: şirkette yönetici + muhasebeci + çalışan, büroda büro sahibi
create or replace function private.attach_owner(p_user uuid, p_account uuid, p_company uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
  if p_company is not null then
    insert into public.memberships (company_id, user_id, roles)
    values (p_company, p_user, array['employee','admin','accountant'])
    on conflict (company_id, user_id) do update set roles = excluded.roles, status = 'active';
  else
    insert into public.bureau_staff (account_id, user_id, role) values (p_account, p_user, 'owner')
    on conflict (account_id, user_id) do update set role = 'owner', status = 'active';
  end if;
end;
$$;

-- Yeni kayıt: profil + bekleyen davetler
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare inv record;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''))
  on conflict (id) do nothing;
  for inv in select * from public.platform_invites i
              where lower(i.email) = lower(new.email) and i.accepted_at is null loop
    perform private.attach_owner(new.id, inv.account_id, inv.company_id);
    update public.platform_invites set accepted_at = now() where id = inv.id;
  end loop;
  return new;
end;
$$;

create or replace function public.admin_create_customer(
  p_kind text, p_name text, p_tax_number text, p_owner_email text,
  p_plan text, p_status text, p_period text, p_seats int, p_end date, p_note text,
  p_paid_net numeric default null
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
  if p_kind = 'company' and exists (select 1 from public.companies c where c.tax_number = v_vkn and c.bureau_account_id is null) then
    raise exception 'Bu vergi numarasıyla kayıtlı bir şirket zaten var.' using errcode = '23505';
  end if;

  insert into public.accounts (kind, name) values (p_kind, v_name) returning id into v_account;
  perform public.admin_set_subscription(v_account, p_plan, coalesce(p_status, 'trial'), p_period, p_seats, p_end, p_note);
  if p_kind = 'company' then
    insert into public.companies (account_id, legal_name, tax_number) values (v_account, v_name, v_vkn) returning id into v_company;
    perform private.seed_company(v_company);
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if v_user is not null then
    perform private.attach_owner(v_user, v_account, v_company);
  else
    insert into public.platform_invites (email, account_id, company_id, created_by)
    values (v_email, v_account, v_company, (select auth.uid()));
  end if;
  -- Panelden yapılan satışın tahsilatı: gelire işlenir (elle ödeme, onaylı sipariş)
  if coalesce(p_paid_net, 0) > 0 then
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
  return jsonb_build_object('account_id', v_account, 'company_id', v_company, 'invited', v_user is null);
end;
$$;
revoke all on function public.admin_create_customer(text, text, text, text, text, text, text, int, date, text, numeric) from public, anon;
grant execute on function public.admin_create_customer(text, text, text, text, text, text, text, int, date, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Platform giderleri (Gidero'nun kendi giderleri: yazılım, yapay zekâ, reklam, muhasebe...)
-- ---------------------------------------------------------------------------
create table public.platform_expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null,
  category text not null check (category in ('altyapi', 'yapay_zeka', 'odeme', 'reklam', 'muhasebe_hukuk', 'personel', 'diger')),
  description text not null default '' check (length(description) <= 300),
  amount numeric(14,2) not null check (amount >= 0),       -- KDV hariç
  vat_amount numeric(14,2) not null default 0 check (vat_amount >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index platform_expenses_spent_on_idx on public.platform_expenses (spent_on desc);
create index platform_expenses_created_by_idx on public.platform_expenses (created_by);
alter table public.platform_expenses enable row level security;
grant select, insert, update, delete on public.platform_expenses to authenticated;
create policy platform_expenses_admin on public.platform_expenses for all to authenticated
  using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));
create trigger audit_platform_expenses after insert or update or delete on public.platform_expenses
  for each row execute function private.platform_audit();

-- Aylık gelir-gider: gelir = ödenmiş/onaylanmış siparişler (KDV hariç), gider = platform giderleri (KDV hariç)
create or replace function public.admin_finance(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform private.require_platform_admin();
  with months as (
    select to_char(d, 'YYYY-MM') as m
      from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') d
  ), rev as (
    select to_char(coalesce(o.paid_at, o.approved_at, o.created_at), 'YYYY-MM') as m,
           sum(o.net_amount) as net, sum(o.vat_amount) as vat, count(*) as n
      from public.orders o
     where o.status in ('paid', 'approved')
       and coalesce(o.paid_at, o.approved_at, o.created_at)::date between p_from and p_to
     group by 1
  ), exp as (
    select to_char(e.spent_on, 'YYYY-MM') as m, sum(e.amount) as net, sum(e.vat_amount) as vat
      from public.platform_expenses e where e.spent_on between p_from and p_to group by 1
  ), cat as (
    select e.category, sum(e.amount) as net from public.platform_expenses e
     where e.spent_on between p_from and p_to group by 1
  )
  select jsonb_build_object(
    'months', coalesce((select jsonb_agg(jsonb_build_object(
        'month', months.m,
        'revenue', coalesce(rev.net, 0), 'revenue_vat', coalesce(rev.vat, 0), 'orders', coalesce(rev.n, 0),
        'expense', coalesce(exp.net, 0), 'expense_vat', coalesce(exp.vat, 0),
        'profit', coalesce(rev.net, 0) - coalesce(exp.net, 0)) order by months.m)
      from months left join rev on rev.m = months.m left join exp on exp.m = months.m), '[]'::jsonb),
    'by_category', coalesce((select jsonb_object_agg(cat.category, cat.net) from cat), '{}'::jsonb),
    'paying_accounts', (select count(*) from public.subscriptions s where s.status = 'active'),
    'trial_accounts', (select count(*) from public.subscriptions s where s.status = 'trial')
  ) into v;
  return v;
end;
$$;
revoke all on function public.admin_finance(date, date) from public, anon;
grant execute on function public.admin_finance(date, date) to authenticated;
