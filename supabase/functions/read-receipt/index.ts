// read-receipt: bir masrafın fiş görselini okur, vergi kurallarından geçirir ve sonucu kaydeder.
//
// İstek:  POST { expense_id: uuid, qr_payload?: string, recheck?: boolean }  (Authorization: Bearer <kullanıcı oturumu>)
// Yanıt:  { fields, flags, model, attempts, parts, count, extra_ids }
// Fotoğrafta birden çok fiş varsa (en çok 5) ilk fiş bu masrafa yazılır, diğerleri aynı rapora aynı görselle
// ayrı masraf olarak eklenir (photo_part / photo_parts). Fotoğraftaki bir parçayı yeniden okurken yalnızca o fiş alınır.
// recheck: fiş yeniden okunmaz; kullanıcının kaydettiği bilgilerle vergi kontrolü tekrarlanır
// (kategori, katılımcı veya tutar değişince uyarılar güncellensin diye).
//
// Güvenlik: kullanıcının masrafı düzenleme yetkisi kendi oturumuyla (RLS) kontrol edilir; yazma işlemleri
// ardından sunucu anahtarıyla yapılır. ANTHROPIC_API_KEY yalnızca bu fonksiyonun gizli ayarlarında durur.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { parseGibQr } from "../_shared/receipt/qr.ts";
import { MAX_RECEIPTS_PER_PHOTO, readPhoto, type ImageInput } from "../_shared/receipt/claude.ts";
import { alcoholFlag, evaluateTaxRules } from "../_shared/receipt/tax-rules.ts";
import type { ReceiptFields, TaxContext } from "../_shared/receipt/types.ts";
import { normalizePlate } from "../_shared/receipt/validate.ts";

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
      "id, company_id, report_id, created_by, total, image_path, image_sha256, category_id, attendees, doc_type, seller_name, seller_vkn, buyer_vkn, doc_date, doc_no, ettn, plate, currency, read_total, alcohol_present, alcohol_amount, alcohol_items, alcohol_decision, alcohol_decided_by, payment_method, photo_part, photo_parts, einvoice_confirmed_at",
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
    read = await readPhoto(apiKey, { base64: toBase64(bytes), media_type: mediaType }, qr, allowedRates);
  } catch (e) {
    console.error("read-receipt claude error", e);
    return json(502, { error: "Fiş şu anda okunamadı. Tutarı elle girebilir veya biraz sonra tekrar deneyebilirsiniz." });
  }
  const qrUsed = qr?.total != null;

  // Fotoğraftaki bir parça yeniden okunuyorsa yalnızca o fiş alınır, yeni masraf açılmaz
  if (exp.photo_part && exp.photo_parts && exp.photo_parts > 1) {
    const f = read.receipts[exp.photo_part - 1] ?? read.receipts[0];
    const r = await store(admin, exp, f, sha, qrUsed, { part: exp.photo_part, parts: exp.photo_parts });
    if ("error" in r) return json(500, { error: r.error });
    return json(200, { fields: f, flags: r.flags, model: read.model, attempts: publicAttempts(read.attempts), parts: exp.photo_parts, count: exp.photo_parts, extra_ids: [] });
  }

  // Ek fişler yalnızca rapor hâlâ düzenlenebiliyorsa açılır
  let receipts = read.receipts;
  if (receipts.length > 1) {
    const { data: rep } = await admin.from("reports").select("status").eq("id", exp.report_id).single();
    if (!rep || !["draft", "returned"].includes(rep.status)) receipts = receipts.slice(0, 1);
  }
  const parts = receipts.length;
  const partInfo = (i: number) => (parts > 1 ? { part: i + 1, parts } : { part: null, parts: null });
  const overflow = read.count > MAX_RECEIPTS_PER_PHOTO && parts === MAX_RECEIPTS_PER_PHOTO
    ? {
      code: "multi_over_limit", severity: "warning" as const,
      message: `Fotoğrafta ${read.count} fiş var; ilk ${MAX_RECEIPTS_PER_PHOTO} fiş ayrı kayıt olarak okundu. Kalan fişleri ayrıca çekin.`,
    }
    : null;

  const first = await store(admin, exp, receipts[0], sha, qrUsed, partInfo(0), overflow);
  if ("error" in first) return json(500, { error: first.error });

  const extraIds: string[] = [];
  for (let i = 1; i < parts; i++) {
    const f = receipts[i];
    const { data: row, error: insErr } = await admin.from("expenses").insert({
      company_id: exp.company_id,
      report_id: exp.report_id,
      created_by: exp.created_by,
      image_path: exp.image_path,
      payment_method: exp.payment_method ?? "personal",
      total: f.total != null && f.total > 0 ? f.total : 0,
    }).select("id, company_id, report_id, created_by, total, image_path, category_id, attendees, payment_method, einvoice_confirmed_at").single();
    if (insErr || !row) {
      console.error("read-receipt extra insert error", insErr);
      continue;
    }
    // Yeni satırın tutarı fişten geldi; "kullanıcının girdiği tutar" sayılmasın
    const r = await store(admin, { ...row, total: 0 }, f, sha, false, partInfo(i));
    if (!("error" in r)) extraIds.push(row.id);
  }

  return json(200, {
    fields: receipts[0],
    flags: first.flags,
    model: read.model,
    attempts: publicAttempts(read.attempts),
    parts,
    count: read.count,
    extra_ids: extraIds,
  });
});

