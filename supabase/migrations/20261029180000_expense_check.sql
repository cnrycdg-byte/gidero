-- Fiş kontrolü: çalışan her fişi açıp doğru olduğunu onaylar; kontrol edilmemiş fiş varken rapor onaya gönderilemez.
-- (Büro firmalarında fişi muhasebeci girer ve "Kayda al" ile kendisi kontrol eder; bu kural uygulanmaz.)

alter table public.expenses add column checked_at timestamptz;
alter table public.expenses add column checked_by uuid references auth.users (id);
create index expenses_checked_by_idx on public.expenses (checked_by);
create index expenses_unchecked_idx on public.expenses (report_id) where checked_at is null;

-- Fiş eklenirken kontrol işareti kullanıcıdan gelmez
create or replace function private.expenses_check_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.checked_at := null;
    new.checked_by := null;
  end if;
  return new;
end;
$$;
create trigger expenses_check_guard before insert on public.expenses
  for each row execute function private.expenses_check_guard();

-- Kişi fişi kontrol eder (ya da kontrolü geri alır). Yalnızca raporu düzenleyebilen kişi.
create or replace function public.check_expense(p_expense uuid, p_checked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_expense for update;
  if not found then raise exception 'Fiş bulunamadı.' using errcode = 'P0002'; end if;
  if not private.can_edit_report(e.report_id) then
    raise exception 'Bu fiş artık değiştirilemez.' using errcode = '42501';
  end if;
  if p_checked and coalesce(e.total, 0) <= 0 then
    raise exception 'Önce fişin tutarını yazın, sonra doğru olarak işaretleyin.' using errcode = 'P0001';
  end if;
  update public.expenses
     set checked_at = case when p_checked then now() end,
         checked_by = case when p_checked then (select auth.uid()) end
   where id = p_expense;
end;
$$;
revoke all on function public.check_expense(uuid, boolean) from public, anon;
grant execute on function public.check_expense(uuid, boolean) to authenticated;

-- Rapor açılırken kimin onaylayacağını gösterir (henüz gönderilmemiş rapor için önizleme)
create or replace function public.my_approvers(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if not private.is_member(p_company) then
    raise exception 'Bu şirketin üyesi değilsiniz.' using errcode = '42501';
  end if;
  return private.chain_steps(p_company, v_me);
end;
$$;
revoke all on function public.my_approvers(uuid) from public, anon;
grant execute on function public.my_approvers(uuid) to authenticated;

-- Rapor gönderilirken: kontrol edilmemiş fiş varsa durur
create or replace function private.reports_require_checked()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if old.status in ('draft', 'returned') and new.status in ('pending', 'approved', 'booked')
     and not private.bureau_managed(new.company_id) then
    select count(*) into n from public.expenses e where e.report_id = new.id and e.checked_at is null;
    if n > 0 then
      raise exception '% fiş kontrol edilmedi. Her fişi açıp bilgileri kontrol edin ve "Doğru" olarak işaretleyin.', n
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger reports_require_checked before update of status on public.reports
  for each row execute function private.reports_require_checked();

-- Kontrol edilmiş fişin bilgileri değişirse (elle ya da yeniden okumayla) kontrol yeniden gerekir
create or replace function private.expenses_uncheck_on_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.checked_at is not distinct from old.checked_at
     and old.checked_at is not null
     and (new.total, new.doc_date, new.doc_no, new.seller_name, new.category_id, new.payment_method, new.plate, new.description)
         is distinct from
         (old.total, old.doc_date, old.doc_no, old.seller_name, old.category_id, old.payment_method, old.plate, old.description) then
    new.checked_at := null;
    new.checked_by := null;
  end if;
  return new;
end;
$$;
create trigger expenses_uncheck_on_change before update on public.expenses
  for each row execute function private.expenses_uncheck_on_change();
