-- Gidero çekirdek şema: hesaplar, şirketler, üyelikler, büro erişimi, masraf yapısı,
-- onay akışı, vergi parametreleri ve denetim izi.
-- İlke: her iş tablosu company_id taşır ve RLS ile korunur. Durum değişiklikleri
-- (gönderme, onay, red) yalnızca security definer RPC fonksiyonlarıyla yapılır.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Hesap ve şirket
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('company', 'bureau')),
  name text not null,
  plan text not null default 'trial',
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  bureau_account_id uuid references public.accounts(id),
  legal_name text not null,
  tax_number text not null check (tax_number ~ '^[0-9]{10,11}$'),
  tax_office text,
  accounting_software text check (accounting_software in ('logo','mikro','netsis','luca','zirve','eta','parasut','other')),
  -- binek araç: kabul edilmeyen %30'un KDV'si indirilsin mi (YMM teyidiyle belirlenir)
  car_kkeg_vat_deductible boolean not null default false,
  okc_vat_policy text not null default 'cautious' check (okc_vat_policy in ('cautious','flexible')),
  created_at timestamptz not null default now(),
  unique (account_id, tax_number)
);
create index companies_account_id_idx on public.companies (account_id);
create index companies_bureau_account_id_idx on public.companies (bureau_account_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  roles text[] not null default '{employee}'
    check (roles <@ array['employee','approver','cost_center_owner','accountant','admin','auditor']::text[]
           and cardinality(roles) > 0),
  manager_user_id uuid references auth.users(id),
  default_cost_center_id uuid,
  personnel_account_code text,          -- 335.xx alt hesabı
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index memberships_user_id_company_id_idx on public.memberships (user_id, company_id);
create index memberships_manager_user_id_idx on public.memberships (manager_user_id);

-- Büro personeli ve hangi müşteri şirketlere baktıkları
create table public.bureau_staff (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','accountant')),
  status text not null default 'active' check (status in ('active','inactive')),
  primary key (account_id, user_id)
);
create index bureau_staff_user_id_idx on public.bureau_staff (user_id);

create table public.bureau_assignments (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (account_id, user_id, company_id)
);
create index bureau_assignments_company_id_idx on public.bureau_assignments (company_id);
create index bureau_assignments_user_id_idx on public.bureau_assignments (user_id);

-- ---------------------------------------------------------------------------
-- Şirket ayarları
-- ---------------------------------------------------------------------------

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  parent_id uuid references public.cost_centers(id),
  owner_user_id uuid references auth.users(id),
  monthly_budget numeric(14,2),
  external_code text,                    -- Logo/Mikro masraf merkezi kodu
  active boolean not null default true,
  unique (company_id, code)
);
create index cost_centers_parent_id_idx on public.cost_centers (parent_id);
create index cost_centers_owner_user_id_idx on public.cost_centers (owner_user_id);

alter table public.memberships
  add constraint memberships_default_cost_center_fk
  foreign key (default_cost_center_id) references public.cost_centers(id);
create index memberships_default_cost_center_id_idx on public.memberships (default_cost_center_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  starts_on date,
  ends_on date,
  active boolean not null default true,
  unique (company_id, code)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  expense_account text not null,          -- 770.01.001 gibi
  default_vat_rate numeric(5,2),
  tax_rule text not null default 'standard'
    check (tax_rule in ('standard','meal','representation','accommodation','fuel','car_running','car_rent','travel','kkeg','mileage','per_diem')),
  attendees_required boolean not null default false,
  per_unit_limit numeric(14,2),
  active boolean not null default true,
  unique (company_id, name)
);

-- ---------------------------------------------------------------------------
-- Onay akışı
-- ---------------------------------------------------------------------------

create table public.approval_flows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  priority int not null default 0,        -- büyük olan önce denenir
  min_total numeric(14,2),                -- kapsam: rapor toplamı en az
  cost_center_ids uuid[] not null default '{}',  -- boş = tüm merkezler
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index approval_flows_company_id_idx on public.approval_flows (company_id);

