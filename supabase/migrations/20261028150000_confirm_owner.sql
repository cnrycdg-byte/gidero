-- Gidero sahibinin hesabı: doğrulama e-postası ulaşmadı (Supabase'in varsayılan e-posta göndericisi saatte birkaç
-- e-postayla sınırlı). Sahibin son 2 günde açılmış, henüz doğrulanmamış hesabı bir kereliğine doğrulanır.
-- E-posta depoda açık yazılmaz; yalnızca özetiyle eşleşir. Yeni kayıtları kendiliğinden doğrulayan bir kural EKLENMEZ.
do $$
declare n int;
begin
  update auth.users u
     set email_confirmed_at = now()
   where u.email_confirmed_at is null
     and u.created_at > now() - interval '2 days'
     and encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') in (select h.email_sha256 from private.platform_owner_hashes h);
  get diagnostics n = row_count;
  raise notice 'Doğrulanan sahip hesabı: %', n;
end;
$$;
