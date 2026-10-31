// Claude ile fiş görüntüsünü okuma. Yapılandırılmış çıktı (output_config.format, JSON şema) kullanılır;
// zorlanmış tool_choice Sonnet 5.5'te 400 verdiği için kullanılmaz.
// Strateji: önce Haiku (hızlı, ucuz); tutarsız veya düşük güvenli sonuçta bir kez Sonnet.
// Bir fotoğrafta birden çok fiş olabilir: model her belgeyi ayrı öğe olarak döndürür (en çok MAX_RECEIPTS_PER_PHOTO).

import type { ReceiptFields } from "./types.ts";
import { consistencyIssues, mergeQr } from "./validate.ts";

/** Tek fotoğraftan okunacak en çok fiş sayısı (veritabanında da 1..5 sınırı var) */
export const MAX_RECEIPTS_PER_PHOTO = 5;

export const MODELS = {
  fast: "claude-haiku-5-5",
  strong: "claude-sonnet-5-5",
};

const nullable = (type: string) => ({ type: [type, "null"] });

export const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readable", "doc_type", "seller_name", "seller_vkn", "buyer_name", "buyer_vkn", "date", "time",
    "doc_no", "ettn", "z_no", "plate", "currency", "total", "vat_lines", "other_taxes", "confidence", "alcohol"],
  properties: {
    readable: { type: "boolean" },
    doc_type: {
      type: "string",
      enum: ["e_fatura", "e_arsiv", "okc_fis", "akaryakit_okc", "serbest_meslek", "gider_pusulasi",
        "bilet", "yurtdisi_fatura", "dekont", "bilgi_fisi", "unknown"],
    },
    seller_name: nullable("string"),
    seller_vkn: nullable("string"),
    buyer_name: nullable("string"),
    buyer_vkn: nullable("string"),
    date: nullable("string"),
    time: nullable("string"),
    doc_no: nullable("string"),
    ettn: nullable("string"),
    z_no: nullable("string"),
    plate: nullable("string"),
    currency: { type: "string" },
    total: nullable("number"),
    vat_lines: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["rate", "base", "vat"],
        properties: { rate: { type: "number" }, base: { type: "number" }, vat: { type: "number" } },
      },
    },
    other_taxes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["type", "amount"],
        properties: { type: { type: "string", enum: ["konaklama", "otv", "diger"] }, amount: { type: "number" } },
      },
    },
    alcohol: {
      type: "object", additionalProperties: false, required: ["present", "amount", "items"],
      properties: {
        present: { type: "boolean" },
        amount: nullable("number"),
        items: { type: "array", items: { type: "string" } },
      },
    },
    confidence: {
      type: "object", additionalProperties: false, required: ["total", "date", "doc_no", "vat"],
      properties: {
        total: { type: "number" }, date: { type: "number" }, doc_no: { type: "number" }, vat: { type: "number" },
      },
    },
  },
};

/** Fotoğraf şeması: içindeki her belge ayrı öğe; position belgenin fotoğraftaki yeri */
export const PHOTO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["count_in_photo", "receipts"],
  properties: {
    count_in_photo: { type: "integer" },
    receipts: {
      type: "array",
      items: {
        ...RECEIPT_SCHEMA,
        required: [...RECEIPT_SCHEMA.required, "position", "complete"],
        properties: { ...RECEIPT_SCHEMA.properties, position: nullable("string"), complete: { type: "boolean" } },
      },
    },
  },
};

