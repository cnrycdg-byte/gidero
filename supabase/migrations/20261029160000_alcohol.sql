-- Alkollü içki: fiş okunurken alkol satırları ayrılır; muhasebe onaylayana ya da reddedene kadar rapor aktarılamaz.
-- Reddedilen alkol tutarı çalışana ödenmez ve gider yazılmaz.

alter table public.expenses add column alcohol_present boolean not null default false;
alter table public.expenses add column alcohol_amount numeric(14,2) check (alcohol_amount is null or alcohol_amount >= 0);
alter table public.expenses add column alcohol_items text[] not null default '{}';
alter table public.expenses add column alcohol_decision text check (alcohol_decision in ('accepted', 'rejected'));
alter table public.expenses add column alcohol_decided_by uuid references auth.users (id);
alter table public.expenses add column alcohol_decided_at timestamptz;
create index expenses_alcohol_decided_by_idx on public.expenses (alcohol_decided_by);
create index expenses_alcohol_pending_idx on public.expenses (report_id) where alcohol_present and alcohol_decision is null;

-- (security invoker: current_user çağıranın rolüdür)
-- Kullanıcı fişi eklerken alkol alanlarını kendisi dolduramaz (yalnızca okuma ve muhasebe kararı yazar)
create or replace function private.expenses_alcohol_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.alcohol_present := false;
    new.alcohol_amount := null;
    new.alcohol_items := '{}';
    new.alcohol_decision := null;
    new.alcohol_decided_by := null;
    new.alcohol_decided_at := null;
  end if;
  return new;
end;
$$;
create trigger expenses_alcohol_guard before insert on public.expenses
  for each row execute function private.expenses_alcohol_guard();

-- Muhasebe kararı: onayla (gider yazılır) ya da reddet (alkol tutarı ödenmez, gider yazılmaz)
create or replace function public.decide_alcohol(p_expense uuid, p_decision text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare e public.expenses; r public.reports; v_me uuid := (select auth.uid());
begin
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Kararı seçin: onayla ya da reddet.' using errcode = '22023';
  end if;
  select * into e from public.expenses where id = p_expense for update;
  if not found then raise exception 'Fiş bulunamadı.' using errcode = 'P0002'; end if;
  if not private.has_any_role(e.company_id, array['accountant']) then
    raise exception 'Alkol kararını yalnızca muhasebe verebilir.' using errcode = '42501';
  end if;
  if not e.alcohol_present then raise exception 'Bu fişte alkollü içki yok.' using errcode = 'P0001'; end if;
  select * into r from public.reports where id = e.report_id;
  if r.owner_user_id = v_me and not (private.bureau_managed(r.company_id) and private.is_company_bureau_staff(r.company_id)) then
    raise exception 'Kendi fişiniz için karar veremezsiniz; başka bir muhasebeci karar vermeli.' using errcode = '42501';
  end if;
  if r.status in ('exported', 'paid') then
    raise exception 'Aktarılmış ya da ödenmiş raporda karar değiştirilemez.' using errcode = 'P0001';
  end if;
  update public.expenses
     set alcohol_decision = p_decision, alcohol_decided_by = v_me, alcohol_decided_at = now()
   where id = p_expense;
  delete from public.expense_flags where expense_id = p_expense and code in ('alcohol', 'alcohol_decided');
  insert into public.expense_flags (expense_id, company_id, code, severity, message)
  values (p_expense, e.company_id, 'alcohol_decided', 'info',
          case p_decision when 'accepted' then 'Alkollü içki muhasebe tarafından onaylandı; gider yazılır.'
               else 'Alkollü içki muhasebe tarafından reddedildi: ' || private.tl(coalesce(e.alcohol_amount, 0)) ||
                    ' ödenmez ve gider yazılmaz.' end);
end;
$$;
revoke all on function public.decide_alcohol(uuid, text) from public, anon;
grant execute on function public.decide_alcohol(uuid, text) to authenticated;

-- Aktarım ve ödeme: alkol kararı bekleyen fiş varsa yapılamaz
create or replace function private.require_alcohol_decided(p_report_ids uuid[])
returns void language plpgsql stable security definer set search_path = '' as $$
declare n int;
begin
  select count(*) into n from public.expenses e
   where e.report_id = any (p_report_ids) and e.alcohol_present and e.alcohol_decision is null;
  if n > 0 then
    raise exception '% fişte alkollü içki için muhasebe kararı bekleniyor. Fişi açıp onaylayın ya da reddedin.', n
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.mark_exported(p_company uuid, p_report_ids uuid[], p_format text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_batch uuid;
  v_bad int;
  v_count int;
  v_total numeric(14,2);
begin
  if not private.has_any_role(p_company, array['admin','accountant']) then
    raise exception 'Aktarımı yalnızca muhasebeci ya da yönetici yapabilir' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_report_ids), 0) = 0 then
    raise exception 'Aktarılacak rapor seçilmedi' using errcode = 'P0001';
  end if;
  select count(*) into v_bad
    from unnest(p_report_ids) as x(id)
    left join public.reports r on r.id = x.id and r.company_id = p_company
   where r.id is null or r.status not in ('approved', 'booked');
  if v_bad > 0 then
    raise exception 'Yalnızca onaylanmış ve henüz aktarılmamış raporlar aktarılabilir (% rapor uygun değil)', v_bad
      using errcode = 'P0001';
  end if;
  perform private.require_alcohol_decided(p_report_ids);

  select count(*), coalesce(sum(e.total), 0) into v_count, v_total
    from public.expenses e where e.report_id = any (p_report_ids);

  insert into public.export_batches (company_id, format, created_by, report_ids, expense_count, total)
  values (p_company, p_format, v_me, p_report_ids, v_count, v_total)
  returning id into v_batch;

  update public.expenses set exported_at = now(), export_batch_id = v_batch
   where report_id = any (p_report_ids);
  update public.reports set status = 'exported' where id = any (p_report_ids);
  return v_batch;
end;
$$;

create or replace function public.mark_paid(p_company uuid, p_report_ids uuid[], p_note text default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_bad int; v_n int;
begin
  if not private.has_any_role(p_company, array['accountant']) then
    raise exception 'Ödemeyi yalnızca muhasebeci işaretleyebilir.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_report_ids), 0) = 0 then
    raise exception 'Ödenen rapor seçilmedi.' using errcode = 'P0001';
  end if;
  select count(*) into v_bad
    from unnest(p_report_ids) as x(id)
    left join public.reports r on r.id = x.id and r.company_id = p_company
   where r.id is null or r.status not in ('approved', 'booked', 'exported');
  if v_bad > 0 then
    raise exception 'Yalnızca onaylanmış raporlar ödendi işaretlenebilir (% rapor uygun değil).', v_bad using errcode = 'P0001';
  end if;
  perform private.require_alcohol_decided(p_report_ids);
  if exists (select 1 from public.reports r where r.id = any (p_report_ids) and r.owner_user_id = v_me
               and not (private.bureau_managed(r.company_id) and private.is_company_bureau_staff(r.company_id))) then
    raise exception 'Kendi masrafınızı ödendi olarak işaretleyemezsiniz; başka bir muhasebeci ya da yönetici işaretlemeli.' using errcode = '42501';
  end if;
  update public.reports
     set status = 'paid', paid_at = now(), paid_by = v_me, paid_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = any (p_report_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
