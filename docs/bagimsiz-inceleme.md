# Bağımsız İnceleme — Ürün Gereksinimleri + Büyüme Planı (24.10.2026)
Kapsam: iki Claude Docs dokümanı + vergi-kurallari.md (yevmiye örnekleri). Dokümanlar değiştirilmedi. Bakış: YMM + SaaS ürün lideri.

## A. Rakam doğrulaması (5 kritik rakam)
| Rakam | Sonuç | Kaynak |
|---|---|---|
| Fatura sınırı 2026 = 12.000 TL (2025: 9.900) | DOĞRU. Tebliğ sıra no "VUK GT 588" teyit edilemedi | https://www.muhasebetr.com/fatura-kesme-siniri |
| Yemek bedeli istisnası 2026 = 300 TL/gün (2025: 240) | DOĞRU | https://www.forbes.com.tr/ekonomi/2026-yili-gelir-vergisi-tarifesi-ve-istisna-tutarlari-belirlendi |
| Binek kira sınırı 46.000 TL (KDV hariç) + cari gider %70 | DOĞRU. %30'a isabet eden KDV'nin indirilemeyeceği ise TARTIŞMALI/DOĞRULANAMADI (aşağıda K2) | https://www.alomaliye.com/2026/04/01/binek-otoyu-vergiden-dusmek-hala-cazip-mi/ |
| Konaklama vergisi %1 (01.05–31.12.2026, CK 11263) | DOĞRU. Matrah KDV hariç, KDV matrahına dahil değil → 5.000/50/500 örneği doğru | https://www.alomaliye.com/2026/05/01/konaklama-vergisi-orani-2026-sonuna-kadar-yuzde-1-olarak-uygulanacak/ · https://kpmgvergi.com/yayinlar/mali-bultenler/vergi/konaklama-vergisi-uygulama-genel-tebligi-resmi-gazetede-yayimlandi/1734 |
| ÖKC fişinde gider/KDV "sınıra kadar" | KISMEN YANLIŞ: GİB özelgelerine göre personelin iş seyahatindeki yeme-içme gideri tutardan bağımsız FATURA ister | https://www.muhasebetr.com/yazarlarimiz/koray/0599 |
KDV 29/3 (izleyen yıl sonu) bilinen mevzuatla uyumlu; ayrıca web'de yeniden doğrulanmadı. Gündelik 900 TL ve "Mayıs 2026'da bilgi fişi kalktı" doğrulanamadı.

## B. Kritik
- K1 ÖKC yemek fişi: Ürün Gereksinimleri'ndeki "Yazar kasa fişi → Gider: sınıra kadar" ile araştırmadaki örnek (a) (1.000 TL restoran fişi, 191'e 90,91 KDV) iş seyahati yemeğinde hatalı. Varsayılan "yemek/konaklama/temsil = fatura şart" olmalı. ÖKC KDV'si yalnızca işyerinde tüketilen kırtasiye/temizlik/küçük alım, taksi ve akaryakıtta indirilmeli. Bu, "vergi avantajı" vaadinin tam tersi bir risk.
- K2 Binek %30 KDV: Belgede "gider ve KDV %70/%30 bölünür" kesin hüküm gibi yazılmış. KDVK 30/d'nin bu kısma uygulanıp uygulanmayacağı literatürde tartışmalı; YMM görüşü/özelge olmadan sabit kural olmamalı, şirket bazında parametre olmalı (kira sınırını aşan kısmın KDV'si de aynı şekilde).
- K3 e-Fatura mükerrerliği: Şirket VKN'sine kesilen e-Fatura zaten entegratör gelen kutusundan muhasebeye düşüyor. Çalışan aynı faturanın fotoğrafını da yüklerse çift kayıt ve çift KDV indirimi olur. ETTN ile gelen kutusu/ERP eşleştirmesi MVP'de olmalı; şu an yalnızca uygulama içi mükerrer kontrolü var.
- K4 Görev ayrılığı: "Muhasebeci/büro girdiği kayıt onayı atlar" kuralı, muhasebecinin KENDİ masrafını da kapsıyor. Kendi masrafı her durumda onaydan geçmeli; aksi halde iç kontrol açığı olur ve bağımsız denetimde bulgu çıkar.
- K5 Fişsiz "kilometre" masrafı: Özel araç km ödemesi Türkiye'de belgesiz gider değildir, genelde ücret sayılır (bordro, SGK/GV). "Vergi motoru belge gerekip gerekmediğini söyler" yetmez; bordro bayrağı zorunlu olmalı.

