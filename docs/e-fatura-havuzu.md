# Gelen e-Fatura / e-Arşiv havuzu: mevzuat, entegrasyon ve tasarım

Kasım 2026. Sorun: Şirket adına (VKN) düzenlenen e-Arşiv ve e-Fatura belgeleri, harcamayı yapan çalışana ulaşmıyor.
Çalışan faturayı muhasebeye ya da satıcıya sorarak bulmak zorunda kalıyor.

## 1. Türkiye'de nasıl işliyor

| | e-Fatura | e-Arşiv Fatura |
|---|---|---|
| Ne zaman düzenlenir | Satıcı ve alıcı ikisi de e-Fatura kayıtlı kullanıcısıysa | Alıcı e-Fatura kayıtlı kullanıcısı değilse (şirket ya da kişi) |
| Alıcıya nasıl ulaşır | GİB sistemi üzerinden şirketin e-Fatura gelen kutusuna (özel entegratör ya da GİB portalı) | Satıcı e-posta ile gönderir ya da çıktı verir. GİB alıcının kutusuna koymaz |
| Alıcı GİB'de görebilir mi | Evet, tam içerik (UBL XML) | İnteraktif Vergi Dairesi'nde yalnızca liste: tarih, no, satıcı VKN/ad, tutarlar. İçerik, XML ya da görüntü yok, sorgu en çok 1 haftalık |
| Hukuken geçerli olan | Mali mühürlü XML | Mali mühürlü XML; PDF yalnızca görüntü |

