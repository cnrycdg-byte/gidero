-- Gidero yöneticisi fiyatı tek ekrandan kurar: en yüksek (ilk kademe) ve en düşük (son kademe) birim fiyatı girer,
-- uygulama kademelere dağıtır; paket fiyatı ve kademeler tek işlemde, denetim iziyle kaydedilir.

-- Kademe katsayısı tam TL fiyatları kuruş kaybı olmadan taşısın diye 8 haneye çıkar (ör. 250/300)
alter table public.price_bands alter column factor type numeric(10,8);
create or replace function public.admin_set_pricing(
  p_plan text, p_price_monthly numeric, p_price_yearly numeric, p_min_seats int, p_bands jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  b jsonb;
  prev_qty int := 0;
  prev_factor numeric := 1;
  q int;
  f numeric;
begin
  if not private.is_platform_admin() then
    raise exception 'Fiyatları yalnızca Gidero yöneticisi değiştirebilir.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.plans where id = p_plan) then
    raise exception 'Paket bulunamadı.' using errcode = 'P0002';
  end if;
  if coalesce(p_price_monthly, 0) <= 0 or coalesce(p_price_yearly, 0) <= 0 then
    raise exception 'Aylık ve yıllık fiyat sıfırdan büyük olmalı.' using errcode = '22023';
  end if;
  if p_price_yearly > p_price_monthly then
    raise exception 'Yıllık ödemedeki aylık fiyat, aylık ödeme fiyatından yüksek olamaz.' using errcode = '22023';
  end if;
  if coalesce(p_min_seats, 0) < 1 then
    raise exception 'En az adet 1 olmalı.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_bands, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_bands, '[]'::jsonb)) > 20 then
    raise exception 'Kademe listesi geçersiz (en çok 20 kademe).' using errcode = '22023';
  end if;
  prev_qty := p_min_seats;
  for b in select * from jsonb_array_elements(coalesce(p_bands, '[]'::jsonb)) loop
    q := (b ->> 'min_qty')::int;
    f := round((b ->> 'factor')::numeric, 8);
    if q is null or q <= prev_qty then
      raise exception 'Kademe başlangıçları en az adetten büyük ve artan sırada olmalı.' using errcode = '22023';
    end if;
    if f is null or f <= 0 or f > prev_factor then
      raise exception 'Kademe fiyatları adet arttıkça düşmeli.' using errcode = '22023';
    end if;
    prev_qty := q;
    prev_factor := f;
  end loop;

  update public.plans
     set price_monthly = round(p_price_monthly, 2),
         price_yearly_monthly = round(p_price_yearly, 2),
         min_seats = p_min_seats
   where id = p_plan;
  delete from public.price_bands where plan_id = p_plan;
  insert into public.price_bands (plan_id, min_qty, factor)
  select p_plan, (x ->> 'min_qty')::int, round((x ->> 'factor')::numeric, 8)
    from jsonb_array_elements(coalesce(p_bands, '[]'::jsonb)) x;
end;
$$;
revoke all on function public.admin_set_pricing(text, numeric, numeric, int, jsonb) from public, anon;
grant execute on function public.admin_set_pricing(text, numeric, numeric, int, jsonb) to authenticated;
