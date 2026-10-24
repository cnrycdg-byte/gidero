# Veritabanı

## Yapı

| Grup | Tablolar |
|---|---|
| Hesap ve erişim | `accounts`, `companies`, `profiles`, `memberships`, `bureau_staff`, `bureau_assignments` |
| Şirket ayarları | `cost_centers`, `projects`, `categories`, `approval_flows`, `approval_steps` |
| Masraf | `reports`, `expenses`, `expense_vat_lines`, `expense_flags`, `approval_actions` |
| Sistem | `tax_parameters` (yıl bazlı), `audit_log` |

## Güvenlik modeli

- Tüm tablolarda RLS açık. Görünürlük `private.my_roles(company_id)` ile hesaplanır: şirket üyeliği
  + büro erişimi (büro sahibi tüm müşterilere, büro muhasebecisi yalnızca atandığı müşterilere).
- Rapor ve masrafı görenler: sahibi, giren kişi, sıradaki onaylayıcı, daha önce işlem yapan,
  çalışanın yöneticisi, masraf merkezi sorumlusu, şirketin muhasebeci/yönetici/denetçisi.
- Rapor durumu istemciden değiştirilemez; yalnızca `submit_report`, `approve_report`,
  `return_report` fonksiyonları değiştirir.
- Kendi kendini onaylama yok; onaylayıcı bulunamazsa sistem hata verir, rapor onaylanmaz.
- Muhasebeci/büro başkası adına girdiği raporu onaysız kaydeder; kendi masrafı akıştan geçer.

## Supabase'e kurulum

`main` dalına yeni migration geldiğinde `.github/workflows/db-deploy.yml` önce testleri çalıştırır,
geçerse `supabase db push` ile migration'ları Supabase projesine uygular. Gerekli üç gizli ayar
(`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`) GitHub'da
Settings > Secrets and variables > Actions altında tanımlanır; sohbete veya koda yazılmaz.
Elle tetiklemek için Actions sekmesinde "Veritabanını Supabase'e kur" > Run workflow.

## Testler

```bash
./scripts/test-db.sh
```

Geçici bir PostgreSQL kümesi açar, `supabase/tests/local/00_supabase_shim.sql` ile Supabase'in auth
yapısını taklit eder, migration'ları uygular ve 45 testi çalıştırır. GitHub Actions her push'ta aynı
testi çalıştırır. Gerçek Supabase projesine shim dosyası uygulanmaz.