export const RECEIPT_PROMPT = `Bu görüntü Türkiye'de alınmış harcama belgelerinin fotoğrafı. Belgelerdeki bilgileri şemaya göre çıkar.

Fotoğraftaki belge sayısı:
- Fotoğrafta yan yana ya da üst üste konmuş birden çok ayrı fiş veya fatura olabilir. Her ayrı belgeyi receipts dizisine ayrı öğe olarak yaz; soldan sağa, yukarıdan aşağı sırala.
- En çok ${MAX_RECEIPTS_PER_PHOTO} belge oku. count_in_photo fotoğraftaki toplam belge sayısıdır (${MAX_RECEIPTS_PER_PHOTO}'ten fazlaysa gerçek sayıyı yaz).
- Bir fişe eklenmiş kredi kartı slipi, aynı faturanın ikinci sayfası ya da arka yüzü ayrı belge değildir; o belgeyle tek öğe olur.
- Aynı alışverişin hem fişi (ya da bilgi fişi) hem faturası çekildiyse tek öğe yaz ve faturayı esas al.
- position: birden çok belge varsa belgenin fotoğraftaki yeri, kısa ve Türkçe (ör. "sol üst", "ortadaki", "sağdaki"). Tek belge varsa null.
- Fotoğrafta hiç harcama belgesi yoksa tek öğe yaz ve readable=false ver.
- complete: belge fotoğrafta bütün olarak görünüyorsa ve toplam tutarı okunabiliyorsa true. Fotoğrafın kenarından taşan, yarısı kesik, başka bir fişin altında kalmış ya da toplamı görünmeyen belge için false.
- Asıl çekilmek istenen belgeler fotoğrafın ortasındaki, bütün ve net olanlardır. Kenarda kalan yarım belgeleri count_in_photo'ya sayma; bütün belge varken onları receipts'e de yazma.
- Aynı belge iki kez görünüyorsa (yansıma, ikinci kopya, üst üste iki çekim) yalnızca en net olanını yaz.

Belge türü:
- e_fatura / e_arsiv: "e-Fatura", "e-Arşiv Fatura", ETTN veya karekod içeren fatura.
- okc_fis: yazar kasa (ÖKC) fişi; "Z NO", "EKÜ", "TOPKDV" gibi ifadeler.
- akaryakit_okc: akaryakıt istasyonu pompa fişi (plaka, litre).
- serbest_meslek: serbest meslek makbuzu (brüt ücret, stopaj).
- gider_pusulasi, bilet (uçak/otobüs/e-bilet), yurtdisi_fatura (Türkiye dışı fatura).
- dekont: banka dekontu, tek başına kredi kartı slipi, sipariş özeti, biniş kartı gibi vergisel belge olmayan kağıtlar.
- bilgi_fisi: yazar kasa ya da POS cihazından çıkan, "BİLGİ FİŞİ" başlıklı ya da "bu belge bilgi fişidir", "mali değeri yoktur", "e-Arşiv fatura ... e-posta ile gönderilecektir / gönderilmiştir" gibi ifadeler taşıyan kâğıt. Asıl belge e-Arşiv faturası ya da e-Faturadır; üzerinde fatura numarası, ETTN, alıcı unvanı ve VKN yazıyorsa ilgili alanlara yaz (doc_no = fatura numarası).

Alanlar:
- total: KDV dahil ödenecek genel toplam (TOPLAM, GENEL TOPLAM, ÖDENECEK). Ara toplamı veya KDV satırını alma.
- vat_lines: her KDV oranı için matrah (KDV hariç) ve KDV tutarı. Oran yüzde olarak (1, 10, 20).
- other_taxes: konaklama vergisi, ÖTV gibi KDV dışı vergiler.
- Türk sayı biçimi: "1.234,56" = 1234.56; "*45,00" = 45.
- date: YYYY-MM-DD; time: HH:MM.
- seller_vkn / buyer_vkn: yalnızca rakamlar (10 haneli VKN veya 11 haneli TCKN).
- plate: akaryakıt fişinde araç plakası (genellikle "PLAKA" satırında). Türk plakası biçiminde, boşluksuz büyük harf (ör. 35ABC123). Emin değilsen null.
- alcohol: fişte alkollü içki satırı var mı. Bira, şarap, rakı, viski, votka, cin, likör, tekila, kokteyl, şampanya ve bunların markaları (Efes, Tuborg, Bomonti, Yeni Rakı, Tekirdağ, Kavaklıdere, Sevilen, Chivas, Jack Daniel's, Absolut, Smirnoff vb.) alkollüdür. Alkolsüz bira, meyve suyu, soda, ayran, kahve ve çay alkollü değildir. present=true ise amount bu satırların KDV dahil toplamı, items satırların kısa adları (ör. "Efes 50 cl x2"). Satır tutarları okunamıyorsa amount=null. Alkol yoksa present=false, amount=null, items=[].
- confidence: her alan için 0 ile 1 arasında ne kadar emin olduğun.

Okunamayan alanı tahmin etme; null bırak ve güveni düşük ver. Görüntü bir harcama belgesi değilse readable=false.`;

export interface ImageInput {
  base64: string;
  media_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
}

export interface ClaudeCallResult {
  /** İlk belge (tek belgeli eski kullanım için) */
  fields: ReceiptFields;
  /** Fotoğraftaki belgeler (en çok MAX_RECEIPTS_PER_PHOTO) */
  receipts: ReceiptFields[];
  /** Fotoğraftaki toplam belge sayısı (okunmayanlar dahil) */
  count: number;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

type Fetch = typeof fetch;

export async function callClaude(
  apiKey: string,
  model: string,
  image: ImageInput,
  knownFromQr: Partial<ReceiptFields> | null,
  fetchImpl: Fetch = fetch,
): Promise<ClaudeCallResult> {
  const source = image.media_type === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: image.base64 } }
    : { type: "image", source: { type: "base64", media_type: image.media_type, data: image.base64 } };
  const known = knownFromQr
    ? `\n\nKarekoddan kesin olarak bilinen değerler (bunları değiştirme): ${JSON.stringify(knownFromQr)}`
    : "";

  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema: PHOTO_SCHEMA } },
      messages: [{ role: "user", content: [source, { type: "text", text: RECEIPT_PROMPT + known }] }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("Claude bu belgeyi okumayı reddetti");
  const text = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text;
  if (!text) throw new Error("Claude yanıtında metin yok");
  const parsed = JSON.parse(text) as { count_in_photo?: number; receipts?: ReceiptFields[] } & Partial<ReceiptFields>;
  // Eski tek belge biçimi de kabul edilir
  const receipts = Array.isArray(parsed.receipts) ? parsed.receipts : [parsed as ReceiptFields];
  const all = receipts.length ? receipts : [emptyFields()];
  const kept = pickComplete(all);
  const list = kept.slice(0, MAX_RECEIPTS_PER_PHOTO);
  // Ayıklanan yarım fişler toplam sayıya katılmaz
  const count = Math.max(list.length, (Number(parsed.count_in_photo) || list.length) - (all.length - kept.length));
  return { fields: list[0], receipts: list, count, usage: data.usage };
}

