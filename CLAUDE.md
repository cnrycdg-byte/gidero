# Gidero

Türk şirketleri ve muhasebe büroları için masraf uygulaması: çalışan fişi telefonla çeker, sistem okur,
şirketin kendi kurduğu onay akışından geçirir, vergi riskini anında uyarır ve muhasebe programına aktarır.

## Ürün belgeleri

- Ürün gereksinimleri (Claude Docs): https://claude.ai/artifact/JJKqpwmCSdkGUbw1BzEdMy
- Büyüme ve operasyon planı (Claude Docs): https://claude.ai/artifact/5GT6Gyz8ozAKSXJRwoVaGx
- `docs/vergi-kurallari.md`: vergi araştırması, 29 kontrol, kaynaklar
- `docs/bagimsiz-inceleme.md`: YMM bakışıyla bağımsız inceleme; düzeltmeleri uygulanmıştır
- `docs/rakip-fiyat.md`: rakipler ve fiyatlandırma

## Teknoloji

- Mobil: React Native + Expo (iOS, Android)
- Web paneli: Next.js
- Altyapı: Supabase (PostgreSQL + RLS, Auth, Storage, Edge Functions)
- Fiş okuma: Claude API, sadece sunucu fonksiyonlarından çağrılır; API anahtarı istemcide asla bulunmaz
- Ödeme: iyzico veya PayTR (karar verilmedi)

## Değişmez kurallar

1. **Çok kiracılı veri ayrımı:** her tablo `company_id` taşır ve RLS ile korunur. Her migration'la birlikte
   "A şirketi B şirketinin verisini okuyamaz/yazamaz" testi yazılır; test geçmeden birleştirme yok.
2. **Vergi tutarları kodda sabit yazılmaz:** `tax_parameters` tablosundan yıl bazında okunur
   (turk-masraf-vergi skill'i).
3. **Görevler ayrılığı:** kimse kendi masrafını onaylayamaz; muhasebecinin kendi masrafı da onaydan geçer.
4. **Denetim izi:** masraf, rapor, onay ve ayar değişiklikleri silinmez; eski/yeni değer, kim, ne zaman saklanır.
5. **Kullanıcıya görünen tüm metinler Türkçe**, sade ve eylem söyleyen cümlelerle.
6. Para tutarları `numeric(14,2)`; kuruş hesabında yuvarlama HALF_UP, 2 hane.

## Skill'ler

`.claude/skills/README.md` listesine bak. Özellikle: supabase-postgres-best-practices (şema, RLS),
supabase, expo-overview, claude-api, turk-masraf-vergi, fis-okuma, muhasebe-aktarim.

## Dil

Kod, tablo ve değişken adları İngilizce; yorumlar, belgeler ve commit mesajları Türkçe olabilir.