## C. Önemli
- Ö1 "e-Arşiv çalışanın TCKN'sine → Gider: Olabilir" riskli. Başkası adına düzenlenmiş belge şirket gideri olarak savunulamaz (harcırah kapsamı hariç). "Hayır" ya da "YMM'ye sor" denmeli.
- Ö2 "Fişte şirket vergi numarası yok" uyarısı ÖKC fişinde anlamsız (alıcı VKN zorunlu değil, faturaya dönüştürmez). Yanlış uyarı güveni düşürür.
- Ö3 Yemek istisnası (300 TL) işverenin sağladığı yemek/kart içindir. İş seyahatindeki belgeli yemek ücret değildir; "günlük istisnayı aşan yemek → bordro bayrağı" kuralı kavram karışıklığı.
- Ö4 e-Defter: Aktarımda her satır için belge türü (fatura/çek/makbuz/diğer), belge no ve tarih zorunlu. ÖKC fişleri için 10 günlük icmal ("diğer") seçeneği eklenmeli.
- Ö5 Eksik gereksinimler: e-SMM/gider pusulası stopajının muhtasar (MUHSGK) listesi; Ba-Bs tedarikçi bazlı özet (yürürlük durumu teyit edilmeli); iade faturası ve kısmi iade; yurt dışı harcamada kur farkı (646/656) ve döviz bazlı avans; çoklu şube ve çoklu para birimi (v2'ye atılmış, saha/ihracat firmaları için erken gerekir); şirket kartı ekstre eşleşmesi (v2, ama hedef segmentte temel ihtiyaç); harcırah/bordro entegrasyonu; tekdüzen 7/A'da dönem sonu 761/771 yansıtma kayıtları; 7/B kullanan şirketler.
- Ö6 KKEG'in 689'a atılması bir uygulama tercihi. Varsayılan olarak 7xx "KKEG" alt hesabı daha yaygın; seçilebilir olmalı.
- Ö7 KVKK: 7499 sonrası (01.06.2024) yurt dışı aktarımda açık rıza yalnızca arızi aktarım içindir. Standart sözleşmenin 5 iş günü içinde Kurul'a bildirimi gerekir. Supabase ve Claude API yurt dışında olduğundan bu satış öncesi kritik yol.
- Ö8 MVP kapsamı (koşullu çok adımlı akış, vekalet, kısmi red, büro ekranı, 2–3 program aktarımı, karekod) 13 hafta ve yarı zamanlı geliştirici için gerçekçi değil. Vekalet, kısmi red ve koşullu akış v1'e kaydırılmalı.

## D. Ürün / fiyat mantığı
- Ö9 Marj matematiği tutmuyor. Belge maliyeti en fazla 0,35 TL ise Büro 50'de (4.990 TL, 5.000 belge) tam kotada maliyet ~1.750 TL olur ve marj ~%65 çıkar. Belgedeki "%46" belge başı ~0,54 TL demektir; "yarı kotada %69" ise belge başı ~0,62 TL demektir. Rakamlar birbiriyle çelişiyor; varsayım tablosu açıkça yazılmalı.
- Ö10 Kanal ekonomisi: Büro getirdiği şirkete %30 indirim + ilk yıl %20 komisyon → ilk yıl net gelir liste fiyatının %56'sı. Üstüne bayi %20–30 tekrarlayan komisyon gelirse %80 brüt marj hedefi ilk yılda tutmaz.
- K6 Hedef tutarlılığı: Özet "büro başı 40–70 müşteri" diyor, 6. ay hedefi 800/40 = 20 müşteri/büro. 300.000 TL MRR için şirket başı ~2.000 TL gerekir (≈13 kullanıcı, %30 indirimle ≈19). Deneme→ödeme oranı (büro %30, şirket %20) kartsız deneme için iyimser (tipik %10–15). Hedefler bu yüzden 2–3 kat iyimser.
- Ö11 "Onaylayıcı ücretsiz" kuralı kötüye kullanılabilir: yöneticiler hem onaylayıcı hem masraf giren. "Aktif kullanıcı" tanımı (ay içinde ≥1 masraf gönderen) yazılmalı.
- K7 Konumlandırma iddiası ("tek Türk ürünü", "Dext'ten ~8 kat ucuz") fiyatları açık olmayan rakiplere (Masraff, Fisle, Bizigo) dayanıyor. Doğrulanmadan pazarlamada kullanılmamalı.
- Küçük: Büro planı "Kurallar"ında kota birimi tutarsız (Büro 150+ "Müşteri başı 100"); kalite kontrolündeki "destek agent'ı" agent tablosunda yok; demo "Logo/Luca dosyası" Başlangıç planında yok (yalnızca Excel); VUK GT 588 numarası teyitsiz.
- Küçük: İçerik mesajı "Fişiniz doğru belgeyse vergi avantajıdır" K1 düzeltilmeden yayınlanırsa yanlış yönlendirir; ilk karusel (fiş mi fatura mı) K1'e göre yazılmalı.
