---
name: turk-masraf-vergi
description: Türk vergi mevzuatına göre masraf belgelerinin gider yazılabilirliği ve KDV indirimi kuralları (VUK, GVK, KVK, KDVK). Masraf uygulamasında vergi kontrolü, belge türü kuralı, KKEG, binek araç, fatura sınırı, yıllık parametre veya uyarı metni üzerinde çalışırken kullan.
---

# Türk masraf vergi kuralları

Amaç: her belge için "gider yazılır mı, KDV indirilir mi, ne kadarı?" sorusunu belge girildiği anda cevaplamak.
Kaynak araştırma: `docs/vergi-kurallari.md` (29 kontrol, örnek yevmiyeler, kaynak linkleri).

## Temel ilkeler

- Yıllık değişen her tutar `tax_parameters(year, key, value, source_url, verified_by)` tablosunda; kodda sabit tutar yazılmaz.
  Belge tarihi hangi yıla düşüyorsa o yılın parametresi kullanılır.
- Kurallar engel değil uyarıdır; sonuç muhasebeciye açıklamasıyla (gerekçe + dayanak) gösterilir.
- "Doğrulanamadı" işaretli parametre üretimde kullanılmadan önce YMM onayı ister (`verified_by` boş olamaz).
- Muhasebeci girdiğinde onay akışı atlanır, kontroller atlanmaz.

## 2026 parametreleri (YMM teyidi bekleyenler işaretli)

| key | 2025 | 2026 | dayanak |
|---|---|---|---|
| invoice_limit_incl_vat | 9900 | 12000 | VUK 232, VUK GT 588 |
| vat_rates | 1,10,20 | 1,10,20 | KDVK |
| car_running_cost_ratio | 0.70 | 0.70 | GVK 40/1-5 |
| car_monthly_rent_limit_excl_vat | 37000 | 46000 | GVK 40/1-5 |
| meal_exemption_daily | 240 | 300 | GVK 23/8 |
| domestic_per_diem_daily | ? | 900 | GVK 24/b |
| accommodation_tax | 0.02 | 0.02 (≤30.04), 0.01 (01.05–31.12) | 6802/34, CK 11263 |
| transport_exemption_daily | ? | 158 (doğrulanamadı) | GVK 23/9 |

## Belge türü → sonuç

| doc_type | gider | KDV indirimi | not |
|---|---|---|---|
| e_fatura / e_arsiv (alıcı = şirket VKN) | evet | evet | karekod öncelikli |
| e_arsiv (alıcı = TCKN) | riskli, muhasebeci onayı | hayır | "şirket adına fatura isteyin" |
| okc_fis | fatura sınırına kadar | kısıtlı: kırtasiye/temizlik gibi küçük genel gider, taksi, akaryakıt; yemek ve konaklamada hayır (fatura iste) | şirket parametresi: temkinli/esnek |
| akaryakit_okc | plaka + UTTS ise | evet (binekte %70) | plaka şirket araç listesinde mi |
| serbest_meslek | evet | evet | %20 GV stopajı, KDV tevkifatı bayrağı |
| gider_pusulasi | evet | hayır | GV tevkifatı kontrolü |
| bilet / e_bilet | evet | şirket unvanı + KDV ayrı ise | biniş kartı geçersiz |
| yurtdisi_fatura | evet | yabancı KDV hayır | TCMB kuru, sorumlu sıfatıyla KDV bayrağı |
| dekont / slip / bilgi_fisi | hayır | hayır | asıl belge iste |

## MVP kontrolleri (sırayla, her biri `{code, severity, message_tr, legal_ref}` döner)

1. Geçersiz belge türü → engelle (onaya gönderilemez).
2. Alıcı VKN ≠ şirket VKN → `vat_deductible=false`.
3. ÖKC fişi > fatura sınırı (akaryakıt hariç) → kırmızı uyarı.
4. Aynı gün + satıcı + kullanıcı fişleri toplamı > sınır → bölünmüş fiş uyarısı.
5. matrah × oran ≈ KDV (±0,05), toplam tutarlılığı, oran ∈ vat_rates.
6. Binek araç kategorisi + plaka binek → gider %70 kabul / %30 KKEG. Kabul edilmeyen %30'un KDV'si tartışmalı: şirket ayarı `car_kkeg_vat_deductible` (varsayılan YMM teyidiyle). Kira sınırı aşımı KKEG.
7. Akaryakıtta plaka yok / listede yok → gider yazılamaz uyarısı.
8. Yemek / temsil → "kimlerle" zorunlu; istisna aşımı bordro bayrağı.
9. Konaklama → konaklama vergisi satırı ve oranı; KDV matrahına dahil değil.
10. KDV indirim süresi (belge yılını izleyen yıl sonu) geçmiş → KDV gidere.
11. Ceza, gecikme faizi, şahsi harcama → otomatik KKEG.
12. Kâğıt belge → "asıl teslim edildi" takibi.
13. e-Fatura çift kaydı: şirket VKN'sine kesilmiş e-Fatura ETTN ile entegratör gelen kutusu / ERP kayıtlarıyla eşleştirilir; eşleşirse gider ve KDV ikinci kez kaydedilmez.
14. Yemek (iş seyahati dahil) ÖKC fişiyle geldiyse KDV indirilmez, fatura istenir.
15. Özel araç kilometre ödemesi ve istisnayı aşan gündelik → ücret; bordro bayrağı, gider kaydı değil.
16. Görevler ayrılığı: muhasebecinin kendi masrafı onay akışından geçer.

## Uyarı metni kuralları

- Kısa, eylem söyleyen Türkçe: ne sorun, ne yapılmalı. Örnek: "Bu fiş 12.000 TL'yi aşıyor. Şirket adına fatura isteyin."
- Kesin hüküm cümlesi kurma ("asla indirilemez" yerine "indirilemez görünüyor, muhasebeci kontrol edecek").
- Her uyarıda dayanak (`legal_ref`) ve kaynak bağlantısı.

## Bakım

- Her yıl Ocak'ta yeni yıl parametreleri eklenir (mevzuat agent'ı hatırlatır), eski yıllar silinmez.
- Her kural için birim testi: sınırın hemen altı, tam sınır, hemen üstü.
