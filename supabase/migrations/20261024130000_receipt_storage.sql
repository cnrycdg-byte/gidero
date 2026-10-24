-- Fiş görselleri için özel depolama alanı ve erişim kuralları.
-- Dosya yolu: <company_id>/<report_id>/<dosya>. Görme ve yükleme izni raporun izinlerinden gelir.

create or replace function private.try_uuid(p text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

create policy receipts_select on storage.objects for select to authenticated using (
  bucket_id = 'receipts'
  and private.can_view_report(private.try_uuid((storage.foldername(name))[2]))
);

create policy receipts_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts'
  and private.can_edit_report(private.try_uuid((storage.foldername(name))[2]))
  and exists (
    select 1 from public.reports r
    where r.id = private.try_uuid((storage.foldername(name))[2])
      and r.company_id = private.try_uuid((storage.foldername(name))[1])
  )
);

create policy receipts_delete on storage.objects for delete to authenticated using (
  bucket_id = 'receipts'
  and private.can_edit_report(private.try_uuid((storage.foldername(name))[2]))
);

-- Sunucu fonksiyonunun, çağıran kullanıcının bu masrafı düzenleyip düzenleyemeyeceğini sorması için
create or replace function public.can_edit_expense(p_expense uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select private.can_edit_report(e.report_id) from public.expenses e where e.id = p_expense), false);
$$;
revoke all on function public.can_edit_expense(uuid) from public, anon;
grant execute on function public.can_edit_expense(uuid) to authenticated;
grant execute on function private.try_uuid(text) to authenticated;
