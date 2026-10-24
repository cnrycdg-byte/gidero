// Node ile çalışır: node --test supabase/functions/_shared/receipt/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGibQr } from "../qr.ts";
import { consistencyIssues, isValidTckn, isValidVkn, mergeQr, normalizePlate } from "../validate.ts";
import { evaluateTaxRules } from "../tax-rules.ts";
import { readReceipt } from "../claude.ts";
import type { ReceiptFields, TaxContext } from "../types.ts";

// Geçerli VKN üretici (test için)
function makeVkn(first9: string): string {
  const d = first9.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const t = (d[i] + 9 - i) % 10;
    let v = (t * 2 ** (9 - i)) % 9;
    if (t !== 0 && v === 0) v = 9;
    sum += v;
  }
  return first9 + ((10 - (sum % 10)) % 10);
}
const COMPANY_VKN = makeVkn("123456789");
const SELLER_VKN = makeVkn("987654321");

const base = (over: Partial<ReceiptFields> = {}): ReceiptFields => ({
  readable: true, doc_type: "e_arsiv", seller_name: "Lokanta", seller_vkn: SELLER_VKN,
  buyer_name: "A Ltd", buyer_vkn: COMPANY_VKN, date: "2026-10-20", time: "13:10", doc_no: "GIB2026000000123",
  ettn: null, z_no: null, plate: null, currency: "TRY", total: 1100,
  vat_lines: [{ rate: 10, base: 1000, vat: 100 }], other_taxes: [],
  confidence: { total: 0.95, date: 0.95, doc_no: 0.9, vat: 0.9 }, ...over,
});

const ctx = (over: Partial<TaxContext> = {}): TaxContext => ({
  fields: base(), entered_total: 1100, read_total: 1100, company_tax_number: COMPANY_VKN,
  company: { car_kkeg_vat_deductible: false, okc_vat_policy: "cautious" },
  category: { tax_rule: "standard", attendees_required: false }, attendees: [],
  params: { invoice_limit_incl_vat: 12000, vat_rates: [1, 10, 20], car_running_cost_ratio: 0.7 },
  same_day_same_seller_total: 0, duplicate_of: [], today: "2026-10-24", ...over,
});
const codes = (c: TaxContext) => evaluateTaxRules(c).map((f) => f.code);

test("VKN ve TCKN kontrol basamağı", () => {
  assert.equal(isValidVkn(COMPANY_VKN), true);
  assert.equal(isValidVkn(COMPANY_VKN.slice(0, 9) + ((Number(COMPANY_VKN[9]) + 1) % 10)), false);
  assert.equal(isValidTckn("10000000146"), true);
  assert.equal(isValidTckn("10000000147"), false);
});

test("GİB karekodu çözülür, çoklu KDV oranı ayrılır", () => {
  const raw = JSON.stringify({
    vkntckn: SELLER_VKN, avkntckn: COMPANY_VKN, senaryo: "EARSIVFATURA", tip: "SATIS", tarih: "2026-10-20",
    no: "ABC2026000000001", ettn: "3fa85f64-5717-4562-b3fc-2c963f66afa6", parabirimi: "TRY",
    malhizmettoplam: "1500.00", "kdvmatrah(10)": "1000.00", "hesaplanankdv(10)": "100.00",
    "kdvmatrah(20)": "500.00", "hesaplanankdv(20)": "100.00", vergidahil: "1700.00", odenecek: "1700.00",
  });
  const q = parseGibQr(raw)!;
  assert.equal(q.doc_type, "e_arsiv");
  assert.equal(q.total, 1700);
  assert.deepEqual(q.vat_lines, [{ rate: 10, base: 1000, vat: 100 }, { rate: 20, base: 500, vat: 100 }]);
  assert.equal(parseGibQr("https://example.com"), null);
});

test("tutarlılık: tutmayan KDV ve toplam yakalanır", () => {
  assert.deepEqual(consistencyIssues(base()), []);
  assert.ok(consistencyIssues(base({ vat_lines: [{ rate: 10, base: 1000, vat: 180 }] })).length > 0);
  assert.ok(consistencyIssues(base({ total: 1500 })).includes("matrah + KDV toplamı tutmuyor"));
  assert.ok(consistencyIssues(base({ vat_lines: [{ rate: 18, base: 1000, vat: 180 }], total: 1180 }))
    .some((i) => i.includes("geçersiz KDV oranı")));
});

test("karekod alanları yapay zekâ sonucunun önüne geçer", () => {
  const m = mergeQr(base({ total: 1000, confidence: { total: 0.4, date: 0.9, doc_no: 0.9, vat: 0.9 } }), { total: 1100 });
  assert.equal(m.total, 1100);
  assert.equal(m.confidence.total, 1);
});

test("temiz e-Arşiv fatura uyarı üretmez", () => {
  assert.deepEqual(codes(ctx()), []);
});

test("çalışan adına kesilmiş fatura", () => {
  assert.ok(codes(ctx({ fields: base({ buyer_vkn: "10000000146" }) })).includes("invoice_to_person"));
});