/**
 * Kenardaki yarım fişleri ayıklar: bütün belge varsa yalnızca bütünler kalır.
 * Hepsi yarımsa en çok okunabilen tek belge kalır (kullanıcı eksikleri tamamlar).
 */
export function pickComplete(list: (ReceiptFields & { complete?: boolean })[]): ReceiptFields[] {
  const whole = list.filter((r) => r.complete !== false);
  if (whole.length) return whole;
  const score = (r: ReceiptFields) => (r.total != null ? 2 : 0) + (r.date ? 1 : 0) + (r.seller_name ? 1 : 0) + (r.confidence?.total ?? 0);
  return [list.slice().sort((a, b) => score(b) - score(a))[0]];
}

/** Okunamayan fotoğraf için boş alanlar */
export function emptyFields(): ReceiptFields {
  return {
    readable: false, doc_type: "unknown", seller_name: null, seller_vkn: null, buyer_name: null, buyer_vkn: null,
    date: null, time: null, doc_no: null, ettn: null, z_no: null, plate: null, currency: "TRY", total: null,
    vat_lines: [], other_taxes: [], confidence: { total: 0, date: 0, doc_no: 0, vat: 0 },
    alcohol: { present: false, amount: null, items: [] },
  };
}

/** Karekod tek bir belgeye aittir: tek belge varsa ona, çok belgede ETTN ya da toplamı tutana uygulanır. */
export function applyQr(receipts: ReceiptFields[], qr: Partial<ReceiptFields> | null): ReceiptFields[] {
  if (!qr) return receipts;
  if (receipts.length === 1) return [mergeQr(receipts[0], qr)];
  const i = receipts.findIndex((r) =>
    (qr.ettn && r.ettn && r.ettn.toLowerCase() === String(qr.ettn).toLowerCase()) ||
    (qr.total != null && r.total != null && Math.abs(r.total - qr.total) <= 0.05)
  );
  return receipts.map((r, k) => (k === i ? mergeQr(r, qr) : r));
}

/**
 * Güçlü modele gitmeyi gerektirmeyen sorunlar (kullanıcı ekranda zaten kontrol eder).
 * Maliyet: güçlü model 20 kat pahalı ve fotoğrafın tamamını yeniden okur. Geçersiz VKN'yi kullanıcı
 * kontrol ekranında görür, vergi kuralı da ayrıca uyarır; bunun için ikinci okuma yapılmaz.
 */
const SOFT_ISSUES = new Set(["düşük güven", "satıcı VKN geçersiz"]);

/** Önce hızlı model; sonuç tutarsızsa güçlü model. Karekod alanları her zaman önceliklidir. */
export async function readPhoto(
  apiKey: string,
  image: ImageInput,
  qr: Partial<ReceiptFields> | null,
  allowedRates: number[],
  fetchImpl: Fetch = fetch,
) {
  const attempts: { model: string; ok: boolean; issues: string[]; usage?: ClaudeCallResult["usage"] }[] = [];
  let best: ReceiptFields[] | null = null;
  let bestCount = 1;
  let bestModel = MODELS.fast;
  let bestHard = Infinity;
  for (const model of [MODELS.fast, MODELS.strong]) {
    const r = await callClaude(apiKey, model, image, qr, fetchImpl);
    const receipts = applyQr(r.receipts, qr);
    const issues = receipts.flatMap((f, i) =>
      consistencyIssues(f, allowedRates).map((x) => (receipts.length > 1 ? `${i + 1}. fiş: ${x}` : x))
    );
    const hard = issues.filter((i) => !SOFT_ISSUES.has(i.replace(/^\d+\. fiş: /, ""))).length;
    attempts.push({ model, ok: issues.length === 0, issues, usage: r.usage });
    // Güçlü model ancak daha az sorunlu sonuç verirse kullanılır
    if (hard < bestHard) {
      best = receipts;
      bestCount = r.count;
      bestModel = model;
      bestHard = hard;
    }
    // Hız için: yalnızca "düşük güven" gibi yumuşak sorunlarda güçlü modele gidilmez
    if (hard === 0) break;
  }
  return { receipts: best!, count: Math.max(bestCount, best!.length), model: bestModel, attempts };
}

/** Tek belgeli kullanım: fotoğraftaki ilk belge */
export async function readReceipt(
  apiKey: string,
  image: ImageInput,
  qr: Partial<ReceiptFields> | null,
  allowedRates: number[],
  fetchImpl: Fetch = fetch,
) {
  const r = await readPhoto(apiKey, image, qr, allowedRates, fetchImpl);
  return { fields: r.receipts[0], model: r.model, attempts: r.attempts };
}