create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.approval_flows(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  position int not null,
  name text not null,
  approver_type text not null check (approver_type in ('manager','skip_level','cost_center_owner','user','role')),
  approver_user_id uuid references auth.users(id),
  approver_role text check (approver_role in ('approver','accountant','admin')),
  min_total numeric(14,2),                -- adım koşulu: rapor toplamı en az
  unique (flow_id, position),
  check ((approver_type = 'user') = (approver_user_id is not null)),
  check ((approver_type = 'role') = (approver_role is not null))
);
create index approval_steps_company_id_idx on public.approval_steps (company_id);
create index approval_steps_approver_user_id_idx on public.approval_steps (approver_user_id);

-- ---------------------------------------------------------------------------
-- Raporlar ve masraflar
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  created_by uuid not null references auth.users(id),
  title text not null,
  period text check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  cost_center_id uuid references public.cost_centers(id),
  status text not null default 'draft'
    check (status in ('draft','pending','returned','approved','booked','exported')),
  flow_id uuid references public.approval_flows(id),
  flow_snapshot jsonb,                    -- gönderim anındaki adımlar (akış sonradan değişse de korunur)
  current_step int,
  current_approver_ids uuid[] not null default '{}',
  total numeric(14,2) not null default 0,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_company_id_status_idx on public.reports (company_id, status);
create index reports_owner_user_id_idx on public.reports (owner_user_id);
create index reports_created_by_idx on public.reports (created_by);
create index reports_cost_center_id_idx on public.reports (cost_center_id);
create index reports_flow_id_idx on public.reports (flow_id);
create index reports_current_approver_ids_idx on public.reports using gin (current_approver_ids);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  doc_type text not null default 'unknown'
    check (doc_type in ('e_fatura','e_arsiv','okc_fis','akaryakit_okc','serbest_meslek','gider_pusulasi',
                        'bilet','yurtdisi_fatura','dekont','no_document','unknown')),
  seller_name text,
  seller_vkn text,
  buyer_vkn text,
  doc_date date,
  doc_no text,
  ettn uuid,
  plate text,
  currency char(3) not null default 'TRY',
  total numeric(14,2) not null check (total >= 0),
  read_total numeric(14,2),               -- okunan toplam (karşılaştırma için)
  read_source text check (read_source in ('qr','ai','user')),
  payment_method text not null default 'personal'
    check (payment_method in ('personal','company_card','cash_advance','cash')),
  category_id uuid references public.categories(id),
  cost_center_id uuid references public.cost_centers(id),
  project_id uuid references public.projects(id),
  description text not null default '',
  attendees text[] not null default '{}',
  image_path text,
  image_sha256 text,
  original_received boolean not null default false,  -- kâğıt asıl muhasebeye teslim edildi mi
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_report_id_idx on public.expenses (report_id);
create index expenses_company_id_idx on public.expenses (company_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index expenses_category_id_idx on public.expenses (category_id);
create index expenses_cost_center_id_idx on public.expenses (cost_center_id);
create index expenses_project_id_idx on public.expenses (project_id);
create index expenses_company_ettn_idx on public.expenses (company_id, ettn) where ettn is not null;
create index expenses_company_sha_idx on public.expenses (company_id, image_sha256) where image_sha256 is not null;
create index expenses_company_seller_doc_idx on public.expenses (company_id, seller_vkn, doc_no) where doc_no is not null;

create table public.expense_vat_lines (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  rate numeric(5,2) not null,
  base numeric(14,2) not null,
  vat numeric(14,2) not null
);
create index expense_vat_lines_expense_id_idx on public.expense_vat_lines (expense_id);
create index expense_vat_lines_company_id_idx on public.expense_vat_lines (company_id);

-- Vergi motorunun ürettiği uyarılar (yalnızca sunucu yazar)
create table public.expense_flags (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  severity text not null check (severity in ('info','warning','critical')),
  message text not null,
  legal_ref text,
  created_at timestamptz not null default now()
);
create index expense_flags_expense_id_idx on public.expense_flags (expense_id);
create index expense_flags_company_id_idx on public.expense_flags (company_id);

create table public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  step_position int,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in ('submitted','approved','returned','auto_approved','booked_without_approval')),
  note text,
  created_at timestamptz not null default now()
);
create index approval_actions_report_id_idx on public.approval_actions (report_id);
create index approval_actions_company_id_idx on public.approval_actions (company_id);
create index approval_actions_actor_user_id_idx on public.approval_actions (actor_user_id);

