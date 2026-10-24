-- 2025 ve 2026 vergi parametreleri. verified_by boş olanlar YMM teyidi bekliyor.
-- Kaynak: docs/vergi-kurallari.md, docs/bagimsiz-inceleme.md
insert into public.tax_parameters (year, key, value, legal_ref, source_url, verified_by) values
  (2025, 'invoice_limit_incl_vat', '9900', 'VUK 232', 'https://www.muhasebetr.com/fatura-kesme-siniri', null),
  (2026, 'invoice_limit_incl_vat', '12000', 'VUK 232, VUK GT 588', 'https://www.alomaliye.com/2025/12/31/vergi-usul-kanunu-genel-tebligi-sira-no-588/', null),
  (2025, 'vat_rates', '[1, 10, 20]', 'KDVK', null, null),
  (2026, 'vat_rates', '[1, 10, 20]', 'KDVK', null, null),
  (2025, 'car_running_cost_ratio', '0.70', 'GVK 40/1-5', null, null),
  (2026, 'car_running_cost_ratio', '0.70', 'GVK 40/1-5', 'https://www.alomaliye.com/2026/04/01/binek-otoyu-vergiden-dusmek-hala-cazip-mi/', null),
  (2025, 'car_monthly_rent_limit_excl_vat', '37000', 'GVK 40/1-5', null, null),
  (2026, 'car_monthly_rent_limit_excl_vat', '46000', 'GVK 40/1-5', 'https://www.ekonomigazetesi.com/kose-yazisi/binek-otomobillerin-2026-giderleri-ve-amortismanlari-70546', null),
  (2025, 'meal_exemption_daily', '240', 'GVK 23/8', null, null),
  (2026, 'meal_exemption_daily', '300', 'GVK 23/8', 'https://www.muhasebetr.com/vergiden-mustesna-yemek-bedeli/', null),
  (2026, 'domestic_per_diem_daily', '900', 'GVK 24/b', 'https://cottgroup.com/tr/mevzuat/item/gelir-vergisinden-istisna-harcirah-tutarlari', null),
  (2026, 'accommodation_tax', '[{"from":"2026-01-01","to":"2026-04-30","rate":0.02},{"from":"2026-05-01","to":"2026-12-31","rate":0.01}]',
         '6802 s. Kanun md. 34, CK 11263', 'https://www.alomaliye.com/2026/05/01/konaklama-vergisi-orani-2026-sonuna-kadar-yuzde-1-olarak-uygulanacak/', null)
on conflict (year, key) do nothing;
