// read-receipt: bir masrafın fiş görselini okur, vergi kurallarından geçirir ve sonucu kaydeder.
//
// İstek:  POST { expense_id: uuid, qr_payload?: string, recheck?: boolean }  (Authorization: Bearer <kullanıcı oturumu>)
// Yanıt:  { fields, flags, model, attempts }
// recheck: fiş yeniden okunmaz; kullanıcının kaydettiği bilgilerle vergi kontrolü tekrarlanır
// (kategori, katılımcı veya tutar değişince uyarılar güncellensin diye).
//
// Güvenlik: kullanıcının masrafı düzenleme yetkisi kendi oturumuyla (RLS) kontrol edilir; yazma işlemleri
// ardından sunucu anahtarıyla yapılır. ANTHROPIC_API_KEY yalnızca bu fonksiyonun gizli ayarlarında durur.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { parseGibQr } from "../_shared/receipt/qr.ts";
import { readReceipt, type ImageInput } from "../_shared/receipt/claude.ts";
import { evaluateTaxRules } from "../_shared/receipt/tax-rules.ts";
import type { ReceiptFields } from "../_shared/receipt/types.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

// deno-lint-ignore no-explicit-any
async function loadParams(admin: SupabaseClient<any, any, any>, year: number) {
  const { data } = await admin.from("tax_parameters").select("key, value").eq("year", year);
  return Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Yalnızca POST" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(500, { error: "Fiş okuma yapılandırılmamış (ANTHROPIC_API_KEY eksik)." });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Oturum gerekli." });

  let body: { expense_id?: string; qr_payload?: string; recheck?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Geçersiz istek gövdesi." });
  }
  if (!body.expense_id || !UUID.test(body.expense_id)) return json(400, { error: "expense_id gerekli." });

  // 1. Kullanıcının kendi oturumuyla erişim kontrolü (RLS)
  const user = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: exp, error: expErr } = await user
    .from("expenses")
    .select(
      "id, company_id, report_id, created_by, total, image_path, image_sha256, category_id, attendees, doc_type, seller_name, seller_vkn, buyer_vkn, doc_date, doc_no, ettn, plate, currency, read_total",
    )
    .eq("id", body.expense_id)
    .maybeSingle();
  if (expErr || !exp) return json(404, { error: "Masraf bulunamadı." });
  const { data: canEdit } = await user.rpc("can_edit_expense", { p_expense: exp.id });
  if (!canEdit) return json(403, { error: "Bu masrafı düzenleme yetkiniz yok." });
  const admin = createClient(url, serviceKey);

  if (body.recheck) return await recheck(admin, exp);

  if (!exp.image_path) return json(400, { error: "Masrafa bağlı fiş görseli yok." });

  // 2. Görsel
  const { data: blob, error: dlErr } = await admin.storage.from("receipts").download(exp.image_path);
  if (dlErr || !blob) return json(404, { error: "Fiş görseli bulunamadı." });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mediaType = (blob.type || "image/jpeg") as ImageInput["media_type"];
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mediaType)) {
    return json(415, { error: "Desteklenmeyen dosya türü. JPEG, PNG, WEBP veya PDF yükleyin." });
  }
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  // 3. Okuma: karekod (istemci çözdüyse) + Claude
  const qr = body.qr_payload ? parseGibQr(body.qr_payload) : null;
  const thisYear = new Date().getUTCFullYear();
  const currentParams = await loadParams(admin, thisYear);
  const allowedRates = [0, ...((currentParams["vat_rates"] as number[] | undefined) ?? [1, 10, 20])];

  let read;
  try {
    read = await readReceipt(apiKey, { base64: toBase64(bytes), media_type: mediaType }, qr, allowedRates);
  } catch (e) {
    console.error("read-receipt claude error", e);
    return json(502, { error: "Fiş şu anda okunamadı. Tutarı elle girebilir veya biraz sonra tekrar deneyebilirsiniz." });
  }
  const f: ReceiptFields = read.fields;

  // 4. Vergi kontrolü
  const enteredTotal = Number(exp.total) > 0 ? Number(exp.total) : null;
  const flags = await evaluate(admin, exp, f, sha, f.total);

  // 5. Kayıt
  const { error: upErr } = await admin.from("expenses").update({
    doc_type: f.doc_type,
    seller_name: f.seller_name,
    seller_vkn: f.seller_vkn,
    buyer_vkn: f.buyer_vkn,
    doc_date: f.date,
    doc_no: f.doc_no,
    ettn: f.ettn && UUID.test(f.ettn) ? f.ettn : null,
    plate: f.plate,
    currency: f.currency || "TRY",
    read_total: f.total,
    read_source: qr?.total != null ? "qr" : "ai",
    image_sha256: sha,
    ...(enteredTotal === null && f.total != null ? { total: f.total } : {}),
  }).eq("id", exp.id);
  if (upErr) {
    console.error("read-receipt update error", upErr);
    return json(500, { error: "Okunan bilgiler kaydedilemedi." });
  }

  await admin.from("expense_vat_lines").delete().eq("expense_id", exp.id);
  if (f.vat_lines.length) {
    await admin.from("expense_vat_lines").insert(
      f.vat_lines.map((l) => ({ expense_id: exp.id, company_id: exp.company_id, rate: l.rate, base: l.base, vat: l.vat })),
    );
  }
  await replaceFlags(admin, exp, flags);

  return json(200, {
    fields: f,
    flags,
    model: read.model,
    attempts: read.attempts.map((a) => ({ model: a.model, ok: a.ok, issues: a.issues })),
  });
});

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