test("yazar kasa fişi fatura sınırı ve bölünmüş fiş", () => {
  const okc = base({ doc_type: "okc_fis", buyer_vkn: null, total: 12500, vat_lines: [] });
  assert.ok(codes(ctx({ fields: okc, entered_total: 12500 })).includes("over_invoice_limit"));
  assert.ok(!codes(ctx({ fields: { ...okc, total: 12000 }, entered_total: 12000 })).includes("over_invoice_limit"));
  assert.ok(codes(ctx({ fields: { ...okc, total: 7000 }, entered_total: 7000, same_day_same_seller_total: 6000 }))
    .includes("split_receipts"));
});

test("akaryakıt pompa fişi fatura sınırına takılmaz, plakasız ise uyarı", () => {
  const fuel = base({ doc_type: "akaryakit_okc", buyer_vkn: null, total: 15000, vat_lines: [], plate: null });
  const c = codes(ctx({ fields: fuel, entered_total: 15000, category: { tax_rule: "fuel", attendees_required: false } }));
  assert.ok(!c.includes("over_invoice_limit"));
  assert.ok(c.includes("fuel_plate_missing"));
  assert.ok(c.includes("car_expense_split"));
});

test("yemek yazar kasa fişiyle: KDV indirilemez, katılımcı zorunlu", () => {
  const c = codes(ctx({ fields: base({ doc_type: "okc_fis", buyer_vkn: null }), category: { tax_rule: "meal", attendees_required: false } }));
  assert.ok(c.includes("okc_vat_not_deductible"));
  assert.ok(c.includes("attendees_missing"));
});

test("dekont, mükerrer, kilometre, tutar farkı, KDV süresi", () => {
  assert.ok(codes(ctx({ fields: base({ doc_type: "dekont" }) })).includes("not_tax_document"));
  assert.ok(codes(ctx({ duplicate_of: ["x"] })).includes("duplicate"));
  assert.ok(codes(ctx({ category: { tax_rule: "mileage", attendees_required: false } })).includes("payroll_mileage"));
  assert.ok(codes(ctx({ entered_total: 1250 })).includes("amount_mismatch"));
  assert.ok(codes(ctx({ fields: base({ date: "2024-06-01" }) })).includes("vat_deadline_passed"));
  assert.ok(!codes(ctx({ fields: base({ date: "2025-06-01" }) })).includes("vat_deadline_passed"));
});

test("Claude: hızlı model tutarlıysa güçlü modele gidilmez; tutarsızsa gidilir", async () => {
  const calls: string[] = [];
  const fakeFetch = (results: ReceiptFields[]) => (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    calls.push(body.model);
    assert.equal(body.output_config.format.type, "json_schema");
    const fields = results[calls.length - 1];
    return new Response(JSON.stringify({
      stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(fields) }],
      usage: { input_tokens: 1500, output_tokens: 200 },
    }), { status: 200 });
  }) as unknown as typeof fetch;

  const img = { base64: "AAAA", media_type: "image/jpeg" as const };
  let r = await readReceipt("k", img, null, [1, 10, 20], fakeFetch([base()]));
  assert.deepEqual(calls, ["claude-haiku-5-5"]);
  assert.equal(r.model, "claude-haiku-5-5");

  calls.length = 0;
  r = await readReceipt("k", img, null, [1, 10, 20], fakeFetch([base({ total: 999 }), base()]));
  assert.deepEqual(calls, ["claude-haiku-5-5", "claude-sonnet-5-5"]);
  assert.equal(r.fields.total, 1100);
});

test("plaka: sadeleştirme ve kişi kartıyla eşleşme", () => {
  assert.equal(normalizePlate("35 abc 123"), "35ABC123");
  assert.equal(normalizePlate("34-ŞK-45"), "34SK45");
  assert.equal(normalizePlate("ABC"), null);
  const fuel = (plate: string | null) => base({ doc_type: "akaryakit_okc", buyer_vkn: null, total: 2000, vat_lines: [], plate });
  const cat = { tax_rule: "fuel" as const, attendees_required: false };
  // Kartla eşleşiyor
  assert.ok(!codes(ctx({ fields: fuel("35ABC123"), entered_total: 2000, category: cat, owner_plates: ["35 ABC 123"] }))
    .some((c) => c.startsWith("plate_")));
  // Eşleşmiyor
  assert.ok(codes(ctx({ fields: fuel("06XYZ99"), entered_total: 2000, category: cat, owner_plates: ["35ABC123"] }))
    .includes("plate_mismatch"));
  // Kartta araç yok
  assert.ok(codes(ctx({ fields: fuel("06XYZ99"), entered_total: 2000, category: cat, owner_plates: [] }))
    .includes("plate_not_registered"));
  // Geçersiz plaka okunduysa
  assert.ok(codes(ctx({ fields: fuel("XX"), entered_total: 2000, category: cat, owner_plates: [] })).includes("fuel_plate_missing"));
});
