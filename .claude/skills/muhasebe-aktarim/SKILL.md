---
name: muhasebe-aktarim
description: Masraf belgelerini Tekdüzen Hesap Planı'na göre yevmiye kaydına çevirme ve Logo, Mikro, Netsis, Luca, Zirve, ETA, Paraşüt gibi Türk muhasebe programlarına aktarım dosyası üretme. Hesap planı eşleştirme, yevmiye üretimi, dönem kapanışı veya aktarım şablonu üzerinde çalışırken kullan.
---

# Muhasebeleştirme ve aktarım

İlke: tek iç format (yevmiye satırları) → programa özel dışa aktarım adaptörleri.
Hiçbir adaptör vergi veya hesap mantığı içermez; mantık iç formatı üreten katmandadır.

## İç format

```ts
type JournalEntry = {
  company_id: string; entry_date: string; period: string; // "2026-10"
  description: string;           // "Çalışan – İşletme – Belge no – Açıklama"
  document_ref: { expense_id: string; doc_type: string; doc_no?: string; ettn?: string; image_url: string };
  lines: Array<{
    account_code: string;        // "770.01.001"
    debit: number; credit: number;
    cost_center_code?: string; project_code?: string;
    vat_rate?: number;           // 191 satırlarında
    kkeg?: boolean;              // kanunen kabul edilmeyen kısım
    note?: string;
  }>;
};
```
Kurallar: borç toplamı = alacak toplamı (kuruş hassasiyeti, bankacı yuvarlaması değil, 2 hane HALF_UP).

## Eşleştirme tabloları (şirket bazında)

- `category_account_map(category_id, cost_center_id?, department_id?) → expense_account`
  En özel eşleşme kazanır: kategori+merkez > kategori+departman > kategori.
- `vat_account_map(rate) → 191.xx`
- `payment_account_map(method, user_id?) → 335.<personel> | 195/196.<personel> | kredi kartı hesabı | 100`
- `kkeg_account` ve KDV'si indirilemeyen kısmın gidere eklenmesi kuralı (turk-masraf-vergi skill'i).

## Örnek: %10 KDV'li 1.100 TL restoran e-Arşiv faturası (alıcı şirket VKN), çalışan kendi ödedi

| Hesap | Borç | Alacak |
|---|---|---|
| 770.01 Genel yönetim / yemek | 1.000,00 | |
| 191.10 İndirilecek KDV %10 | 100,00 | |
| 335.0042 Personele borçlar – Ayşe Y. | | 1.100,00 |

Aynı yemek yazar kasa fişiyle geldiyse KDV indirilmez: 1.100,00 tamamı gider (veya muhasebeci kararıyla KKEG).

Kısıtlı giderlerde (binek araç vb.) gider ve KDV kabul edilen / edilmeyen olarak iki satıra bölünür;
oranlar ve kurallar turk-masraf-vergi skill'inden okunur, burada sabit yazılmaz.

## Adaptörler

Her adaptör: `export(entries: JournalEntry[], options) → { filename, mime, bytes }` + birim testi.
- Format şablonu, pilot müşterinin programından alınmış GERÇEK örnek aktarım dosyasıyla doğrulanmadan
  "destekleniyor" denmez. Örnek dosyalar `tests/fixtures/export/<program>/` altında.
- Sütun adları, tarih biçimi (GG.AA.YYYY), ondalık ayırıcı (virgül), kodlama (Windows-1254 mü UTF-8 mi)
  program bazında farklıdır; şablonda açıkça belirt.
- Faz 2: API adaptörleri (Paraşüt API, Logo j-Platform REST). Kimlik bilgileri şirket bazında şifreli saklanır.

## Ek çıktılar

- Muhtasar listesi: e-SMM ve gider pusulasındaki stopajlar.
- e-Defter uyumu: her satırda belge türü, no, tarih; ÖKC fişleri için 10 günlük özet seçeneği.
- Bordro listesi: kilometre, istisna aşımı yemek ve gündelik.

## Dönem ve kilit

- Aktarılan kayıt `exported_at`, `export_batch_id` ile kilitlenir; ikinci kez aktarılamaz.
- Düzeltme = ters kayıt + yeni kayıt, ikisi de yeni batch.
- Kapalı döneme belge gelirse açık ilk döneme alınır ve işaretlenir.
