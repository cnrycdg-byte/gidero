# Gidero mobil uygulaması: Apple HIG'e göre tasarım kararları

Kaynak: Apple Human Interface Guidelines, JSON adreslerinden okundu
(`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<sayfa>.json`), 31 Ekim 2026.
Okunan sayfalar: layout, typography, color, tab-bars, lists-and-tables, sf-symbols, materials,
buttons, dark-mode, accessibility, branding, onboarding.

Her satırda: karar, uygulandığı yer ve dayandığı HIG sayfası / bölümü.

## Yazı

| Karar | Kodda | HIG kaynağı |
|---|---|---|
| Bütün yazılar sistem fontuyla (iOS'ta SF Pro). Bricolage ve Figtree kaldırıldı, font gömülmüyor. | `constants/theme.ts` (`systemFont`), `components/text.tsx` | typography > Using system fonts; Platform considerations: "SF Pro is the system font in iOS and iPadOS"; Developer note: "don't embed system fonts" |
| Metin stilleri iOS "Large (default)" tablosundan: Large Title 34/41, Title 2 22/28, Headline 17/22 semibold, Body 17/22, Callout 16/21, Subhead 15/20, Footnote 13/18, Caption 1 12/16. | `type` | typography > Specifications > iOS, iPadOS Dynamic Type sizes |
| Gövde metni 17 pt; hiçbir yazı 11 pt'nin altında değil. | `type.body`, `type.caption` | typography > Ensuring legibility (iOS default 17 pt, minimum 11 pt); accessibility > Vision |
| Vurgu için ince kalınlıklar yok; Regular, Medium, Semibold, Bold. | `fonts` eşlemesi | typography > "avoid light font weights" |
| Vurgulu stiller: Large Title ve Title bold, diğerleri semibold. | `type.display`, `type.title`, `type.bodyStrong` | typography > Specifications (Emphasized weight sütunu) |
| Yazılar Dynamic Type ile büyür (React Native `allowFontScaling` açık bırakıldı). | `components/text.tsx` | typography > Supporting Dynamic Type; accessibility > "Support larger text sizes" |
| Gezinme çubuğu başlığı Headline; üst düzey ekranlarda büyük başlık. | `lib/nav-options.tsx`, sekme yığınları | typography > Conveying hierarchy |

## Renk

| Karar | Kodda | HIG kaynağı |
|---|---|---|
| Arka planlar gruplu set: `systemGroupedBackground` (zemin), `secondarySystemGroupedBackground` (kart ve liste). | `canvas`, `paper` | color > Platform considerations > iOS, iPadOS: "use the grouped background colors ... when you have a grouped table view" |
| Yazılar `label`, `secondaryLabel`, `tertiaryLabel`; ayraç `opaqueSeparator`; dolgular `tertiarySystemFill`. | `ink`, `muted`, `faint`, `paperLine`, `fill` | color > iOS, iPadOS foreground colors tablosu; "Avoid redefining the semantic meanings of dynamic system colors" |
| Durum renkleri sistem renkleri: `systemRed`, `systemOrange`, `systemGreen`, `systemBlue`. | `red`, `amber`, `green`, `blue` | color > System colors |
| Açık modda küçük metinde kırmızı ve turuncu için sistemin artırılmış karşıtlık varyantı kullanıldı (4,5:1 üstü). | `light.red`, `light.amber` | accessibility > Vision: "Up to 17 pts ... 4.5:1"; dark-mode > "no lower than 4.5:1" |
| Ayarlar > Erişilebilirlik > Karşıtlığı artır açıksa daha güçlü varyantlar devreye girer. | `useHighContrast`, `lightContrast`, `darkContrast` | color > "work well in light, dark, and increased contrast contexts" |
| Vurgu (accent) rengi: şirketin kurumsal rengi ya da Gidero yeşili; yalnızca ana eylemde, seçili sekmede ve rozetlerde. | `pen`, sekme `tintColor` | branding > "Apply your app's accent color judiciously ... the selected tab in a tab bar"; color > Liquid Glass color: "choosing your brand color as the app accent color can be an effective way" |
| Uygulamaya özel açık/koyu seçeneği kaldırıldı; görünüm telefonun ayarını izler. | `useScheme`, Hesabım ekranı | dark-mode > "Avoid offering an app-specific appearance setting" |
| Anlam yalnızca renkle verilmez: her uyarı tonunun kendi sembolü var, yazı birincil renkte. | `Notice` | color > Inclusive color; accessibility > "Convey information with more than color alone" |

Not: renk değerleri sabit yazıldı, çünkü aynı tema web ve Android'de de kullanılıyor. HIG "Avoid hard-coding system color values" diyor; iOS'ta `PlatformColor` ile sistemden okumak sonraki adım olabilir. Değerler iOS sistem değerleriyle aynı.

## İkonlar

| Karar | Kodda | HIG kaynağı |
|---|---|---|
| iOS'ta bütün ikonlar SF Symbols, Android'de Material Symbols. | `components/icon.tsx` | sf-symbols (giriş); dark-mode > "Use SF Symbols wherever possible" |
| Liste ve satırlarda çizgi (outline) varyant, sekme çubuğunda dolu (fill) varyant. | `icon.tsx`, sekme ikonları | sf-symbols > Design variants: "an iOS tab bar prefers the fill variant, whereas a toolbar takes the outline variant" |
| Tanıdık eylemlere tanıdık semboller: paylaş `square.and.arrow.up`, sil `trash`, ekle `plus`. | `icon.tsx` | buttons > Content: "associate familiar actions with familiar icons" |
| Web'de SF Symbols kullanılmaz, basit karakterler gösterilir. | `WEB_GLYPH` | sf-symbols > kullanım koşulları (yalnızca Apple platformları) |

## Sekme çubuğu

| Karar | Kodda | HIG kaynağı |
|---|---|---|
| Telefonda alt sekme çubuğu: Raporlar, Onay, Muhasebe, Ödeme, Hesabım. Sekmeler bölüm gezinmesi içindir, eylem içermez. | `app/(tabs)/_layout.tsx` | tab-bars > "Use a tab bar to support navigation, not to provide actions" |
| En çok 5 sekme; "Daha fazla" sekmesi oluşmaz. | aynı | tab-bars > "Avoid overflow tabs"; iPadOS: "aim for a default list of five or fewer" |
| Tek kelimelik etiketler. | aynı | tab-bars > "Use single words whenever possible" |
| Rozet yalnızca sizi bekleyen iş için: geri gönderilen rapor, onay, muhasebe, ödeme. | `useNavCounts` | tab-bars > "Reserve badges for critical information" |
| Sekmeler oturum boyunca sabit; kişinin rolü olmayan bölüm baştan gösterilmez, var olan sekme hiç gizlenmez ya da pasifleşmez. | `hidden` yalnızca ilk çizimde | tab-bars > "Don't disable or hide tab bar buttons" |
| iOS 26'da çubuk Liquid Glass üzerinde yüzer, kaydırınca küçülür. | `NativeTabs`, `minimizeBehavior="onScrollDown"` | tab-bars > iOS; materials > Liquid Glass |
| Geniş ekranda (iPad, büyük pencere) sekme çubuğu yerine soldaki menü. | `hidden={wide}`, `Sidebar` | layout > Size classes: "switch from a Tab bars to a Sidebars" |
| Web'de sekme çubuğu yok (geniş ekranda sol menü, dar ekranda sağ üstte Hesabım). | `app/(tabs)/_layout.web.tsx` | layout > Adaptability |

Bilinen sapma: rapor ve fiş ayrıntısı kök yığında açıldığı için bu ekranlarda sekme çubuğu görünmez. HIG sekme çubuğunun bölümler arasında görünür kalmasını ister (tab-bars > "Make sure the tab bar is visible"). Ayrıntı ekranlarını sekme yığınlarına taşımak sonraki adımdır.

## Listeler ve düzen

| Karar | Kodda | HIG kaynağı |
|---|---|---|
| Ayarlar, kısayollar ve rapor listeleri "inset grouped" liste: başlık, yuvarlatılmış grup, aralarda boşluk. | `Group`, `SectionTitle` | lists-and-tables > Style: "the grouped style uses headers, footers, and additional space" |
| Satır başlığı Body, ikinci satır Footnote secondaryLabel; tek satıra sığmayan metin kısaltılır. | `Row` | lists-and-tables > Content: "Keep item text succinct" |
| Alt sayfaya giden satırda açılma oku; bilgi düğmesi gezinme için kullanılmaz. | `Row` (`chevron`) | lists-and-tables > iOS: "use a disclosure indicator" |
| Satıra dokununca kısa vurgu. | `Row` basılı hâli | lists-and-tables > "Provide appropriate feedback when people select a list item" |
| Ayraç yazının başladığı hizadan başlar. | `separator` | layout > Visual hierarchy: "Align elements to make them easier to scan" |
| Kenar boşluğu 16 pt; satır, düğme ve alanlar en az 44 pt. | `space.lg`, `hit` | layout > Guides and safe areas; buttons > "hit region of at least 44x44 pt" |
| Ana ekranda logo yerine ekran adı; logo yalnızca sol menüde. | `(home)/index.tsx` | branding > "Resist the temptation to display your logo throughout your app" |

## Düğmeler

| Karar | Kodda | HIG kaynağı |
|---|---|---|
| En olası eylem accent dolgulu; ekranda bir ya da iki belirgin düğme. | `Button` `primary` | buttons > Style: "Keep the number of prominent buttons to one or two per view" |
| İkincil eylem gri dolgulu, accent yazılı. Seçenekler boyutla değil stille ayrılır. | `secondary` | buttons > "Use style — not size — to visually distinguish the preferred choice" |
| Yıkıcı eylem (sil) sistem kırmızısıyla; ana rol verilmez. | `danger` | buttons > Role: "a destructive button uses the system red color"; "Don't assign the primary role to a button that performs a destructive action" |
| Her düğmenin basılma hâli var (opaklık). | `Button` | buttons > "Always include a press state for a custom button" |
| Uzun süren işte düğmenin içinde dönen gösterge. | `loading` | buttons > iOS: "display an activity indicator" |
| iOS 26'ya uygun kapsül biçim. | `styles.button` | buttons > Style (Liquid Glass düğmeleri) |

## Materyaller

| Karar | Kodda | HIG kaynağı |
|---|---|---|
| Liquid Glass yalnızca sistem bileşenlerinde (sekme çubuğu, gezinme çubuğu); içerik katmanında kullanılmadı. | `NativeTabs`, native stack | materials > "Don't use Liquid Glass in the content layer"; "Use Liquid Glass effects sparingly" |
| İçerik kartları düz zemin rengiyle ayrılır. | `paper` | materials > Standard materials |

## Tanıtım

| Karar | Kodda | HIG kaynağı |
|---|---|---|
| İlk açılış tanıtımı kısa, atlanabilir, bir kez gösterilir; Hesabım'dan yeniden açılır. | `app/tour.tsx` | onboarding > "If you let people skip the tutorial ... don't present it again ... make sure it's easy for people to find" |
