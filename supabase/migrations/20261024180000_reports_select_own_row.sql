-- Düzeltme: rapor eklenirken eklenen satır geri okunamıyordu (insert ... returning).
-- can_view_report() raporu tablodan id ile arar; aynı komut içinde yeni satırı göremediği için
-- RLS reddediyordu. Sahip/oluşturan kontrolü artık doğrudan satırın kendi kolonlarıyla yapılır.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated using (
  owner_user_id = (select auth.uid())
  or created_by = (select auth.uid())
  or private.has_any_role(company_id, array['accountant','admin','auditor'])
  or private.can_view_report(id)
);