// deno-lint-ignore no-explicit-any
async function recheck(admin: SupabaseClient<any, any, any>, exp: Row): Promise<Response> {
  const { data: lines } = await admin.from("expense_vat_lines").select("rate, base, vat").eq("expense_id", exp.id);
  const f: ReceiptFields = {
    readable: true,
    doc_type: exp.doc_type,
    seller_name: exp.seller_name,
    seller_vkn: exp.seller_vkn,
    buyer_name: null,
    buyer_vkn: exp.buyer_vkn,
    date: exp.doc_date,
    time: null,
    doc_no: exp.doc_no,
    ettn: exp.ettn,
    z_no: null,
    plate: exp.plate,
    currency: exp.currency || "TRY",
    total: Number(exp.total) > 0 ? Number(exp.total) : null,
    vat_lines: (lines ?? []).map((l: Row) => ({ rate: Number(l.rate), base: Number(l.base), vat: Number(l.vat) })),
    other_taxes: [],
    confidence: { total: 1, date: 1, doc_no: 1, vat: 1 },
  };
  const flags = await evaluate(admin, exp, f, exp.image_sha256, exp.read_total == null ? null : Number(exp.read_total));
  await replaceFlags(admin, exp, flags);
  return json(200, { fields: f, flags, model: null, attempts: [] });
}

/** Şirket, kategori, yıl parametreleri, mükerrer ve aynı gün fişleriyle vergi kurallarını çalıştırır. */
async function evaluate(
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any, any, any>,
  exp: Row,
  f: ReceiptFields,
  sha: string | null,
  readTotal: number | null,
) {
  const thisYear = new Date().getUTCFullYear();
  const { data: company } = await admin.from("companies")
    .select("tax_number, car_kkeg_vat_deductible, okc_vat_policy").eq("id", exp.company_id).single();
  const { data: category } = exp.category_id
    ? await admin.from("categories").select("tax_rule, attendees_required").eq("id", exp.category_id).single()
    : { data: null };
  const docYear = f.date ? Number(f.date.slice(0, 4)) : thisYear;
  const params = await loadParams(admin, docYear);

  const dupConds: string[] = [];
  if (sha) dupConds.push(`image_sha256.eq.${sha}`);
  if (f.ettn && UUID.test(f.ettn)) dupConds.push(`ettn.eq.${f.ettn}`);
  if (f.seller_vkn && f.doc_no) dupConds.push(`and(seller_vkn.eq.${f.seller_vkn},doc_no.eq.${encodeURIComponent(f.doc_no)})`);
  const { data: dups } = dupConds.length
    ? await admin.from("expenses").select("id").eq("company_id", exp.company_id).neq("id", exp.id).or(dupConds.join(","))
    : { data: [] };

  let sameDay = 0;
  if (f.seller_vkn && f.date) {
    const { data: rows } = await admin.from("expenses").select("total")
      .eq("company_id", exp.company_id).eq("created_by", exp.created_by)
      .eq("seller_vkn", f.seller_vkn).eq("doc_date", f.date).neq("id", exp.id);
    sameDay = (rows ?? []).reduce((a: number, r: { total: number }) => a + Number(r.total), 0);
  }

  const enteredTotal = Number(exp.total) > 0 ? Number(exp.total) : null;
  return evaluateTaxRules({
    fields: f,
    entered_total: enteredTotal ?? f.total,
    read_total: readTotal,
    company_tax_number: company!.tax_number,
    company: { car_kkeg_vat_deductible: company!.car_kkeg_vat_deductible, okc_vat_policy: company!.okc_vat_policy },
    category,
    attendees: exp.attendees ?? [],
    params,
    same_day_same_seller_total: sameDay,
    duplicate_of: (dups ?? []).map((d: { id: string }) => d.id),
    today: new Date().toISOString().slice(0, 10),
  });
}

async function replaceFlags(
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any, any, any>,
  exp: Row,
  flags: ReturnType<typeof evaluateTaxRules>,
) {
  await admin.from("expense_flags").delete().eq("expense_id", exp.id);
  if (flags.length) {
    await admin.from("expense_flags").insert(
      flags.map((fl) => ({ expense_id: exp.id, company_id: exp.company_id, ...fl })),
    );
  }
}
