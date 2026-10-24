---
name: fis-okuma
description: Türk fiş, fatura ve e-Arşiv belgelerini okuma hattı (karekod + Claude görüntü okuma + doğrulama). Masraf uygulamasında fiş okuma, OCR, belge türü tespiti, mükerrer kontrolü veya okuma doğruluğu testi üzerinde çalışırken kullan.
---

# Fiş okuma hattı

Amaç: kameradan gelen bir belgeden muhasebe kaydı için gereken alanları güvenilir biçimde çıkarmak.
Her alanın kaynağı (`qr` | `ai` | `user`) ve güven puanı saklanır.

## Akış

1. **İstemci (mobil)**: kenar bulma + perspektif düzeltme, en uzun kenar 1600 px, JPEG kalite 0.85.
   Bulanıklık kontrolü (Laplacian varyansı) düşükse yeniden çektir. Orijinal dosya ayrıca saklanır.
2. **Karekod**: görüntüde QR ara. GİB e-Fatura / e-Arşiv karekodu JSON içerir
   (ETTN, satıcı ve alıcı VKN/TCKN, tarih, belge no, tutarlar, KDV). Karekod okunursa bu alanlar
   `source=qr`, güven 1.0. Alan adlarını GİB kılavuzundan doğrula; kod içinde sabit listele.
3. **Claude görüntü okuma**: sunucu fonksiyonunda (Edge Function), API anahtarı istemcide asla yok.
   - Varsayılan model: hızlı/ucuz model (Haiku sınıfı). Güven düşükse veya tutarlılık kontrolü
     başarısızsa bir kez daha güçlü modelle (Sonnet sınıfı) oku.
   - Yapılandırılmış çıktı için tool use / JSON şema kullan (claude-api skill'ine bak).
   - Karekoddan gelen alanları prompt'a "bilinen değerler" olarak ver; model sadece eksikleri doldurur.
4. **Doğrulama** (aşağıda) → **vergi kuralları** (turk-masraf-vergi skill'i) → kayıt.

## Çıktı şeması

```json
{
  "readable": true,
  "doc_type": "e_fatura | e_arsiv | okc_fis | serbest_meslek | bilet | yurtdisi_fatura | diger",
  "seller_name": "string|null", "seller_vkn": "10 veya 11 hane|null",
  "buyer_name": "string|null",  "buyer_vkn": "string|null",
  "date": "YYYY-MM-DD|null", "time": "HH:MM|null",
  "doc_no": "string|null", "ettn": "uuid|null", "z_no": "string|null",
  "currency": "TRY",
  "total": 0.0,
  "vat_lines": [{"rate": 20, "base": 0.0, "vat": 0.0}],
  "other_taxes": [{"type": "konaklama | otv | diger", "amount": 0.0}],
  "confidence": {"total": 0.0, "date": 0.0, "doc_no": 0.0, "vat": 0.0}
}
```

## Prompt kuralları (modelle paylaşılan talimat)

- Genel toplam = KDV dahil ödenecek tutar (TOPLAM, GENEL TOPLAM, ÖDENECEK). Ara toplamı alma.
- Türk sayı biçimi: "1.234,56" = 1234.56; "*45,00" = 45.
- ÖKC fişinde KDV satırları "TOPKDV" / "%20" gibi gelir; her oranı ayrı satır yaz.
- Tarih GG.AA.YYYY → YYYY-MM-DD.
- Okunamayan alanı tahmin etme, null bırak ve güveni düşük ver.
- Belge fiş/fatura değilse `readable=false`.

## Doğrulama kuralları

- `sum(vat_lines.base + vat_lines.vat) + sum(other_taxes) ≈ total` (±0,05 TL); değilse ikinci okuma.
- VKN 10 hane (kurum) / TCKN 11 hane; VKN kontrol basamağı algoritmasıyla doğrula.
- Tarih gelecekte veya 2 yıldan eskiyse uyarı.
- KDV oranı {0, 1, 10, 20} dışında ise uyarı (oranları yılın mevzuatıyla güncelle).

## Mükerrer kontrolü (şirket genelinde, tüm dönemler)

Eşleşme anahtarları, herhangi biri tutarsa uyarı:
1. Görsel SHA-256 (sıkıştırılmış kopya üzerinden değil, orijinal dosyadan)
2. ETTN
3. satıcı VKN + belge no
4. satıcı VKN (yoksa normalize unvan) + tarih + toplam

## Doğruluk testi (eval)

- `tests/receipts/` altında ≥300 gerçek, anonimleştirilmiş fiş + `expected.json`.
- Alan bazında doğruluk: total ≥%98, date ≥%95, doc_no ≥%95, vat ≥%95.
- Her model / prompt değişikliğinde eval çalışır; düşüş varsa değişiklik birleştirilmez.
- Maliyet raporu: belge başına ortalama token ve TL.
