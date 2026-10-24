# Masraf Takip Merkezi – Vergi ve Muhasebe Kuralları Araştırması

> Hazırlanma tarihi: 24 Ekim 2026. Bu doküman ürün tasarımı içindir; vergi danışmanlığı yerine geçmez. Tutarlar yıllık olarak (VUK mük. 298 yeniden değerleme / Cumhurbaşkanı kararları / genelgeler) değişir; uygulamada **parametre tablosu** olarak tutulmalı, kod içine gömülmemelidir.
> "Doğrulanamadı" ibaresi: resmi metinden teyit edilemeyen bilgi. Bu kalemler canlıya çıkmadan önce bir YMM/SMMM tarafından teyit edilmelidir.

---

## 0. Parametre tablosu (özet)

| Parametre | 2025 | 2026 | Dayanak / Not |
|---|---|---|---|
| Fatura düzenleme sınırı (VUK 232, KDV dahil) | 9.900 TL | **12.000 TL** | 2026: VUK GT Sıra No 588 (RG 31.12.2025, 33124 5. mük.), yeniden değerleme oranı %25,49. 2025 tebliğ no: doğrulanamadı |
| Doğrudan gider yazılabilecek demirbaş (VUK 313) | doğrulanamadı | 12.000 TL | VUK GT 588 |
| KDV oranları | %1 / %10 / %20 | %1 / %10 / %20 | 10.07.2023'ten beri (genel oran %20, indirimli %10 ve %1) |
| Binek oto aylık kira gider sınırı (KDV hariç) | 37.000 TL | **46.000 TL** | GVK 40/1-5, 311 Seri GVK GT; kaynak: Ekonomi Gazetesi (22.01.2026), Alomaliye (01.04.2026) |
| Binek oto ÖTV+KDV gider yazma sınırı | 990.000 TL | **1.200.000 TL** | GVK 40/1-5 |
| Binek oto amortismana esas azami bedel (ÖTV-KDV hariç) | 1.100.000 TL | **1.380.000 TL** | GVK 40/1-5 |
| Binek oto amortisman azami bedel (vergiler maliyette / 2. el) | 2.100.000 TL | **2.600.000 TL** | GVK 40/1-5 |
| Binek oto cari gider (yakıt, bakım, sigorta, otopark, köprü/otoyol, kredi faizi) gider oranı | %70 | %70 | GVK 40/1-5 |
| Yemek bedeli GV istisnası (günlük, fiilen çalışılan gün) | 240 TL | **300 TL** (KDV hariç) | GVK 23/8; SGK tarafı 7577 s. Kanun ile 17.04.2026'dan itibaren 300 TL (SGK Genelgesi 2026/12) |
| Toplu taşıma/yol bedeli istisnası (ayni – kart/bilet) | 126 TL (doğrulanamadı) | 158 TL (yalnız ticari kaynak; doğrulanamadı) | GVK 23/9 (7338 s. Kanun). Nakit yol ödemesi istisna değil |
| Yurt içi gündelik GV istisnası (en yüksek dilim) | doğrulanamadı | **900 TL/gün** (I. ve II. dönem 2026) | GVK 24/b; HMB KAMUMALİ genelgeleri (II. dönem: 03.07.2026 tarihli) |
| Yurt dışı gündelik | – | ABD 199 USD, Almanya 176 EUR, İngiltere 127 GBP, Fransa 169 EUR, Diğer AB 140 EUR (ilk 10 gün %50 artırımlı) | CK 10928 (RG 31.01.2026, 01.01.2026'dan geçerli); hangi kadro kolonunun esas alındığı kaynakta belirtilmemiş → doğrulanamadı |
| Konaklama vergisi | %2 | %2 (01.01–30.04.2026), **%1 (01.05–31.12.2026)** | 6802 s. Kanun md. 34 (7194 ile); CK 11263 (RG 01.05.2026) |
| e-Arşiv zorunluluğu (vergi mükellefi olmayanlara) | – | Basit usul/işletme hesabı mükellefleri için 3.000 TL üzeri; 01.01.2027'den itibaren tutardan bağımsız | VUK GT 509 |
| KVKK yurt dışı aktarım bildirim yapmama cezası | – | 90.308 – 1.806.377 TL | KVKK md. 18 (7499 ile), 2026 yeniden değerlenmiş tutar |
| Belge saklama | 5 yıl (VUK 253) + 10 yıl (TTK 82) | aynı | |

---

## 1. Belge türleri ve vergisel değeri

**Genel kural (KDVK 29/1, 34/1):** KDV indirimi ancak "fatura ve benzeri vesikalarda" ayrıca gösterilen ve kanuni defterlere kaydedilen KDV üzerinden yapılabilir. Gider yazma için (GVK 40, KVK 6/8) harcamanın işletmeyle ilgili olması ve VUK'a uygun belgeyle tevsik edilmesi gerekir (VUK 227).

| Belge | Yasal dayanak | Gider yazma | KDV indirimi | Uygulamanın kontrolü |
|---|---|---|---|---|
| **e-Fatura** | VUK 229-232, mük. 242, VUK GT 509 | Evet | Evet (şirket VKN'sine düzenlenmişse) | Alıcı VKN = şirket VKN; ETTN; karekod; senaryo (TEMEL/TICARI); tip (SATIS/IADE/TEVKIFAT…) |
| **e-Arşiv Fatura** | VUK GT 509 | Evet | Evet (alıcı VKN şirketinse) | Alıcı VKN şirketin mi? Satıcı ve alıcı ikisi de e-Fatura mükellefiyse e-Arşiv değil e-Fatura düzenlenmeliydi → uyarı. TCKN'ye (çalışana) düzenlenmişse KDV indirilemez |
| **ÖKC (yazar kasa) fişi** | VUK 233, 3100 s. Kanun, KDV GUT | Evet, fatura sınırına (2026: 12.000 TL) kadar | Kısıtlı: KDV GUT'a göre yalnızca kırtasiye, büro/temizlik malzemesi, gıda gibi işletmede tüketilecek genel gider niteliğindeki küçük alımlar ve taksi vb. için | Tutar ≤ fatura sınırı mı; mal/hizmet niteliği; KDV tutarı fişte var mı; Z no/fiş no/tarih okunuyor mu |
| **Akaryakıt pompa ÖKC fişi** | ÖKC tebliğleri; UTTS GT Sıra No 1-2 | Tutardan bağımsız fatura yerine geçer (plakalı). 01.01.2025'ten itibaren işe dahil taşıtlar için UTTS üzerinden düzenlenmemiş akaryakıt fişi gider belgesi sayılmaz | Evet (binek ise %70 orantısında, aşağıya bkz.) | Plaka okunuyor mu; plaka şirket araç listesinde mi; UTTS ibaresi/araç binek mi ticari mi |
| **Perakende satış fişi (elle)** | VUK 233 | Fatura sınırına kadar | ÖKC fişiyle aynı kısıt | Matbu seri-sıra no, satıcı VKN |
| **e-SMM (serbest meslek makbuzu)** | VUK 236, GVK 94/2-b | Evet | Evet (KDV gösterilir) | Brüt ücret, GV stopajı (%20) – şirket muhtasar ile beyan eder; KDV tevkifatı var mı. Karekoddaki `brutucret, gvstopaj, kdvtevkifat, netucret` alanlarını oku |
| **Gider pusulası** | VUK 234 | Evet (vergi mükellefi olmayan kişilerden alım/hizmet) | Hayır (KDV yok) | Kişinin vergi mükellefi olmadığı; GV tevkifatı (GVK 94) gerekip gerekmediği; TCKN, imza |
| **Müstahsil makbuzu / e-MM** | VUK 235 | Evet (çiftçiden alım) | Hayır | Stopaj, borsa tescil, SGK kesintisi alanları |
| **Bilet / e-Bilet (uçak, otobüs, feribot)** | VUK 234 vd., VUK GT 509 (e-Bilet) | Evet (işle ilgili seyahat) | Bilet/fatura şirket unvanına ve KDV ayrıca gösterilmişse evet; aksi halde doğrulanamadı / genelde hayır | **Biniş kartı tek başına vergisel belge değildir** → e-Bilet veya havayolunun e-Arşiv faturası istenmeli |
| **Yurt dışı faturası** | VUK 227; KDVK 9 (sorumlu sıfatıyla KDV) | Evet (işle ilgili, tercümesi/açıklaması ile) | Yabancı ülkede ödenen KDV Türkiye'de indirilemez. Türkiye'de yararlanılan yurt dışı hizmetlerinde (ör. yazılım aboneliği) şirket 2 No.lu KDV beyannamesiyle sorumlu sıfatıyla KDV hesaplar ve aynı dönemde indirir | Ülke, döviz, kur (fatura tarihi TCMB döviz alış), hizmet Türkiye'de mi kullanılıyor? |
| **Banka dekontu / kredi kartı slip'i / sipariş özeti** | — | Tek başına hayır (ödeme kanıtıdır, VUK belgesi değildir) | Hayır | "Bu belge fiş/fatura değil, asıl belgeyi yükleyin" |
| **Bilgi fişi** | VUK GT (Mayıs 2026 tebliği ile kaldırılıyor) | Tek başına hayır, e-Fatura/e-Arşiv'in kendisi esas | Hayır | Bilgi fişi tespit edilirse eşleşen e-faturayı iste |

**Uyarı metinleri:**
- "Bu belge şirketiniz adına düzenlenmemiş (alıcı: TCKN). Gider yazılabilir olabilir ancak KDV indirimi yapılamaz. Mümkünse satıcıdan şirket VKN'sine e-Arşiv/e-Fatura isteyin."
- "Biniş kartı vergisel belge değildir. Lütfen e-bilet veya havayolu faturasını yükleyin."
- "Yazar kasa fişindeki KDV yalnızca genel gider niteliğindeki küçük alımlarda indirilebilir. Bu harcama için fatura almanız önerilir."
- "Akaryakıt fişinde plaka okunamadı / plaka şirket araç listesinde yok. UTTS dışı akaryakıt alımları gider yazılamaz."

---

## 2. Fatura düzenleme sınırı (VUK 232) ve ÖKC fişi

**Kural:** Birinci ve ikinci sınıf tüccarlar, serbest meslek erbabı vb. (VUK 232) birbirleriyle yaptıkları alım satımlarda, tutar sınırı aşan her işlem için fatura almak/vermek zorundadır. Sınırın altında ÖKC fişi/perakende satış fişi fatura yerine kabul edilir. Alıcı istemesi halinde sınırın altında da fatura düzenlenmesi zorunludur.

- **2026: 12.000 TL** (vergiler dahil) – VUK Genel Tebliği Sıra No: 588, RG 31.12.2025 (33124, 5. mükerrer), 01.01.2026'dan itibaren; yeniden değerleme oranı %25,49.
- **2025: 9.900 TL** (muhasebetr tarihsel tablo; tebliğ sıra no doğrulanamadı).
- Akaryakıt pompa ÖKC fişleri tutardan bağımsız fatura yerine geçer (müşteri tanıma sistemi ibareli fişler hariç).
- **Alıcı VKN'li ÖKC fişi:** Yeni nesil ÖKC'lerde alıcı VKN basılabilmesi fişi faturaya dönüştürmez; fatura sınırını aşan tutarda yine e-Fatura/e-Arşiv gerekir. Mayıs 2026'da yayımlanan VUK Genel Tebliği ile YN ÖKC'lerde **bilgi fişi kaldırılmakta**, fatura gereken satışlarda doğrudan e-Fatura/e-Arşiv düzenlenecektir (tebliğ sıra no: doğrulanamadı).
- **Ceza:** Belge almama/vermeme VUK 353 özel usulsüzlük (2026 tutarları için VUK GT 588 tablosuna bakılmalı).

**Uygulama ne yapmalı:**
1. Belge türü = ÖKC/perakende fiş VE toplam (KDV dahil) > 12.000 TL (2026) → engelleyici değil ama kırmızı uyarı.
2. Aynı satıcı + aynı gün + aynı çalışan fişlerin toplamı > sınır → "bölünmüş fiş" şüphesi.

**Uyarı metni:** "Bu harcama 12.000 TL fatura düzenleme sınırını aşıyor. Yazar kasa fişi yeterli değildir; şirket unvanı ve VKN'si ile e-Fatura veya e-Arşiv fatura alınmalıdır. Aksi halde gider kabul edilmeme ve özel usulsüzlük cezası riski vardır."

---

## 3. KDV indirimi koşulları

| Koşul | Dayanak | Kontrol |
|---|---|---|
| Belgede KDV ayrıca gösterilmeli | KDVK 29/1, 34/1 | KDV tutarı/oranı okunmalı |
| Belge şirket adına / VKN'sine olmalı | KDVK 29, 34; VUK 230 | Alıcı VKN = şirket VKN |
| Belge kanuni defterlere kaydedilmeli | KDVK 34/1 | Muhasebe aktarım tarihi |
| **Süre:** vergiyi doğuran olayın vuku bulduğu takvim yılını **izleyen takvim yılı sonuna kadar** ve belgenin deftere kaydedildiği dönemde | KDVK 29/3 (7104 s. Kanun md. 8, 01.01.2019'dan itibaren) | Belge tarihi yılı + 1 yılın 31 Aralık'ı geçti mi |
| Harcama işle ilgili olmalı | KDVK 30/d (GVK/KVK'ya göre indirimi kabul edilmeyen giderlerin KDV'si indirilemez) | Kategori ve açıklama |
| Oranlar | KDVK 28, Cumhurbaşkanı kararları | %1 / %10 / %20. Örn. lokanta-yemek %10, konaklama %10, akaryakıt %20, kırtasiye %20, bazı temel gıda %1 |

**İndirilemeyecek KDV (KDVK 30):**
- 30/a: Teslim/hizmeti vergiye tabi olmayan veya vergiden istisna edilen işlemlere ait KDV.
- 30/b: Faaliyeti kiralama veya çeşitli şekillerde işletme olanlar hariç, **binek otomobillerinin iktisabında** ödenen KDV.
- 30/c: Zayi olan mallara ait KDV (deprem/sel hariç).
- 30/d: GVK ve KVK'ya göre **kazancın tespitinde indirimi kabul edilmeyen giderlere** ait KDV. GİB görüşü (İstanbul VDB özelgesi 06.03.2024, E-62030549-120[40/2023]): binek otomobil giderlerinin %30'luk KKEG kısmına isabet eden KDV indirilemez; yalnızca %70'e isabet eden KDV indirilebilir. Kira sınırını aşan kısmın KDV'si de indirilemez (KPMG, Ekonomi Gazetesi).

**Uyarı metinleri:**
- "Bu belgenin KDV'si indirilemez: belge tarihi 2024, KDV indirim süresi 31.12.2025'te doldu (KDVK 29/3). Tutar KDV dahil gider olarak kaydedilebilir."
- "Binek otomobil gideri: KDV'nin yalnızca %70'lik kısmı indirilecek, %30'u kanunen kabul edilmeyen gider olarak işaretlenecek."
- "Okunan KDV oranı (%18 / %8) güncel oranlarla uyuşmuyor. Belge tarihi 10.07.2023 öncesi mi? OCR'ı kontrol edin."

---

## 4. Gider kısıtlamaları

### 4.1 Binek otomobil (GVK 40/1-5, GVK 68/5, KVK 8 ve 11 yollamasıyla; 311 Seri No. GVK GT, RG 27.05.2020)
- Binek otomobil tanımı: GTİP **87.03** pozisyonu. Kamyonet/panelvan (87.04) kısıtlamaya girmez; sürücü kabini ile yük bölümü arasında sabit panel/bariyer yoksa binek sayılabilir (GİB özelgesi 06.03.2024).
- **Kiralama:** 2026 aylık **46.000 TL** (KDV hariç) / 2025: 37.000 TL. Aşan kısım KKEG, aşan kısmın KDV'si indirilemez. Günlük kiralamada sınır = aylık sınır / ayın gün sayısı.
- **Cari giderler** (yakıt, bakım-onarım, sigorta, otopark, köprü-otoyol, kredi faizi vb.): en fazla **%70** gider; %30 KKEG. Faaliyeti binek oto kiralama/işletme olanlar kapsam dışı.
- **Amortisman:** 2026 azami amortismana esas bedel 1.380.000 TL (ÖTV-KDV hariç) veya 2.600.000 TL (vergiler maliyete eklenmiş/ikinci el); ÖTV+KDV gider yazma sınırı 1.200.000 TL. MTV gider değildir (KVK 11/1-d kapsamında; Alomaliye 01.04.2026).
- **UTTS:** 01.01.2025'ten itibaren işe dahil/kiralanan taşıtların akaryakıt/LPG alımları UTTS üzerinden yapılmalı; UTTS dışı fiş gider belgesi sayılmaz (UTTS Uygulama GT Sıra No 1, RG 05.10.2023; Sıra No 2, RG 21.09.2024).

**Uygulama sorar:** "Araç plakası?", "Araç binek mi ticari mi?" (şirket araç kartından), "Kiralık mı, özmal mı?", "Çalışanın şahsi aracı mı?" (şahsi araç ise yakıt gideri genelde gider kabul edilmez; km bazlı ödeme bordro/harcırah konusudur – doğrulanmalı).

**Uyarı metni:** "Binek araç gideri: tutarın %70'i gider yazılacak, %30'u ve buna ait KDV kanunen kabul edilmeyen gider (KKEG) olarak işaretlenecek (GVK 40/5, KDVK 30/d)."

### 4.2 Yemek bedeli istisnası (GVK 23/8)
- İşyerinde yemek verilmiyorsa, fiilen çalışılan gün başına **2026: 300 TL** (KDV hariç) GV ve damga vergisinden istisna (2025: 240 TL). Aşan kısım ücrettir (bordroya eklenmeli).
- SGK tarafında 7577 s. Kanun ile 17.04.2026'dan itibaren günlük **300 TL**'ye kadar yemek kartı/kupon/nakit prime esas kazanca dahil değil; işyerinde yemek verilen gün ek ödeme istisna dışı (SGK Genelgesi 2026/12, 07.05.2026).
- Ticari kaynaklarda geçen "ayni ödemede 330 TL" bilgisi **doğrulanamadı**.

**Masraf uygulaması açısından önemli ayrım:** Çalışanın kendi öğle yemeği fişi (normal iş günü, şehir içinde) şirket gideri olarak yazıldığında ücret niteliğinde menfaat sayılabilir → istisna sınırını aşan kısım bordroya yansıtılmalı. Müşteriyle yemek → temsil-ağırlama. Seyahatte yemek → harcırah/seyahat gideri.

**Uyarı metni:** "Bu yemek yalnızca sizin içinse ve seyahatte değilseniz, günlük 300 TL'yi aşan kısım ücret sayılarak bordroya eklenebilir. Masrafı yaptığınız kişileri girin."

### 4.3 Yol / ulaşım istisnası (GVK 23/9)
- İşverence toplu taşıma veya bu amaçla bilet/kart verilmesi (ayni) halinde günlük tutar istisna; 2026 için 158 TL (yalnız ticari kaynak, resmi tebliğ teyidi **doğrulanamadı**). Nakit yol ödemesi istisna değildir.
- Bu istisna ev-iş arası ulaşım içindir; iş seyahati/müşteri ziyareti taksi-otobüs bileti doğrudan işletme gideridir.

### 4.4 Harcırah (GVK 24/b, 27/1; Harcırah Kanunu 6245)
- Çalışana ödenen gündeliklerin, en yüksek devlet memuruna ödenen gündeliği aşmayan kısmı GV'den istisnadır. **2026 yurt içi en yüksek dilim: 900 TL/gün** (I. dönem: brüt ≥ 35.907,57 TL; II. dönem: brüt ≥ 40.762,28 TL için; HMB genelgeleri).
- **Yurt dışı:** CK 10928, RG 31.01.2026, 01.01.2026'dan geçerli; örnek: ABD 199 USD, Almanya 176 EUR, İngiltere 127 GBP; ilk 10 gün %50 artırımlı. Hangi kadro kolonunun en yüksek devlet memuruna karşılık geldiği **doğrulanamadı** (karar ekinin aslından alınmalı).
- Belgeli ulaşım ve konaklama giderleri ayrıca işletme gideri yazılır; gündelik bunlara ek olarak ödenir. Gündelik + aynı gün için ayrıca belgeli yemek/şahsi giderin hem gündelikle hem belgeyle mükerrer gider yazılmaması gerekir.

**Uyarı metni:** "Bu seyahat için gündelik ödendi. Aynı güne ait yemek fişi ayrıca gider yazılırsa mükerrer olabilir."

### 4.5 Temsil ve ağırlama (GVK 40/1, KVK 8/1)
- Kurumlar için tutar sınırı yoktur; işle ilgisi ve belgesi şarttır. İşle ilgili temsil-ağırlamanın KDV'si indirilebilir.
- Uygulama sorar: "Kimlerle? (müşteri/firma adı, kişi sayısı)", "İş amacı?". Kişi sayısına göre makul tutar kontrolü yapılabilir.

### 4.6 Kanunen kabul edilmeyen giderler (KVK 11, GVK 41) – genel
- Örnekler: binek oto %30 ve sınır aşımları; MTV; **vergi cezaları, gecikme zammı/faizi, idari para cezaları, trafik cezaları** (KVK 11/1-d); işle ilgisi olmayan/şahsi harcamalar; belgesiz giderler; örtülü sermaye/transfer fiyatlandırması; KDVK 30/d gereği bunlara ait KDV.
- **Bağış:** KVK 10/1-a ve GVK 89/4: kamu idareleri, kamu yararına dernek ve Cumhurbaşkanınca vergi muafiyeti tanınan vakıflara yapılan bağışlar, cari yıl kurum kazancının **%5**'ine kadar (kalkınmada öncelikli yörelerde %10) indirilebilir; diğer bağışlar KKEG. Bağış masraf olarak değil ayrı tür olarak alınmalı ve alındı belgesi istenmeli.

**Uyarı metni:** "Trafik / vergi / idari para cezaları gider yazılamaz (KVK 11/1-d). Bu kalem KKEG olarak işaretlendi."

---

## 5. Belge saklama

- **VUK 253:** Defter ve belgeler, ilgili oldukları yılı izleyen takvim yılından başlayarak **5 yıl** saklanır. VUK 256: elektronik kayıtlar ve veri tabanları istendiğinde ibraz edilmelidir.
- **TTK 82:** Ticari defterler ve belgeler **10 yıl** saklanır. Ürün varsayılanı: **10 yıl** (daha uzun olan esas).
- **e-Fatura / e-Arşiv:** Hukuken geçerli olan **XML** (mali mühürlü) halidir; PDF/kağıt çıktı görüntüdür. Saklama elektronik ortamda (kendi sistemi veya izinli saklama hizmeti) yapılır; birincil saklama yurt içinde olmalı, yedek yurt dışında olabilir (VUK GT 433 ve 509 çerçevesi; Dünya, 30.08.2018).
- **Kağıt fiş/fatura:** Taranmış görüntünün aslının yerine geçtiğine dair genel bir VUK düzenlemesi **tespit edilemedi**. Bu nedenle kağıt asıllar 5 yıl (VUK) / 10 yıl (TTK) saklanmalıdır. Uygulama "dijital kopya" tutar, ama aslının fiziki saklandığı yeri (klasör/kutu no) kaydetmelidir.

**Uyarı metni:** "Kağıt fişin aslını atmayın. Muhasebeye teslim edin; taranmış görüntü vergi incelemesinde aslının yerine geçmeyebilir. Asıl belge teslim edildi mi?"

---

## 6. e-Fatura / e-Arşiv karekodu ve doğrulama

**Dayanak:** GİB "Karekod Standardı Kılavuzu" (v1.0 Şubat 2023; v1.1 yürürlükte). 01.09.2023'ten itibaren düzenlenen e-Fatura, e-Arşiv, e-İrsaliye, e-SMM, e-MM, e-Sigorta Komisyon Gider Belgesi, e-Döviz ve Kıymetli Maden belgesi ve e-Adisyon'da karekod zorunlu.

**Format:** Düz (flat) JSON nesnesi. Teyit edilen anahtarlar (TÜRMOB'da yayımlanan GİB kılavuzu v1.0):

| Belge | JSON anahtarları |
|---|---|
| e-Fatura / e-Arşiv | `vkntckn`, `avkntckn`, `senaryo`, `tip`, `tarih`, `no`, `ettn`, `parabirimi`, `malhizmettoplam`, `kdvmatrah(<oran>)`, `hesaplanankdv(<oran>)`, `vergidahil`, `odenecek` |
| e-SMM | `vkntckn`, `avkntckn`, `tarih`, `no`, `ettn`, `parabirimi`, `brutucret`, `tahsilkdv`, `kdvtevkifat`, `gvstopaj`, `kdvtutari`, `netucret`, `tahsilat` |
| e-MM | `vkntckn`, `avkntckn`, `senaryo`, `tip`, `tarih`, `no`, `ettn`, `parabirimi`, `malhizmettoplam`, `gvstopaj`, `merafonu`, `borsatescilucreti`, `sgkprimkesintisi`, `odenecek` |
| e-Adisyon | `vkntckn`, `avkntckn`, `senaryo`, `tip`, `tarih`, `no`, `ettn`, `odenecek` |

Değer formatları (kılavuz örneğinden): `tarih` = `YYYY-AA-GG`; tutarlar nokta ondalık ayraçlı string (`"1000.00"`); `parabirimi` = `"TRY"`; e-Arşiv'de `senaryo` = `"EARSIVFATURA"`; e-Fatura'da `"TEMELFATURA"`/`"TICARIFATURA"`; `tip` örn. `"SATIS"`. Oran anahtarı örneği: `kdvmatrah(8)`, `hesaplanankdv(8)` → güncel oranlarda `kdvmatrah(20)`, `kdvmatrah(10)`, `kdvmatrah(1)` beklenir; birden çok oranda her oran için ayrı anahtar olacağı varsayımı **kılavuz örneğinde gösterilmediği için doğrulanamadı** (parser esnek olmalı: `^kdvmatrah\((\d+(\.\d+)?)\)$`). `no` örneği 16 karakter (`GIB2022000000001`: 3 harf ön ek + yıl + 9 hane sıra).

**Örnek (kılavuz yapısına göre, değerler örnektir):**
```json
{"vkntckn":"1234567890","avkntckn":"9876543210","senaryo":"EARSIVFATURA","tip":"SATIS",
 "tarih":"2026-10-15","no":"ABC2026000000123","ettn":"3fa85f64-5717-4562-b3fc-2c963f66afa6",
 "parabirimi":"TRY","malhizmettoplam":"5000.00","kdvmatrah(10)":"5000.00",
 "hesaplanankdv(10)":"500.00","vergidahil":"5550.00","odenecek":"5550.00"}
```
(`vergidahil` – `kdvmatrah` – `hesaplanankdv` farkı konaklama vergisi gibi diğer vergileri gösterir.)

**Doğrulama:**
- GİB e-Belge mobil uygulaması karekodu okuyup "Belge GİB kayıtlarında mevcuttur" sonucunu gösterir (birfatura).
- GİB sitesinde girişsiz e-Arşiv fatura sorgulama: fatura no (16 hane) + düzenleyen VKN/TCKN + ödenecek tutar (paraşüt). Yalnız ETTN ile kamuya açık sorgu / resmi API **doğrulanamadı**; otomatik doğrulama için özel entegratör API'si veya kullanıcıyı GİB sorgu ekranına yönlendirme düşünülmeli.
- e-Fatura kayıtlı kullanıcı listesi (e-Belge portalı) ile satıcının e-Fatura mükellefi olup olmadığı kontrol edilebilir.
- e-Arşiv fatura, ertesi ayın 8'ine kadar iptal edilebilir (paraşüt) → uygulama ay sonu kapanışından sonra ikinci kontrol yapmalı.

**Uygulama kontrolleri:** Karekod varsa OCR yerine **karekod verisi esas alınır**; OCR toplamı ile `odenecek` karşılaştırılır; `avkntckn` şirket VKN'si mi; aynı `ettn` daha önce yüklendi mi (mükerrer).

**Uyarı metinleri:**
- "Bu ETTN ile bir belge daha önce [kişi] tarafından [tarih]'te yüklendi. Mükerrer masraf olabilir."
- "Karekoddaki tutar (5.550,00) ile fotoğraftan okunan tutar (5.050,00) uyuşmuyor."
- "Faturadaki alıcı VKN şirketinize ait değil."

---

## 7. Muhasebe kayıtları (Tekdüzen Hesap Planı)

| Hesap | Kullanım |
|---|---|
| 100 Kasa / 102 Bankalar | Ödeme |
| 136 Diğer Çeşitli Alacaklar | Çalışandan geri alınacak (onaylanmayan/şahsi) tutarlar |
| 191 İndirilecek KDV | İndirilebilir KDV |
| 195 İş Avansları | İş için verilen, masrafla kapanacak avans |
| 196 Personel Avansları | Maaştan mahsup edilecek şahsi avans |
| 335 Personele Borçlar | Çalışanın cebinden ödediği, şirketin iade edeceği masraf |
| 730 Genel Üretim Giderleri | Üretimle ilgili |
| 740 Hizmet Üretim Maliyeti | Hizmet işletmelerinde |
| 750 Araştırma ve Geliştirme Giderleri | Ar-Ge |
| 760 Pazarlama Satış ve Dağıtım Giderleri | Saha satış, müşteri ziyareti, temsil (satış) |
| 770 Genel Yönetim Giderleri | İdari giderler |
| 689 Diğer Olağandışı Gider ve Zararlar | Uygulamada KKEG'lerin (binek %30, cezalar) izlendiği hesap. Not: KKEG ayrımı yasal olarak beyannamede yapılır; 689 kullanımı bir uygulama tercihidir, alternatif olarak 7/A gider hesabında "KKEG" alt hesabı açılır |

(7/A seçeneğinde 7xx yansıtma ve 63x kapanış kayıtları dönem sonunda muhasebe yazılımında yapılır; masraf uygulaması 7xx'e kadar üretir.)

**(a) %10 KDV'li yemek fişi, 1.000 TL (KDV dahil), çalışan kendi cebinden ödedi** (ÖKC fişi, sınırın altında, genel gider/işle ilgili):
- Matrah = 1.000 / 1,10 = 909,09; KDV = 90,91

| Hesap | Borç | Alacak |
|---|---|---|
| 760 (saha satış) veya 770 – Yemek Giderleri | 909,09 | |
| 191 İndirilecek KDV | 90,91 | |
| 335 Personele Borçlar – [Çalışan] | | 1.000,00 |

İade ödemesi: 335 Borç 1.000,00 / 102 Alacak 1.000,00.
Not: Yemek müşteriyle ise "Temsil-Ağırlama" alt hesabı; yalnız çalışanın kendi rutin öğle yemeği ise ücret niteliğine dikkat (bkz. 4.2). ÖKC fişi KDV'sinin indirimi KDV GUT'taki genel gider kısıtına tabidir; temkinli yaklaşım için ayarlanabilir parametre olmalı.

**(b) Binek araç yakıt, 2.000 TL + %20 KDV (400 TL) = 2.400 TL, UTTS'li, kısıtlamalı:**
- Gider %70 = 1.400; KKEG %30 = 600
- KDV %70 = 280 indirilebilir; KDV %30 = 120 indirilemez → KKEG (KDVK 30/d, GİB özelgesi 06.03.2024)

| Hesap | Borç | Alacak |
|---|---|---|
| 760/770 – Taşıt Giderleri (Binek – kabul edilen) | 1.400,00 | |
| 689 (veya 760/770 "KKEG" alt hesabı) – Binek %30 KKEG | 720,00 | |
| 191 İndirilecek KDV | 280,00 | |
| 335 Personele Borçlar (ya da 195 İş Avansları / 102) | | 2.400,00 |

Kurumlar vergisi beyannamesinde 720 TL KKEG olarak eklenir. (Not: Bazı uygulamacılar KDV'nin tamamını indirmektedir; GİB görüşü yukarıdaki gibidir – varsayılan temkinli ayar.)

**(c) e-Arşiv otel faturası, konaklama vergili** (örnek: 2 gece × 2.500 TL = 5.000 TL, konaklama %10 KDV, 01.05.2026 sonrası konaklama vergisi %1):
- Konaklama vergisi = 5.000 × %1 = 50 (KDV matrahına dahil edilmez – 6802 md. 34)
- KDV = 5.000 × %10 = 500
- Toplam = 5.550

| Hesap | Borç | Alacak |
|---|---|---|
| 770/760 – Seyahat-Konaklama Giderleri | 5.000,00 | |
| 770/760 – Vergi, Resim ve Harçlar (Konaklama Vergisi) | 50,00 | |
| 191 İndirilecek KDV | 500,00 | |
| 195 İş Avansları – [Çalışan] (avanstan ödendiyse) veya 335 | | 5.550,00 |

01.05.2026 öncesi konaklamalarda konaklama vergisi %2 (=100 TL). Fatura alıcısı şirket VKN'si değilse 500 TL KDV indirilemez ve gidere eklenir.

---

## 8. Masraf merkezi / proje takibi ve avans akışı

**Masraf merkezi:** Tekdüzen hesap planında 7/A seçeneğinde 7xx ana hesaplarının alt hesapları (ör. 760.01.İZMİR, 770.03.İK) veya ERP'de ayrı "masraf merkezi" boyutu kullanılır. Uygulamanın her masraf satırında tutması önerilen boyutlar: **şirket, masraf merkezi (departman/bölge), proje, müşteri, araç plakası, gider kategorisi → hesap kodu eşlemesi**. Hesap kodu eşlemesi şirket/muhasebe bürosu bazında yapılandırılabilir olmalı (Logo, Mikro, Netsis, Luca export şablonları).

**Avans akışı:**
1. Avans verilir: 195 İş Avansları (Borç) / 102 Bankalar (Alacak). (Şahsi/maaştan düşülecek avans 196.)
2. Masraf raporu ("Ekim 2026 Masrafları") onaylanır: 7xx + 191 (Borç) / 195 (Alacak).
3. Fark:
   - Harcama < avans: kalan iade edilir → 100/102 (Borç) / 195 (Alacak); iade edilmezse 196 veya 136'ya aktarılır, maaştan mahsup.
   - Harcama > avans: fark çalışana borç → 195'i kapat, fark 335 (Alacak); ödeme 335 / 102.
4. Onaylanmayan/şahsi harcamalar: 136 Diğer Çeşitli Alacaklar veya 196 (çalışandan tahsil).

**Uygulama kuralı:** Açık avans bakiyesi olan çalışanın yeni raporu önce avanstan mahsup edilir; X gün (parametre) kapanmayan avans için hatırlatma.

---

## 9. KVKK notları

**Veri sorumlusu / işleyen:** Müşteri şirket veri sorumlusu, SaaS sağlayıcı veri işleyen; yurt dışındaki yapay zekâ API sağlayıcısı alt-veri işleyen.

**İşleme şartları (KVKK 5/2):** (c) iş sözleşmesinin ifası, (ç) hukuki yükümlülük (VUK/TTK saklama), (f) meşru menfaat. Açık rıza çalışan ilişkisinde zayıf dayanaktır; aydınlatma metni (KVKK 10) zorunlu. Veri sorumlusu VERBİS kaydı koşullarına tabi olabilir.

**Özel nitelikli veri riski (KVKK 6):** Eczane, hastane, dernek, ibadet yeri fişleri sağlık/din/dernek üyeliği verisi taşıyabilir. 7499 s. Kanun ile md. 6 yeniden düzenlendi; uygulama bu kategorileri tespit edip görüntü/açıklama alanında maskeleme önermeli.

**Yurt dışına aktarım (KVKK 9 – 7499 s. Kanun, RG 12.03.2024, 32487; yürürlük 01.06.2024; Yönetmelik RG 10.07.2024, 32598):**
1. **Yeterlilik kararı** (ülke/sektör/uluslararası kuruluş) – bir ülke için yeterlilik kararı alınıp alınmadığı **doğrulanamadı**; tasarımda yok varsayılmalı.
2. **Uygun güvenceler:** Kurul'un yayımladığı **standart sözleşme** (değiştirilmeden kullanılır; Kurul Kararı 2024/959, 04.06.2024), bağlayıcı şirket kuralları (Kurul onayı), taahhütname (Kurul izni).
   - Standart sözleşme **imzadan itibaren 5 iş günü içinde Kurum'a bildirilir** (KEP, fiziki veya Standart Sözleşme Bildirim Modülü – 25.10.2024'te duyuruldu). Bildirmeme cezası 2026: **90.308 – 1.806.377 TL** (cottgroup).
   - Bizim senaryoda: veri işleyenden (SaaS) veri işleyene (AI API) modülü uygun.
3. **Arızi aktarım** (açık rıza vb.): yalnız düzenli olmayan, arızi aktarımlar için; düzenli fiş OCR akışı bu kapsama sokulamaz. Açık rızaya dayalı eski aktarımlar için geçiş süresi 01.09.2024'te sona erdi (7499 geçici madde).

**Ürün önlemleri:** Görüntüyü AI'ya göndermeden önce mümkünse yüz/kişi adı/kart numarası maskeleme; AI sağlayıcıda veri saklamama/eğitimde kullanmama (zero-retention) sözleşmesi; birincil depolama Türkiye'de; şifreleme; rol bazlı erişim; saklama süresi (10 yıl) sonunda imha (Kişisel Verilerin Silinmesi Yönetmeliği); denetim kaydı. Aydınlatma metninde yurt dışı aktarım, alıcı, amaç ve güvence açıkça yazılmalı.

**Uyarı metni (ilk yüklemede):** "Fişinizin görüntüsü, tutarın otomatik okunması için [sağlayıcı]'ya (ABD) aktarılır. Aktarım KVKK 9 kapsamında standart sözleşme ile yapılmaktadır. Sağlık bilgisi içeren fişlerde (eczane, hastane) hassas alanları maskeleyin."

---

## 10. Uygulamanın otomatik yapacağı kontroller

1. **Belge türü tespiti:** e-Fatura / e-Arşiv / ÖKC / akaryakıt ÖKC / perakende fiş / e-SMM / gider pusulası / e-MM / bilet / yurt dışı fatura / dekont-slip / biniş kartı / bilgi fişi olarak sınıflandır; dekont, slip, biniş kartı, bilgi fişi → "geçerli vergi belgesi değil" uyarısı, onaya göndermeden asıl belge iste.
2. **Karekod önceliği:** Karekod okunursa JSON'u parse et; `odenecek` toplam olarak alınır; OCR toplamı ile fark > 0,01 TL ise uyarı.
3. **Alıcı VKN kontrolü:** `avkntckn` ≠ şirket VKN → KDV indirilemez işareti; 11 haneli TCKN ise "çalışan adına kesilmiş" uyarısı.
4. **Fatura sınırı:** Belge türü ÖKC/perakende fiş (akaryakıt hariç) ve toplam > sınır[yıl] (2025: 9.900; 2026: 12.000) → kırmızı uyarı.
5. **Bölünmüş fiş:** Aynı satıcı VKN + aynı gün + aynı kullanıcı fişlerinin toplamı > sınır → uyarı.
6. **Mükerrer belge:** Aynı ETTN, ya da aynı (satıcı VKN + belge no/fiş no + tarih + tutar), ya da görüntü hash/perceptual hash benzerliği → engelle + muhasebeciye bildir (kişiler arası dahil).
7. **KDV indirim süresi:** belge yılı + 1 yılın 31 Aralık'ı < kayıt tarihi → KDV'yi gidere ekle, uyarı.
8. **KDV oranı geçerliliği:** Okunan oran ∈ {1, 10, 20} değilse ve belge tarihi ≥ 10.07.2023 → OCR/fiş hatası uyarısı; matrah × oran ≈ KDV (±0,05 TL) kontrolü.
9. **Toplam tutarlılığı:** malhizmettoplam + Σhesaplanankdv + diğer vergiler ≈ vergidahil.
10. **ÖKC fişinde KDV indirimi:** Kategori "genel gider küçük alım/taksi" dışındaysa ÖKC fişi KDV'sini indirilebilir olarak işaretleme (şirket parametresi: temkinli/esnek).
11. **Binek araç:** Kategori akaryakıt/bakım/otopark/köprü-otoyol/sigorta/kira ve plaka şirket araç listesinde "binek (87.03)" ise gider %70 / KKEG %30, KDV %70 / %30 KKEG otomatik böl.
12. **Binek kira sınırı:** Aylık araç başı kira (KDV hariç) > 46.000 TL (2026) → aşan kısım ve KDV'si KKEG; günlük kiralamada sınır/ay gün sayısı.
13. **UTTS / plaka:** Akaryakıt fişinde plaka yok veya şirket listesinde değilse → "gider yazılamaz" uyarısı; şahsi araç plakası ise muhasebeci onayına zorunlu düşür.
14. **Konaklama faturası:** Kategori konaklama ise konaklama vergisi satırı ara; oran beklenen (≤30.04.2026: %2; 01.05–31.12.2026: %1) değilse uyarı; konaklama vergisi KDV matrahına dahilse hata.
15. **Yemek / kişi bilgisi:** Kategori yemek/ağırlama ise "kimlerle" alanı zorunlu; yalnız çalışanın kendisi + seyahatte değil + tutar > 300 TL/gün (2026) → "bordroya ücret olarak yansıtılabilir" bayrağı.
16. **Harcırah mükerrerliği:** Aynı gün için gündelik ödendiyse aynı güne ait yemek fişini işaretle; gündelik > 900 TL/gün (2026 yurt içi) ise aşan kısım bordro bayrağı.
17. **KKEG kategorileri:** Ceza, gecikme faizi, MTV, şahsi harcama, bağış (alındısız/kapsam dışı) → otomatik KKEG; trafik cezası için engelleyici uyarı.
18. **e-SMM:** Brüt, GV stopajı (%20) ve KDV tevkifatı alanları var mı; şirket muhtasar yükümlülüğü için muhasebeciye bildir.
19. **Gider pusulası:** Satıcı mükellef değil beyanı, TCKN, imza ve GV tevkifatı gerekliliği kontrolü.
20. **e-Arşiv ↔ e-Fatura uyumsuzluğu:** Satıcı ve şirket e-Fatura kayıtlı kullanıcı ise e-Arşiv gelmesi → "yanlış belge türü" uyarısı.
21. **Yurt dışı fatura:** Döviz → fatura tarihi TCMB döviz alış kuru ile TL; yabancı KDV indirilemez; hizmet Türkiye'de kullanılıyorsa "sorumlu sıfatıyla KDV (2 No.lu beyanname)" bayrağı.
22. **Tarih kontrolleri:** Belge tarihi rapor dönemi dışında, gelecekte veya 1 yıldan eski → uyarı; hafta sonu/tatil + iş kategorisi → bilgi notu.
23. **e-Arşiv iptal riski:** Ay kapanışından sonra (ertesi ayın 8'inden sonra) GİB sorgusu/yeniden doğrulama görevi.
24. **Kağıt asıl takibi:** Kağıt belgelerde "asıl teslim edildi mi / arşiv kutu no" alanı; teslim edilmeyen asıllar için muhasebeciye liste.
25. **Saklama:** Görüntü + XML + karekod JSON'u, 10 yıl (TTK 82) değiştirilemez (WORM) depolama; silme yalnız süre sonunda imha prosedürüyle.
26. **Hesap eşleme:** Kategori → hesap kodu (760/770/740/730/750 + alt hesap), 191, 335/195/196/136; KKEG kısmı ayrı satır; Logo/Mikro/Netsis/Luca export.
27. **Avans mahsubu:** Açık 195 bakiyesi varsa önce avanstan kapat; fark iade (100/102) veya 335 borç kaydı.
28. **Muhasebeci modu:** Muhasebeci kullanıcısı girdiğinde onay akışı atlanır ama 1–27 kontrolleri yine çalışır ve uyarılar kayda iliştirilir.
29. **KVKK:** Eczane/hastane/dernek kategorisi tespiti → maskeleme önerisi; AI'ya gönderim öncesi aydınlatma kabul kaydı; parametre tablosu yıl bazlı (yıl değişince yeni tutarlar).

---

## Kaynaklar

- VUK Genel Tebliği Sıra No 588 (2026 had ve tutarlar): https://www.alomaliye.com/2025/12/31/vergi-usul-kanunu-genel-tebligi-sira-no-588/
- 2026 fatura kesme sınırı ve tarihsel tablo: https://www.muhasebetr.com/fatura-kesme-siniri
- Binek otomobillerin 2026 giderleri (Dr. A. Bumin Doğrusöz, 22.01.2026): https://www.ekonomigazetesi.com/kose-yazisi/binek-otomobillerin-2026-giderleri-ve-amortismanlari-70546
- Binek otoyu vergiden düşmek (Alomaliye, 01.04.2026): https://www.alomaliye.com/2026/04/01/binek-otoyu-vergiden-dusmek-hala-cazip-mi/
- KPMG – binek otomobil kısıtlamaları (311 Seri GVK GT): https://kpmgvergi.com/blog/binek-otomobillerin-giderlerine-iliskin-kisitlamalar-ve-oneriler/1261
- GİB özelgesi 06.03.2024 (binek araç giderleri ve KDV): https://www.alomaliye.com/2024/03/06/binek-araclara-ait-giderlerin-indirim-konusu-yapilip-yapilmayacagi/amp/
- Binek otomobil KDV 30/d (Alomaliye 2020): https://www.alomaliye.com/2020/05/21/binek-otomobillerin-giderlerine-getirilen-kisitlamalar/
- UTTS zorunluluğu (Andersen): https://tr.andersen.com/tr/images/pdf/and_56-utts-zorunlulugu.pdf
- UTTS (Allianz): https://www.allianz.com.tr/tr_TR/seninle-guzel/utts-zorunlu-mu-cezasi-var-mi.html
- Yemek bedeli 2026 (muhasebetr): https://www.muhasebetr.com/vergiden-mustesna-yemek-bedeli/
- SGK Genelgesi 2026/12 yemek bedeli (KPMG): https://kpmgvergi.com/yayinlar/mali-bultenler/sosyal-guvenlik/yemek-bedeli-konulu-202612-sayili-sosyal-guvenlik-kurumu-genelgesi/4493
- 2026 yemek ve yol istisna tutarları (Kolay İK – ticari kaynak): https://kolayik.com/blog/2026-gunluk-yemek-ve-yol-istisna-tutarlari
- 2026 I. dönem harcırah istisna (Cottgroup): https://cottgroup.com/tr/mevzuat/item/2026-i-donem-gelir-vergisinden-istisna-harcirah-tutarlari
- 2026 II. dönem harcırah istisna (Cottgroup): https://cottgroup.com/tr/mevzuat/item/gelir-vergisinden-istisna-harcirah-tutarlari
- PwC Vergi Bülteni 2026/08 – yurt dışı gündelikler: https://www.pwc.com.tr/tr/hizmetlerimiz/vergi/bultenler/2026/vergiden-mustesna-yurt-disi-gundelik-tutarlari.html
- Konaklama vergisi oranında indirim (CK 11263): https://www.ekonomigazetesi.com/kose-yazisi/konaklama-vergisi-oraninda-indirim-79272
- KDV 29/3 iki yıllık süre (KPMG): https://kpmgvergi.com/blog/kdv-indiriminde-iki-yillik-hak-ne-zaman-uygulanacak/62
- GİB özelgesi (KDVK 29/1, 34/1): https://www.gib.gov.tr/node/90222/pdf
- ÖKC/perakende satış fişi ile gider ve KDV: https://www.muhasebetr.com/yazarlarimiz/abubekir/013
- Bilgi fişinin kaldırılması (Mayıs 2026): https://www.ekonomigazetesi.com/ekonomi/perakende-ticarette-bilgi-fisi-uygulamasi-kaldiriliyor-78920
- GİB Karekod Standardı Kılavuzu (TÜRMOB kopyası): https://turmob.org.tr/dokumanlar/download/830a2973-0c58-489c-a714-4fe497eaaa55
- Karekod zorunluluğu ve GİB kılavuz v1.1: https://birfatura.com/e-belgede-karekod-zorunlu-mu/
- Karekod zorunluluğu 01.09.2023: https://www.muhasebetr.com/yazarlarimiz/evrenozmen/0280/
- e-Fatura/e-Arşiv sorgulama: https://www.parasut.com/blog/e-fatura-e-arsiv-sorgulama-islemi-nasil-yapilir
- e-Arşiv belgelerin muhafazası (Dünya): https://www.dunya.com/kose-yazisi/vergi-usul-kanununa-gore-e-arsiv-belgelerin-muhafaza-ve-ibrazi/426223
- VUK GT 509 metni: https://www.alomaliye.com/2019/12/20/vuk-509-e-fatura-e-arsiv-fatura/
- KVKK yurt dışı aktarım (Erdem & Erdem): https://www.erdem-erdem.av.tr/bilgi-bankasi/kisisel-verilerin-yurt-disina-aktarilmasinda-yasanan-son-gelismeler
- Standart sözleşme bildirim yükümlülüğü ve 2026 cezası (Cottgroup): https://www.cottgroup.com/en/legislation/item/standart-sozlesme-bildirim-yukumlulugu-ve-yaptirimlari
- KVKK standart sözleşme dokümanları duyurusu: https://www.kvkk.gov.tr/Icerik/7938/Standart-Sozlesmeler-ve-Baglayici-Sirket-Kurallarina-Iliskin-Dokumanlar-Hakkinda-Kamuoyu-Duyurusu
- 2026 KVKK idari para cezaları: https://cottgroup.com/tr/mevzuat/item/yeniden-degerleme-oranina-gore-2026-yili-kvkk-idari-para-cezalari

Mevzuat ana metinleri (resmi): mevzuat.gov.tr – VUK (213), GVK (193), KVK (5520), KDVK (3065), TTK (6102), KVKK (6698); Resmî Gazete arşivi: resmigazete.gov.tr; GİB e-Belge: ebelge.gib.gov.tr (bu oturumdan erişilemedi).

### Canlıya çıkmadan YMM teyidi gereken "doğrulanamadı" listesi
- 2025 fatura sınırı tebliğ numarası; 2026 yol (toplu taşıma) istisna tutarı; ayni yemekte 330 TL iddiası.
- Yurt dışı gündelikte en yüksek devlet memuru kolonunun hangisi olduğu.
- ÖKC fişi KDV indirimine ilişkin KDV GUT'un güncel bölüm/numarası ve kapsamı.
- Biniş kartı/e-bilet KDV indirimi koşulları.
- Karekodda çoklu KDV oranlı faturalarda anahtar yapısı (kılavuz v1.1 ile teyit).
- ETTN ile kamuya açık doğrulama/API varlığı.
- Taranmış kağıt belgenin aslının yerine geçmesine imkan veren bir düzenleme bulunmadığı.
- Bilgi fişini kaldıran Mayıs 2026 VUK Genel Tebliği'nin sıra numarası.
- Herhangi bir ülke için KVKK yeterlilik kararı bulunup bulunmadığı.
