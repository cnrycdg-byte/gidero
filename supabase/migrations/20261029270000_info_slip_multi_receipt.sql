-- 1) Bilgi fişi: ÖKC/POS'tan çıkan, asıl belgesi e-Arşiv (ya da e-Fatura) olan kâğıt.
--    Çalışan, faturanın şirket adına düzenlendiğini onaylamadan fişi "doğru" işaretleyemez;
--    onay (kim, ne zaman) muhasebede görünür.
-- 2) Tek fotoğrafta birden çok fiş: her fiş ayrı masraf olur, aynı görseli paylaşır.
--    photo_part = fotoğraftaki sırası (1'den), photo_parts = fotoğraftaki okunan fiş sayısı.

alter table public.expenses drop constraint expenses_doc_type_check;
alter table public.expenses add constraint expenses_doc_type_check
  check (doc_type in ('e_fatura','e_arsiv','okc_fis','akaryakit_okc','serbest_meslek','gider_pusulasi',
                      'bilet','yurtdisi_fatura','dekont','bilgi_fisi','no_document','unknown'));

alter table public.expenses add column einvoice_confirmed_at timestamptz;
alter table public.expenses add column einvoice_confirmed_by uuid references auth.users (id);
create index expenses_einvoice_confirmed_by_idx on public.expenses (einvoice_confirmed_by);

alter table public.expenses add column photo_part smallint check (photo_part between 1 and 5);
alter table public.expenses add column photo_parts smallint check (photo_parts between 1 and 5);
alter table public.expenses add column photo_position text check (char_length(photo_position) <= 60);
alter table public.expenses add constraint expenses_photo_part_range
  check (photo_part is null or photo_parts is null or photo_part <= photo_parts);

-- Onay bilgisi istemciden doğrudan yazılamaz: yalnızca confirm_einvoice ile (kim ve ne zaman sunucuda yazılır).
-- confirm_einvoice security definer olduğundan bu kontrolün dışında kalır.
create or replace function private.expenses_einvoice_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.einvoice_confirmed_at := null;
      new.einvoice_confirmed_by := null;
    else
      new.einvoice_confirmed_at := old.einvoice_confirmed_at;
      new.einvoice_confirmed_by := old.einvoice_confirmed_by;
    end if;
  end if;
  -- Belge türü bilgi fişinden başka bir şeye dönerse onay anlamını yitirir
  if new.doc_type <> 'bilgi_fisi' then
    new.einvoice_confirmed_at := null;
    new.einvoice_confirmed_by := null;
  end if;
  return new;
end;
$$;
create trigger expenses_einvoice_guard before insert or update on public.expenses
  for each row execute function private.expenses_einvoice_guard();

-- Çalışan (ya da fişi düzenleyebilen kişi) e-Arşiv faturasının şirket adına geldiğini onaylar / geri alır
create or replace function public.confirm_einvoice(p_expense uuid, p_confirmed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_expense for update;
  if not found then raise exception 'Fiş bulunamadı.' using errcode = 'P0002'; end if;
  if not private.can_edit_report(e.report_id) then
    raise exception 'Bu fiş artık değiştirilemez.' using errcode = '42501';
  end if;
  if e.doc_type <> 'bilgi_fisi' then
    raise exception 'Bu fiş bir bilgi fişi değil.' using errcode = 'P0001';
  end if;
  update public.expenses
     set einvoice_confirmed_at = case when p_confirmed then now() end,
         einvoice_confirmed_by = case when p_confirmed then (select auth.uid()) end,
         -- onay geri alınırsa fiş yeniden kontrol edilmeli
         checked_at = case when p_confirmed then checked_at end,
         checked_by = case when p_confirmed then checked_by end
   where id = p_expense;
end;
$$;
revoke all on function public.confirm_einvoice(uuid, boolean) from public, anon;
grant execute on function public.confirm_einvoice(uuid, boolean) to authenticated;

-- Fiş kontrolü: bilgi fişinde önce e-Arşiv onayı
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
  if p_checked and e.doc_type = 'bilgi_fisi' and e.einvoice_confirmed_at is null then
    raise exception 'Bu bir bilgi fişi. Önce e-Arşiv faturasının şirket adına geldiğini onaylayın.' using errcode = 'P0001';
  end if;
  update public.expenses
     set checked_at = case when p_checked then now() end,
         checked_by = case when p_checked then (select auth.uid()) end
   where id = p_expense;
end;
$$;
revoke all on function public.check_expense(uuid, boolean) from public, anon;
grant execute on function public.check_expense(uuid, boolean) to authenticated;
