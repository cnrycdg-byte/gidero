-- Uygulama tanıtımı: ilk açılışta kişinin rolüne göre bir kez gösterilir.
-- Görülen bölümler (çalışan, onaylayıcı, muhasebe, ödeme, yönetici, büro) profilde tutulur;
-- sonradan yeni bir rol verilirse yalnızca o rolün bölümü gösterilir. Her cihazda aynı kayıt geçerlidir.
alter table public.profiles add column tour_seen text[] not null default '{}'
  check (tour_seen <@ array['basics','approver','accountant','payer','admin','bureau']::text[]);

create or replace function public.mark_tour_seen(p_keys text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_out text[];
begin
  if v_me is null then raise exception 'Oturum gerekli.' using errcode = '42501'; end if;
  if not (coalesce(p_keys, '{}') <@ array['basics','approver','accountant','payer','admin','bureau']::text[]) then
    raise exception 'Bilinmeyen tanıtım bölümü.' using errcode = '22023';
  end if;
  update public.profiles
     set tour_seen = (select coalesce(array_agg(distinct k order by k), '{}') from unnest(tour_seen || coalesce(p_keys, '{}')) k)
   where id = v_me
  returning tour_seen into v_out;
  return coalesce(v_out, '{}');
end;
$$;
revoke all on function public.mark_tour_seen(text[]) from public, anon;
grant execute on function public.mark_tour_seen(text[]) to authenticated;
