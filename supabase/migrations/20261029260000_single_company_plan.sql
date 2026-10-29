-- Şirketlerde tek paket: bütün özellikler dahil, kişi başı kademeli fiyat (Başlangıç/Standart/Pro yeni satışa kapandı; eski aboneler etkilenmez)
insert into public.plans (id, kind, name, description, unit, price_monthly, price_yearly_monthly, min_seats, max_companies, users_per_company, features, sort)
values ('sirket', 'company', 'Şirket', 'Bütün özellikler dahil; çalışan sayısı arttıkça kişi başı fiyat düşer', 'user', 299, 249, 3, null, null,
        '["Fiş ve fatura okuma","Çok adımlı onay zinciri","Vergi uyarıları ve gider sınırları","Excel, Logo, Luca aktarımı","Ödeme yetkilisi ve IBAN","Logo ve kurumsal renkler"]', 5)
on conflict (id) do nothing;
update public.plans set active = false where kind = 'company' and id <> 'sirket';
insert into public.price_bands (plan_id, min_qty, factor) values
  ('sirket', 10, 0.92), ('sirket', 25, 0.85), ('sirket', 50, 0.78), ('sirket', 100, 0.70), ('sirket', 250, 0.62)
on conflict do nothing;