-- ---------------------------------------------------------------------------
-- Vergi parametreleri (global, yıl bazlı) ve denetim izi
-- ---------------------------------------------------------------------------

create table public.tax_parameters (
  year int not null,
  key text not null,
  value jsonb not null,
  legal_ref text,
  source_url text,
  verified_by text,                      -- YMM teyidi; boşsa üretimde uyarı
  primary key (year, key)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
create index audit_log_company_id_created_at_idx on public.audit_log (company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Yetki yardımcıları (private şema, RLS'yi aşarak sadece kimlik kontrolü yapar)
-- ---------------------------------------------------------------------------

-- Çağıranın şirketteki rolleri: üyelikten + büro erişiminden
create or replace function private.my_roles(p_company uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct r), '{}')
  from (
    select unnest(m.roles) as r
    from public.memberships m
    where m.company_id = p_company and m.user_id = (select auth.uid()) and m.status = 'active'
    union all
    select unnest(case s.role when 'owner' then array['accountant','admin','auditor']
                              else array['accountant','auditor'] end)
    from public.companies c
    join public.bureau_staff s on s.account_id = c.bureau_account_id
    where c.id = p_company and s.user_id = (select auth.uid()) and s.status = 'active'
      and (s.role = 'owner' or exists (
            select 1 from public.bureau_assignments a
            where a.company_id = c.id and a.user_id = s.user_id and a.account_id = s.account_id))
  ) x;
$$;

create or replace function private.has_any_role(p_company uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.my_roles(p_company) && p_roles; $$;

create or replace function private.is_member(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select cardinality(private.my_roles(p_company)) > 0; $$;

create or replace function private.can_view_report(p_report uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
    where r.id = p_report and (
      r.owner_user_id = (select auth.uid())
      or r.created_by = (select auth.uid())
      or (select auth.uid()) = any (r.current_approver_ids)
      or private.has_any_role(r.company_id, array['accountant','admin','auditor'])
      or exists (select 1 from public.approval_actions a
                 where a.report_id = r.id and a.actor_user_id = (select auth.uid()))
      or exists (select 1 from public.memberships m
                 where m.company_id = r.company_id and m.user_id = r.owner_user_id
                   and m.manager_user_id = (select auth.uid()))
      or exists (select 1 from public.cost_centers cc
                 where cc.id = r.cost_center_id and cc.owner_user_id = (select auth.uid()))
    )
  );
$$;

create or replace function private.can_edit_report(p_report uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
    where r.id = p_report and (
      (r.owner_user_id = (select auth.uid()) and r.status in ('draft','returned')
         and private.is_member(r.company_id))
      or (r.created_by = (select auth.uid()) and r.status in ('draft','returned','approved')
         and private.has_any_role(r.company_id, array['accountant']))
      or (r.status in ('pending','approved') and r.owner_user_id <> (select auth.uid())
         and private.has_any_role(r.company_id, array['accountant']))
    )
  );
$$;

create or replace function private.shares_company(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships them
    where them.user_id = p_user and private.is_member(them.company_id)
  );
$$;

create or replace function private.is_bureau_staff(p_account uuid, p_owner_only boolean)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.bureau_staff s
                 where s.account_id = p_account and s.user_id = (select auth.uid())
                   and s.status = 'active' and (not p_owner_only or s.role = 'owner'));
$$;

revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.bureau_staff enable row level security;
alter table public.bureau_assignments enable row level security;
alter table public.cost_centers enable row level security;
alter table public.projects enable row level security;
alter table public.categories enable row level security;
alter table public.approval_flows enable row level security;
alter table public.approval_steps enable row level security;
alter table public.reports enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_vat_lines enable row level security;
alter table public.expense_flags enable row level security;
alter table public.approval_actions enable row level security;
alter table public.tax_parameters enable row level security;
alter table public.audit_log enable row level security;

-- Varsayılan Supabase yetkilerini daraltıp açıkça veriyoruz
revoke all on all tables in schema public from anon, authenticated;

grant select on public.accounts, public.companies, public.profiles, public.memberships,
  public.bureau_staff, public.bureau_assignments, public.cost_centers, public.projects,
  public.categories, public.approval_flows, public.approval_steps, public.reports,
  public.expenses, public.expense_vat_lines, public.expense_flags, public.approval_actions,
  public.tax_parameters, public.audit_log to authenticated;

grant update (legal_name, tax_office, accounting_software, car_kkeg_vat_deductible, okc_vat_policy)
  on public.companies to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant insert, update, delete on public.memberships, public.cost_centers, public.projects,
  public.categories, public.approval_flows, public.approval_steps to authenticated;
grant insert, delete on public.bureau_assignments to authenticated;
grant insert on public.reports to authenticated;
grant update (title, period, cost_center_id) on public.reports to authenticated;
grant delete on public.reports to authenticated;
grant insert, delete on public.expenses, public.expense_vat_lines to authenticated;
grant update (doc_type, seller_name, seller_vkn, buyer_vkn, doc_date, doc_no, ettn, plate, currency,
  total, payment_method, category_id, cost_center_id, project_id, description, attendees,
  image_path, image_sha256, original_received) on public.expenses to authenticated;
grant update (rate, base, vat) on public.expense_vat_lines to authenticated;

-- accounts
create policy accounts_select on public.accounts for select to authenticated using (
  private.is_bureau_staff(id, false)
  or exists (select 1 from public.companies c where c.account_id = accounts.id
             and private.has_any_role(c.id, array['admin']))
);

-- companies
create policy companies_select on public.companies for select to authenticated
  using (private.is_member(id));
create policy companies_update on public.companies for update to authenticated
  using (private.has_any_role(id, array['admin'])) with check (private.has_any_role(id, array['admin']));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_company(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (private.is_member(company_id));
create policy memberships_write on public.memberships for all to authenticated
  using (private.has_any_role(company_id, array['admin']))
  with check (private.has_any_role(company_id, array['admin']));

-- büro (kendine referans döngüsünü önlemek için security definer yardımcı kullanılır)
create policy bureau_staff_select on public.bureau_staff for select to authenticated
  using (private.is_bureau_staff(account_id, false));
create policy bureau_assignments_select on public.bureau_assignments for select to authenticated
  using (private.is_bureau_staff(account_id, false));
create policy bureau_assignments_write on public.bureau_assignments for all to authenticated
  using (private.is_bureau_staff(account_id, true))
  with check (
    private.is_bureau_staff(account_id, true)
    and exists (select 1 from public.companies c where c.id = company_id
                and c.bureau_account_id = bureau_assignments.account_id)
  );

-- şirket ayarları: üyeler okur, yönetici yazar (kategori ve hesap planını muhasebeci de yazar)
create policy cost_centers_select on public.cost_centers for select to authenticated using (private.is_member(company_id));
create policy cost_centers_write on public.cost_centers for all to authenticated
  using (private.has_any_role(company_id, array['admin'])) with check (private.has_any_role(company_id, array['admin']));
create policy projects_select on public.projects for select to authenticated using (private.is_member(company_id));
create policy projects_write on public.projects for all to authenticated
  using (private.has_any_role(company_id, array['admin'])) with check (private.has_any_role(company_id, array['admin']));
create policy categories_select on public.categories for select to authenticated using (private.is_member(company_id));
create policy categories_write on public.categories for all to authenticated
  using (private.has_any_role(company_id, array['admin','accountant']))
  with check (private.has_any_role(company_id, array['admin','accountant']));
create policy approval_flows_select on public.approval_flows for select to authenticated using (private.is_member(company_id));
create policy approval_flows_write on public.approval_flows for all to authenticated
  using (private.has_any_role(company_id, array['admin'])) with check (private.has_any_role(company_id, array['admin']));
create policy approval_steps_select on public.approval_steps for select to authenticated using (private.is_member(company_id));
create policy approval_steps_write on public.approval_steps for all to authenticated
  using (private.has_any_role(company_id, array['admin']))
  with check (private.has_any_role(company_id, array['admin'])
              and exists (select 1 from public.approval_flows f where f.id = flow_id and f.company_id = approval_steps.company_id));

-- raporlar
create policy reports_select on public.reports for select to authenticated using (private.can_view_report(id));
create policy reports_insert on public.reports for insert to authenticated with check (
  status = 'draft' and created_by = (select auth.uid())
  and (
    (owner_user_id = (select auth.uid()) and private.is_member(company_id))
    or private.has_any_role(company_id, array['accountant'])
  )
  and exists (select 1 from public.memberships m where m.company_id = reports.company_id
              and m.user_id = owner_user_id and m.status = 'active')
);
create policy reports_update on public.reports for update to authenticated
  using (private.can_edit_report(id)) with check (private.can_edit_report(id));
create policy reports_delete on public.reports for delete to authenticated using (
  status = 'draft' and (owner_user_id = (select auth.uid()) or created_by = (select auth.uid()))
);

-- masraflar: görünürlük ve düzenleme raporundan gelir
create policy expenses_select on public.expenses for select to authenticated using (private.can_view_report(report_id));
create policy expenses_insert on public.expenses for insert to authenticated with check (
  created_by = (select auth.uid()) and private.can_edit_report(report_id)
  and exists (select 1 from public.reports r where r.id = report_id and r.company_id = expenses.company_id)
);
create policy expenses_update on public.expenses for update to authenticated
  using (private.can_edit_report(report_id)) with check (private.can_edit_report(report_id));
create policy expenses_delete on public.expenses for delete to authenticated using (private.can_edit_report(report_id));

create policy expense_vat_lines_select on public.expense_vat_lines for select to authenticated using (
  exists (select 1 from public.expenses e where e.id = expense_id and private.can_view_report(e.report_id))
);
create policy expense_vat_lines_write on public.expense_vat_lines for all to authenticated using (
  exists (select 1 from public.expenses e where e.id = expense_id and private.can_edit_report(e.report_id))
) with check (
  exists (select 1 from public.expenses e where e.id = expense_id and e.company_id = expense_vat_lines.company_id
          and private.can_edit_report(e.report_id))
);

create policy expense_flags_select on public.expense_flags for select to authenticated using (
  exists (select 1 from public.expenses e where e.id = expense_id and private.can_view_report(e.report_id))
);
create policy approval_actions_select on public.approval_actions for select to authenticated using (
  private.can_view_report(report_id)
);
create policy tax_parameters_select on public.tax_parameters for select to authenticated using (true);
create policy audit_log_select on public.audit_log for select to authenticated using (
  private.has_any_role(company_id, array['admin','accountant','auditor'])
);

-- ---------------------------------------------------------------------------
-- Denetim izi ve updated_at
-- ---------------------------------------------------------------------------

create or replace function private.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (company_id, table_name, row_id, action, old_data, new_data, actor_user_id)
  values ((v_row ->> 'company_id')::uuid, tg_table_name, (v_row ->> 'id')::uuid, lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          (select auth.uid()));
  return coalesce(new, old);
end;
$$;

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

create trigger reports_touch before update on public.reports for each row execute function private.touch_updated_at();
create trigger expenses_touch before update on public.expenses for each row execute function private.touch_updated_at();

create trigger audit_reports after insert or update or delete on public.reports for each row execute function private.audit_row();
create trigger audit_expenses after insert or update or delete on public.expenses for each row execute function private.audit_row();
create trigger audit_memberships after insert or update or delete on public.memberships for each row execute function private.audit_row();
create trigger audit_approval_flows after insert or update or delete on public.approval_flows for each row execute function private.audit_row();
create trigger audit_approval_steps after insert or update or delete on public.approval_steps for each row execute function private.audit_row();

-- Masraf eklenip değişince rapor toplamı güncellenir
create or replace function private.refresh_report_total()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_report uuid := coalesce(new.report_id, old.report_id);
begin
  update public.reports r
     set total = coalesce((select sum(e.total) from public.expenses e where e.report_id = v_report), 0)
   where r.id = v_report;
  return null;
end;
$$;
create trigger expenses_total after insert or update of total or delete on public.expenses
  for each row execute function private.refresh_report_total();
