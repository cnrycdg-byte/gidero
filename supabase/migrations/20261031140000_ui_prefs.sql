-- Kişisel görünüm tercihi: açık/koyu/telefonun ayarı ve ana renk. Kişinin kendi profilinde durur,
-- bütün cihazlarda aynı görünür. Şimdilik Gidero yöneticisinin Ayarlar ekranından kullanılır.
alter table public.profiles add column ui_theme text not null default 'system'
  check (ui_theme in ('system', 'light', 'dark'));
alter table public.profiles add column ui_accent text
  check (ui_accent is null or ui_accent ~ '^#[0-9A-Fa-f]{6}$');

-- Yalnızca kendi tercihini yazar (profiles sütunlarına doğrudan yazma izni verilmez)
create or replace function public.set_ui_prefs(p_theme text, p_accent text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'Önce giriş yapın.' using errcode = '42501'; end if;
  if p_theme not in ('system', 'light', 'dark') then raise exception 'Görünüm seçimi geçersiz.' using errcode = 'P0001'; end if;
  if p_accent is not null and p_accent !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Rengi #1E3A8A biçiminde yazın.' using errcode = 'P0001';
  end if;
  update public.profiles set ui_theme = p_theme, ui_accent = upper(p_accent) where id = v_me;
end;
$$;
revoke all on function public.set_ui_prefs(text, text) from public, anon;
grant execute on function public.set_ui_prefs(text, text) to authenticated;
