// Claude ile fiş görüntüsünü okuma. Yapılandırılmış çıktı (output_config.format, JSON şema) kullanılır;
// zorlanmış tool_choice Sonnet 5.5'te 400 verdiği için kullanılmaz.
// Strateji: önce Haiku (hızlı, ucuz); tutarsız veya düşük güvenli sonuçta bir kez Sonnet.

import type { ReceiptFields } from "./types.ts";
import { consistencyIssues, mergeQr } from "./validate.ts";

export const MODELS = {
  fast: "claude-haiku-5-5",
  strong: "claude-sonnet-5-5",
};

const nullable = (type: string) => ({ type: [type, "null"] });

export const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readable", "doc_type", "seller_name", "seller_vkn", "buyer_name", "buyer_vkn", "date", "time",
    "doc_no", "ettn", "z_no", "plate", "currency", "total", "vat_lines", "other_taxes", "confidence"],
  properties: {
    readable: { type: "boolean" },
    doc_type: {
      type: "string",
      enum: ["e_fatura", "e_arsiv", "okc_fis", "akaryakit_okc", "serbest_meslek", "gider_pusulasi",
        "bilet", "yurtdisi_fatura", "dekont", "unknown"],
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
    confidence: {
      type: "object", additionalProperties: false, required: ["total", "date", "doc_no", "vat"],
      properties: {
        total: { type: "number" }, date: { type: "number" }, doc_no: { type: "number" }, vat: { type: "number" },
      },
    },
  },
};

export const RECEIPT_PROMPT = `Bu görüntü Türkiye'de alınmış bir harcama belgesi. Belgedeki bilgileri şemaya göre çıkar.

Belge türü:
- e_fatura / e_arsiv: "e-Fatura", "e-Arşiv Fatura", ETTN veya karekod içeren fatura.
- okc_fis: yazar kasa (ÖKC) fişi; "Z NO", "EKÜ", "TOPKDV" gibi ifadeler.
- akaryakit_okc: akaryakıt istasyonu pompa fişi (plaka, litre).
- serbest_meslek: serbest meslek makbuzu (brüt ücret, stopaj).
- gider_pusulasi, bilet (uçak/otobüs/e-bilet), yurtdisi_fatura (Türkiye dışı fatura).
- dekont: banka dekontu, kredi kartı slipi, sipariş özeti, biniş kartı gibi vergisel belge olmayan kağıtlar.

Alanlar:
- total: KDV dahil ödenecek genel toplam (TOPLAM, GENEL TOPLAM, ÖDENECEK). Ara toplamı veya KDV satırını alma.
- vat_lines: her KDV oranı için matrah (KDV hariç) ve KDV tutarı. Oran yüzde olarak (1, 10, 20).
- other_taxes: konaklama vergisi, ÖTV gibi KDV dışı vergiler.
- Türk sayı biçimi: "1.234,56" = 1234.56; "*45,00" = 45.
- date: YYYY-MM-DD; time: HH:MM.
- seller_vkn / buyer_vkn: yalnızca rakamlar (10 haneli VKN veya 11 haneli TCKN).
- plate: akaryakıt fişinde araç plakası, boşluksuz büyük harf.
- confidence: her alan için 0 ile 1 arasında ne kadar emin olduğun.

Okunamayan alanı tahmin etme; null bırak ve güveni düşük ver. Görüntü bir harcama belgesi değilse readable=false.`;

export interface ImageInput {
  base64: string;
  media_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
}

export interface ClaudeCallResult {
  fields: ReceiptFields;
  usage: { input_tokens: number; output_tokens: number };
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
      output_config: { effort: "low", format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
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
  return { fields: JSON.parse(text) as ReceiptFields, usage: data.usage };
}

/** Güçlü modele gitmeyi gerektirmeyen sorunlar (kullanıcı ekranda zaten kontrol eder). */
const SOFT_ISSUES = new Set(["düşük güven"]);

/** Önce hızlı model; sonuç tutarsızsa güçlü model. Karekod alanları her zaman önceliklidir. */
export async function readReceipt(
  apiKey: string,
  image: ImageInput,
  qr: Partial<ReceiptFields> | null,
  allowedRates: number[],
  fetchImpl: Fetch = fetch,
) {
  const attempts: { model: string; ok: boolean; issues: string[]; usage?: ClaudeCallResult["usage"] }[] = [];
  let best: ReceiptFields | null = null;
  let bestModel = MODELS.fast;
  let bestIssues = Infinity;
  for (const model of [MODELS.fast, MODELS.strong]) {
    const r = await callClaude(apiKey, model, image, qr, fetchImpl);
    const fields = mergeQr(r.fields, qr);
    const issues = consistencyIssues(fields, allowedRates);
    attempts.push({ model, ok: issues.length === 0, issues, usage: r.usage });
    // Güçlü model ancak daha az sorunlu sonuç verirse kullanılır
    if (issues.length < bestIssues) {
      best = fields;
      bestModel = model;
      bestIssues = issues.length;
    }
    // Hız için: yalnızca "düşük güven" gibi yumuşak sorunlarda güçlü modele gidilmez
    if (issues.every((i) => SOFT_ISSUES.has(i))) break;
  }
  return { fields: best!, model: bestModel, attempts };
}
