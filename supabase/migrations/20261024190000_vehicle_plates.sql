-- Kişi kartında araç plakaları: akaryakıt fişindeki plaka bunlarla karşılaştırılır.
-- Plakaları yalnızca şirket yöneticisi veya muhasebeci girer (çalışan kendine plaka ekleyemez).
alter table public.memberships
  add column vehicle_plates text[] not null default '{}'
    check (cardinality(vehicle_plates) <= 10);

-- Plakalar karşılaştırma için sade biçimde saklanır: "35 abc-123" → "35ABC123"
create or replace function private.normalize_plates()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.vehicle_plates := coalesce((
    select array_agg(distinct p)
    from (
      select upper(translate(regexp_replace(x, '[^0-9A-Za-zÇĞİÖŞÜçğıöşü]', '', 'g'), 'çğıöşüÇĞİÖŞÜ', 'CGIOSUCGIOSU')) as p
      from unnest(new.vehicle_plates) x
    ) s
    where p <> ''
  ), '{}');
  return new;
end;
$$;

create trigger memberships_normalize_plates before insert or update of vehicle_plates on public.memberships
  for each row execute function private.normalize_plates();

-- Muhasebeci de plaka girebilsin: yalnızca bu kolonu güncelleyen fonksiyon
create or replace function public.set_member_plates(p_company uuid, p_user uuid, p_plates text[])
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare v text[];
begin
  if not private.has_any_role(p_company, array['admin','accountant']) then
    raise exception 'Plaka girmek için yönetici veya muhasebeci olmalısınız.' using errcode = '42501';
  end if;
  update public.memberships set vehicle_plates = coalesce(p_plates, '{}')
   where company_id = p_company and user_id = p_user
  returning vehicle_plates into v;
  if not found then
    raise exception 'Kişi bu şirkette değil.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function public.set_member_plates(uuid, uuid, text[]) from public, anon;
grant execute on function public.set_member_plates(uuid, uuid, text[]) to authenticated;

-- Çalışan memberships üzerinden kendi plakasını değiştiremez (yalnızca yönetici yazar; bu kural zaten
-- memberships_write politikasındadır). Denetim izi memberships tetikleyicisiyle tutulur.
