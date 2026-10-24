-- Gider grubu (kategori) sınırları: muhasebeci/yönetici her gider grubu için kişi başı üst limit ve
-- dönem belirler (aylık, 3 aylık, 6 aylık, yıllık). Dönemler takvime göredir (ör. 3 aylık = Ekim-Aralık).
-- Kişi kendi kullanımını, yöneticisi ekibininkini, muhasebe ve yönetici herkesinkini görür.

alter table public.categories
  add column limit_amount numeric(14,2) check (limit_amount is null or limit_amount > 0),
  add column limit_period text check (limit_period in ('month','quarter','half','year')),
  add constraint categories_limit_pair check ((limit_amount is null) = (limit_period is null));

-- Gider grubu ayarları değişince denetim izi
create trigger audit_categories after insert or update or delete on public.categories
  for each row execute function private.audit_row();

-- Dönem sınırları: verilen tarihin içinde bulunduğu ay / çeyrek / yarıyıl / yıl
create or replace function private.period_bounds(p_period text, p_on date, out start_on date, out end_on date)
language sql immutable set search_path = ''
as $$
  select s, (s + case p_period when 'month' then interval '1 month' when 'quarter' then interval '3 months'
                               when 'half' then interval '6 months' else interval '1 year' end - interval '1 day')::date
  from (select case p_period
                 when 'month' then date_trunc('month', p_on)::date
                 when 'quarter' then date_trunc('quarter', p_on)::date
                 when 'half' then make_date(extract(year from p_on)::int, case when extract(month from p_on) <= 6 then 1 else 7 end, 1)
                 else date_trunc('year', p_on)::date
               end as s) x;
$$;

-- Kullanım: kişi x sınırlı gider grubu. p_user boşsa: yönetici/muhasebe/denetçi herkesi, onaylayıcı kendi ekibini görür.
create or replace function public.category_usage(p_company uuid, p_user uuid default null, p_on date default current_date)
returns table (
  user_id uuid, full_name text, category_id uuid, category_name text,
  limit_amount numeric, limit_period text, period_start date, period_end date, used numeric
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_all boolean := private.has_any_role(p_company, array['admin','accountant','auditor']);
begin
  if v_me is null or not private.is_member(p_company) then
    raise exception 'Bu şirketin verisini göremezsiniz.' using errcode = '42501';
  end if;
  if p_user is not null and p_user <> v_me and not v_all
     and private.manager_of(p_company, p_user) is distinct from v_me then
    raise exception 'Bu kişinin harcama sınırlarını göremezsiniz.' using errcode = '42501';
  end if;

  return query
  select m.user_id, coalesce(pr.full_name, ''), c.id, c.name, c.limit_amount, c.limit_period, b.start_on, b.end_on,
         coalesce((
           select sum(e.total) from public.expenses e
           join public.reports r on r.id = e.report_id
           where r.company_id = p_company and r.owner_user_id = m.user_id and e.category_id = c.id
             and coalesce(e.doc_date, e.created_at::date) between b.start_on and b.end_on
         ), 0)::numeric(14,2)
  from public.categories c
  cross join lateral private.period_bounds(c.limit_period, p_on) b
  join public.memberships m on m.company_id = p_company and m.status = 'active'
  left join public.profiles pr on pr.id = m.user_id
  where c.company_id = p_company and c.active and c.limit_amount is not null
    and (
      (p_user is not null and m.user_id = p_user)
      or (p_user is null and (v_all or m.manager_user_id = v_me or m.user_id = v_me))
    )
  order by m.user_id, c.name;
end;
$$;

revoke all on function public.category_usage(uuid, uuid, date) from public, anon;
grant execute on function public.category_usage(uuid, uuid, date) to authenticated;
revoke all on function private.period_bounds(text, date) from public;
grant execute on function private.period_bounds(text, date) to authenticated;