const publicAttempts = (a: { model: string; ok: boolean; issues: string[] }[]) =>
  a.map((x) => ({ model: x.model, ok: x.ok, issues: x.issues }));

/** Okunan bir fişi masrafa yazar, KDV satırlarını ve vergi uyarılarını yeniler. */
async function store(
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any, any, any>,
  exp: Row,
  f: ReceiptFields,
  sha: string,
  qrUsed: boolean,
  part: { part: number | null; parts: number | null },
  extraFlag: { code: string; severity: "info" | "warning" | "critical"; message: string } | null = null,
): Promise<{ flags: ReturnType<typeof evaluateTaxRules> } | { error: string }> {
  const enteredTotal = Number(exp.total) > 0 ? Number(exp.total) : null;
  const flags = await evaluate(admin, { ...exp, photo_part: part.part }, f, sha, f.total);

  const { error: upErr } = await admin.from("expenses").update({
    doc_type: f.doc_type,
    seller_name: f.seller_name,
    seller_vkn: f.seller_vkn,
    buyer_vkn: f.buyer_vkn,
    doc_date: f.date,
    doc_no: f.doc_no,
    ettn: f.ettn && UUID.test(f.ettn) ? f.ettn : null,
    plate: normalizePlate(f.plate) ?? f.plate,
    currency: f.currency || "TRY",
    read_total: f.total,
    read_source: qrUsed ? "qr" : "ai",
    image_sha256: sha,
    photo_part: part.part,
    photo_parts: part.parts,
    photo_position: part.parts ? (f.position ?? null)?.slice(0, 60) ?? null : null,
    // Alkol: yeniden okunursa önceki muhasebe kararı sıfırlanır; şirket kuralı veritabanında uygulanır
    alcohol_amount: f.alcohol?.present ? (f.alcohol.amount ?? null) : null,
    alcohol_items: f.alcohol?.present ? f.alcohol.items.slice(0, 20) : [],
    alcohol_present: !!f.alcohol?.present,
    alcohol_decision: null,
    alcohol_decided_by: null,
    alcohol_decided_at: null,
    ...(enteredTotal === null && f.total != null ? { total: f.total } : {}),
  }).eq("id", exp.id);
  if (upErr) {
    console.error("read-receipt update error", upErr);
    return { error: "Okunan bilgiler kaydedilemedi." };
  }

  await admin.from("expense_vat_lines").delete().eq("expense_id", exp.id);
  if (f.vat_lines.length) {
    await admin.from("expense_vat_lines").insert(
      f.vat_lines.map((l) => ({ expense_id: exp.id, company_id: exp.company_id, rate: l.rate, base: l.base, vat: l.vat })),
    );
  }
  // Alkol kararı (şirket kuralı) kayıttan sonra belli olur; uyarı ona göre yazılır
  let finalFlags = flags;
  if (f.alcohol?.present) {
    const { data: after } = await admin.from("expenses").select("alcohol_decision").eq("id", exp.id).single();
    const alc = alcoholFlag({ ...f.alcohol, decision: after?.alcohol_decision ?? null, auto: true });
    finalFlags = [...flags.filter((x) => x.code !== "alcohol" && x.code !== "alcohol_decided"), ...(alc ? [alc] : [])];
  }
  if (extraFlag) finalFlags = [...finalFlags, extraFlag];
  await replaceFlags(admin, exp, finalFlags);
  return { flags: finalFlags };
}

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
    // Alkol: karar (şirket kuralı ya da muhasebe) uyarının metnini belirler
    alcohol: exp.alcohol_present
      ? {
        present: true,
        amount: exp.alcohol_amount == null ? null : Number(exp.alcohol_amount),
        items: exp.alcohol_items ?? [],
        decision: exp.alcohol_decision ?? null,
        auto: !exp.alcohol_decided_by,
      }
      : undefined,
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
    ? await admin.from("categories").select("name, tax_rule, attendees_required, limit_amount, limit_period")
      .eq("id", exp.category_id).single()
    : { data: null };
  const docYear = f.date ? Number(f.date.slice(0, 4)) : thisYear;
  const params = await loadParams(admin, docYear);

  const dupConds: string[] = [];
  // Aynı görsel: çok fişli fotoğrafta yalnızca aynı sıradaki fiş mükerrer sayılır
  if (sha) {
    dupConds.push(exp.photo_part
      ? `and(image_sha256.eq.${sha},photo_part.eq.${exp.photo_part})`
      : `and(image_sha256.eq.${sha},or(photo_part.is.null,photo_part.eq.1))`);
  }
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

  // Masraf sahibinin (raporun sahibi) kişi kartındaki araç plakaları
  const { data: rep } = await admin.from("reports").select("owner_user_id").eq("id", exp.report_id).single();
  const { data: owner } = rep
    ? await admin.from("memberships").select("vehicle_plates")
      .eq("company_id", exp.company_id).eq("user_id", rep.owner_user_id).maybeSingle()
    : { data: null };

  // Gider grubu sınırı: aynı kişinin aynı dönemde bu gruptaki diğer harcamaları
  let limit: TaxContext["limit"] = null;
  if (category?.limit_amount && category.limit_period && rep) {
    const { start, end } = periodBounds(category.limit_period, f.date ?? new Date().toISOString().slice(0, 10));
    const { data: others } = await admin.from("expenses")
      .select("total, doc_date, created_at, reports!inner(owner_user_id, company_id)")
      .eq("category_id", exp.category_id).neq("id", exp.id)
      .eq("reports.owner_user_id", rep.owner_user_id).eq("reports.company_id", exp.company_id);
    const usedOther = (others ?? [])
      .filter((o: Row) => {
        const d = (o.doc_date ?? String(o.created_at).slice(0, 10)) as string;
        return d >= start && d <= end;
      })
      .reduce((a: number, o: Row) => a + Number(o.total), 0);
    limit = { category: category.name, amount: Number(category.limit_amount), period: category.limit_period, used_other: usedOther };
  }

  const enteredTotal = Number(exp.total) > 0 ? Number(exp.total) : null;
  return evaluateTaxRules({
    limit,
    owner_plates: owner ? (owner.vehicle_plates ?? []) : null,
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
    einvoice_confirmed: !!exp.einvoice_confirmed_at,
    has_image: !!exp.image_path,
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

/** Takvim dönemi: ay, çeyrek, yarıyıl veya yıl (veritabanındaki private.period_bounds ile aynı) */
function periodBounds(period: string, on: string): { start: string; end: string } {
  const [y, m] = on.slice(0, 7).split("-").map(Number);
  const startMonth = period === "month" ? m : period === "quarter" ? Math.floor((m - 1) / 3) * 3 + 1
    : period === "half" ? (m <= 6 ? 1 : 7) : 1;
  const len = period === "month" ? 1 : period === "quarter" ? 3 : period === "half" ? 6 : 12;
  const start = new Date(Date.UTC(y, startMonth - 1, 1));
  const end = new Date(Date.UTC(y, startMonth - 1 + len, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