2026 değişiklikleri (588 ve 589 No'lu VUK Genel Tebliğleri, Aralık 2025; tebliğ metinleri değil ikincil kaynaklar okundu):
- 1 Ocak 2026'dan itibaren e-Arşiv için tutar eşikleri kalktı: kurumsal alıcıya her satışta e-Fatura ya da e-Arşiv düzenlenir.
- e-Fatura zorunluluğu için ciro sınırı 3 milyondan 2 milyon TL'ye indi (e-ticaret, gayrimenkul, motorlu araçta 500 bin TL);
  yeni zorunlular 1 Temmuz 2026'da geçti.
- Sonuç: şirketlere gelen e-Belge sayısı arttı; restoran, otel, akaryakıt gibi masraf belgelerinin çoğu artık e-Arşiv ya da e-Fatura.

Çalışanın sorunu buradan doğuyor: satıcı e-Arşiv'i çalışanın verdiği (ya da hiç verilmeyen) e-postaya yollar; e-Fatura ise
muhasebenin entegratör kutusuna düşer. İkisinde de belge harcamayı yapan kişiye ulaşmaz.

Kaynaklar: [MDP: Tarafınıza düzenlenen e-Arşiv](https://mdpgroup.com/blog/tarafiniza-duzenlenen-e-arsiv-faturalar-nasil-goruntulenir/),
[Vio: GİB gelen e-Arşiv](https://vioyazilim.tr/blog/1057-gib-gelen-e-arsiv-islemleri),
[Luca: e-Arşiv sorgulama](https://lucayazilim.freshdesk.com/support/solutions/articles/67000407915-01-09-e-ar%C5%9Fiv-fatura-sorgulama),
[Fisle: 2026 değişiklikleri](https://www.fisle.co/blog/e-fatura-arsiv-2026-degisiklikleri),
[Nilvera gelen fatura API](https://developer.nilvera.com/api/e-fatura-api/gelen-faturalar/gelen-faturalari-listeler).

## 2. Şirket Gidero'ya nasıl bağlar (üç kanal)

1. **Fatura e-posta adresleri (e-Arşiv için ana yol).** Her şirkete `fatura@<kod>.gidero...` ve her çalışana kendine özel
   bir adres verilir (örn. `ali.celik.7k2@...`). Çalışan alışverişte bu adresi verir ya da gelen faturayı buraya iletir.
   Ekteki XML okunur (yapay zekâ gerekmez); yalnız PDF gelirse önce karekod, sonra ucuz model. Kişiye özel adrese gelen
   fatura doğrudan o kişinin taslağına düşer; havuza hiç girmez.
2. **Özel entegratör bağlantısı (gelen e-Fatura).** Şirket yöneticisi entegratörün API anahtarını girer (Logo, QNB eSolutions,
   Sovos, Uyumsoft, İzibiz, Nilvera, Turkcell e-Şirket vb.). Gidero gelen faturaları (liste + UBL XML) saatte bir çeker.
   Anahtar yalnızca sunucuda şifreli saklanır. Önce müşterilerin en çok kullandığı 1-2 entegratör.
3. **GİB listesi (mutabakat, isteğe bağlı).** İnteraktif Vergi Dairesi'nden indirilen e-Arşiv listesi muhasebeci tarafından
   yüklenir. GİB şifresini saklamak yerine dosya yükleme önerilir. Bu yalnızca "şirket adına kesilmiş ama kimsenin
   sahiplenmediği fatura" kontrolü içindir (içerik yok).
   Elle XML/ZIP yükleme zaten var (toplu yükleme).

## 3. Havuzdaki fatura rapora nasıl girer

Sırayla otomatik eşleştirme, olmazsa çalışan arar:
1. Kişiye özel adrese geldiyse: o kişinin taslağına.
2. Çalışanın raporunda aynı satıcı VKN + tarih (±3 gün) + tutar olan fiş/slip varsa: fatura o masrafa asıl belge olarak bağlanır
   (fiş görüntüsü ek olarak kalır). Kişiye "Faturanız bulundu" bildirimi.
3. Akaryakıt faturasındaki plaka, kişinin araç plakasıyla eşleşirse: o kişiye önerilir.
4. Kalanlar havuzda bekler. Çalışan raporunda "Faturamı bul" der: tutar ve tarihi yazar, sistem yalnızca birebir tutanları
   gösterir; "Bu benim" deyince fatura kişiye ayrılır (aynı ETTN ikinci kez kullanılamaz).

## 4. Her faturanın herkese görünmesi neden sorun

- **Çift ödeme riski:** Havuzda şirketin kira, tedarikçi, avukat gibi doğrudan ödediği faturaları da olur. Çalışan bunlardan birini
  kendi masrafı gibi eklerse şirket aynı tutarı iki kez öder.
- **Gizlilik ve KVKK:** Yöneticilerin otel, hediye, sağlık, danışmanlık harcamaları ve tedarikçi fiyatları tüm çalışanlara açılır.
  Faturada kişi adı, TCKN, adres gibi kişisel veriler bulunabilir.
- **Yanlış sahiplenme ve suistimal:** Başkasının yemeğini, akaryakıtını "benim" demek kolaylaşır.
- **Gürültü:** Ayda yüzlerce tedarikçi faturası arasında çalışan kendi faturasını bulamaz.

Önlemler:
- Çalışan havuzu göremez; yalnızca tutar + tarih (+ isteğe bağlı satıcı) ile **birebir arama** yapar, sonuçta satır ayrıntısı gizlidir.
- Muhasebeci havuzun tamamını görür; tedarikçileri "şirket öder" diye işaretler, bunlar havuza hiç girmez.
- Masraf türü süzgeci: havuza yalnızca masraf niteliğinde satıcılar (akaryakıt, otel, restoran, ulaşım, otopark...) girer.
- Sahiplenilen fatura onay zincirinden ve muhasebe kontrolünden geçer; "havuzdan eklendi" etiketi görünür.
- Aynı ETTN tek kez kullanılır (mükerrer kontrolü zaten var).
- e-Arşiv ertesi ayın 8'ine kadar iptal edilebilir: ay kapanışında GİB listesiyle yeniden kontrol.

## 5. Maliyet (kural 7)

- XML okuma ücretsiz; PDF'te önce karekod. Yapay zekâ yalnız karekodsuz PDF'te, ucuz modelle (~₺0,10 belge başı).
- Gelen e-posta servisi: ilk binlerce e-posta ücretsiz katmanlarda; sonrası düşük maliyetli.
- Entegratör API çağrıları genelde entegratör aboneliğine dahildir.

## Açık kararlar

- İlk desteklenecek entegratörler hangileri?
- Gelen e-posta altyapısı (alan adı, servis seçimi).
- GİB İnteraktif VD listesi: dosya yükleme mi, şifreyle otomatik çekme mi?
