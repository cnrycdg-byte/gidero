-- Kişi rehberi: çalışanın masraf yaptığı kişiler (ör. birlikte yemek yenen müşteri) ve firmaları.
-- Her çalışanın rehberi kendisine aittir; bir sonraki fişte birkaç harf yazınca önerilir.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  org_name text not null default '' check (length(org_name) <= 160),
  use_count int not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index contacts_owner_person_uidx
  on public.contacts (company_id, user_id, lower(full_name), lower(org_name));
create index contacts_user_company_idx on public.contacts (user_id, company_id, last_used_at desc);

alter table public.contacts enable row level security;
grant select, delete on public.contacts to authenticated;

create policy contacts_select on public.contacts for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(company_id));
create policy contacts_delete on public.contacts for delete to authenticated
  using (user_id = (select auth.uid()));

-- Fiş kaydedilince kullanılan kişiler rehbere eklenir ya da kullanım sayısı artar.
-- p_people: [{"full_name":"Ayşe Demir","org_name":"ABC Ltd"}, ...]
create or replace function public.remember_contacts(p_company uuid, p_people jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_n int := 0;
  p jsonb;
  v_name text;
  v_org text;
begin
  if v_me is null or not private.is_member(p_company) then
    raise exception 'Bu şirkette rehber tutamazsınız.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) > 30 then
    raise exception 'Geçersiz kişi listesi.' using errcode = '22023';
  end if;
  for p in select * from jsonb_array_elements(p_people) loop
    v_name := btrim(coalesce(p ->> 'full_name', ''));
    v_org := btrim(coalesce(p ->> 'org_name', ''));
    continue when length(v_name) < 2;
    insert into public.contacts (company_id, user_id, full_name, org_name)
    values (p_company, v_me, left(v_name, 120), left(v_org, 160))
    on conflict (company_id, user_id, lower(full_name), lower(org_name))
    do update set use_count = public.contacts.use_count + 1, last_used_at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.remember_contacts(uuid, jsonb) from public, anon;
grant execute on function public.remember_contacts(uuid, jsonb) to authenticated;
