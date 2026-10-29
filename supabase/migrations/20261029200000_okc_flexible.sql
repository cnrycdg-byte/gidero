-- Yazar kasa fişi (yemek, konaklama, ağırlama) kabul edilir: varsayılan "flexible".
-- "cautious" seçeneği şirket isterse kalır; mevcut şirketler esnek kurala geçer.
alter table public.companies alter column okc_vat_policy set default 'flexible';
update public.companies set okc_vat_policy = 'flexible' where okc_vat_policy = 'cautious';
-- Henüz aktarılmamış fişlerdeki eski uyarı kaldırılır
delete from public.expense_flags f
 using public.expenses e, public.reports r
 where f.expense_id = e.id and r.id = e.report_id and f.code = 'okc_vat_not_deductible'
   and r.status not in ('exported', 'paid');
