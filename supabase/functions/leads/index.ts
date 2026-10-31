// leads: Gidero yöneticisinin müşteri bulma ve e-posta gönderim işleri.
//
// POST (Authorization: Bearer <yönetici oturumu>)
//   { action: 'find', source: 'maps'|'web', kind: 'bureau'|'company', what, city, count }
//      → { candidates, cost_usd }   Firmalar KAYDEDİLMEZ; yönetici seçip admin_upsert_leads ile ekler.
//   { action: 'send', ids: number[] } → { sent, failed, skipped, left_today }
//      Yalnızca yöneticinin onaylayıp seçtiği, zamanı gelmiş taslaklar gönderilir.
//
// Gizli ayarlar: GOOGLE_PLACES_API_KEY (Haritalar), ANTHROPIC_API_KEY (web araması),
// RESEND_API_KEY + OUTREACH_FROM (örn. "Caner Yücedağ <caner@gidero.com.tr>"), isteğe bağlı OUTREACH_REPLY_TO.
// Her gönderimde ret listesi ve günlük sınır yeniden kontrol edilir.

import { clients, cors, json } from "../_shared/auth/clients.ts";
import { logUsage } from "../_shared/ai-usage.ts";
import {
  type Candidate, estimateUsd, findEmailOnSite, LEAD_MODEL, MAPS_USD_PER_REQUEST, parseWebCandidates, placeToCandidate,
  renderOutreach, searchPlaces, searchWeb, type Sender, sendViaResend, WEB_PROMPT,
} from "../_shared/leads/lib.ts";

const KIND_WORDS: Record<string, string> = { bureau: "mali müşavir ve muhasebe bürosu", company: "şirket" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Yalnızca POST" });
  const { admin, asCaller } = clients(req);

  const { data: ws } = await asCaller.rpc("my_workspace");
  if (!(ws as { platform_admin?: boolean } | null)?.platform_admin) {
    return json(403, { error: "Bu işlem yalnızca Gidero yöneticisine açıktır." });
  }
  const { data: who } = await asCaller.auth.getUser();

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return json(400, { error: "İstek okunamadı." });
  }

  try {
    if (b.action === "find") return await find(b, admin, who?.user?.id ?? null);
    if (b.action === "send") return await send(b, admin);
    return json(400, { error: "Bilinmeyen işlem." });
  } catch (e) {
    console.error("leads", e);
    return json(500, { error: e instanceof Error ? e.message.slice(0, 300) : "İşlem tamamlanamadı." });
  }
});

// deno-lint-ignore no-explicit-any
type Admin = any;

async function find(b: Record<string, unknown>, admin: Admin, userId: string | null) {
  const source = b.source === "web" ? "web" : "maps";
  const kind = b.kind === "company" ? "company" : "bureau";
  const city = String(b.city ?? "").trim().slice(0, 60);
  const what = String(b.what ?? "").trim().slice(0, 80) || KIND_WORDS[kind];
  const count = Math.min(Math.max(Number(b.count) || 20, 5), 60);
  if (!city) return json(400, { error: "Şehir yazın." });
  const sector = kind === "company" && b.what ? what : null;

  let list: Candidate[] = [];
  let cost = 0;
  if (source === "maps") {
    const key = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!key) return json(400, { error: "Google Haritalar anahtarı tanımlı değil. Supabase > Edge Functions > Secrets bölümüne GOOGLE_PLACES_API_KEY ekleyin." });
    const { places, requests } = await searchPlaces(key, `${what} ${city}`, count);
    cost = requests * MAPS_USD_PER_REQUEST;
    list = places.map((p) => placeToCandidate(p, kind, sector)).filter((c): c is Candidate => !!c);
    // E-posta Haritalar'da yok: firmanın web sitesinden okunur (ücretsiz), 6'şar paralel
    for (let i = 0; i < list.length; i += 6) {
      await Promise.all(list.slice(i, i + 6).map(async (c) => {
        if (c.website) c.email = await findEmailOnSite(c.website);
      }));
    }
  } else {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json(400, { error: "Yapay zekâ anahtarı tanımlı değil." });
    const r = await searchWeb(key, WEB_PROMPT(what, city, Math.min(count, 25)));
    await logUsage(admin, [{ feature: "lead_search", model: LEAD_MODEL, usage: r.usage, user_id: userId, web_searches: r.searches }]);
    cost = r.searches * 0.01 + (r.usage.input_tokens * 0.1 + r.usage.output_tokens * 0.5) / 1e6;
    list = parseWebCandidates(r.text, kind, sector);
  }

  // Zaten listede olanlar ve listeden çıkmış adresler işaretlenir
  const emails = list.map((c) => c.email).filter(Boolean) as string[];
  const refs = list.map((c) => c.source_ref).filter(Boolean) as string[];
  const [{ data: haveE }, { data: haveR }, { data: opt }] = await Promise.all([
    emails.length ? admin.from("leads").select("email").in("email", emails) : { data: [] },
    refs.length ? admin.from("leads").select("source_ref").in("source_ref", refs) : { data: [] },
    emails.length ? admin.from("email_optouts").select("email").in("email", emails) : { data: [] },
  ]);
  const known = new Set([...(haveE ?? []).map((r: { email: string }) => r.email), ...(haveR ?? []).map((r: { source_ref: string }) => r.source_ref)]);
  const out = new Set((opt ?? []).map((r: { email: string }) => r.email));
  const candidates = list.map((c) => ({
    ...c,
    known: known.has(c.email ?? "") || known.has(c.source_ref ?? ""),
    opted_out: !!c.email && out.has(c.email),
  }));
  return json(200, { candidates, cost_usd: Math.round(cost * 10000) / 10000, estimate_usd: estimateUsd(source, count) });
}

async function send(b: Record<string, unknown>, admin: Admin) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("OUTREACH_FROM") ?? Deno.env.get("NOTIFY_FROM");
  if (!apiKey || !from) {
    return json(400, { error: "E-posta gönderimi için Supabase > Edge Functions > Secrets bölümüne RESEND_API_KEY ve OUTREACH_FROM ekleyin." });
  }
  const replyTo = Deno.env.get("OUTREACH_REPLY_TO") ?? null;
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger).slice(0, 200);
  if (!ids.length) return json(400, { error: "Gönderilecek e-postayı seçin." });

  const { data: settings } = await admin.from("platform_settings").select("key, value").in("key", ["outreach_sender", "outreach_daily_cap"]);
  const get = (k: string) => (settings ?? []).find((s: { key: string }) => s.key === k)?.value;
  const sender = (get("outreach_sender") ?? {}) as Sender;
  const cap = Number(get("outreach_daily_cap") ?? 40);

  // İstanbul saatiyle bugünün başı (Türkiye UTC+3, yaz saati yok)
  const tr = 3 * 3600e3;
  const dayStart = new Date(Math.floor((Date.now() + tr) / 864e5) * 864e5 - tr);
  const { count: sentToday } = await admin.from("lead_messages").select("id", { count: "exact", head: true })
    .eq("status", "sent").gte("sent_at", dayStart.toISOString());
  let left = Math.max(0, cap - (sentToday ?? 0));

  const { data: rows } = await admin.from("lead_messages")
    .select("id, step, subject, body, due_at, lead:leads(id, email, status, unsubscribe_token)")
    .in("id", ids).eq("status", "draft").lte("due_at", new Date().toISOString()).order("step");
  const fnBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1/unsubscribe`;
  const appUrl = Deno.env.get("APP_URL") ?? "https://gidero.expo.app";

  let sent = 0, failed = 0, skipped = 0;
  for (const m of rows ?? []) {
    const lead = m.lead as { id: string; email: string | null; status: string; unsubscribe_token: string };
    const email = lead?.email?.toLowerCase();
    const { data: opted } = email ? await admin.from("email_optouts").select("email").eq("email", email).maybeSingle() : { data: null };
    if (!email || opted || !["new", "contacted"].includes(lead.status)) {
      await admin.from("lead_messages").update({ status: "skipped" }).eq("id", m.id);
      skipped++;
      continue;
    }
    if (left <= 0) break;
    const unsubscribeUrl = `${appUrl}/cikis?t=${lead.unsubscribe_token}`;
    const oneClickUrl = `${fnBase}?t=${lead.unsubscribe_token}`;
    const { html, text } = renderOutreach(m.body, sender, replyTo, unsubscribeUrl);
    try {
      const pid = await sendViaResend({ apiKey, from, replyTo }, { to: email, subject: m.subject, html, text, unsubscribeUrl, oneClickUrl });
      await admin.from("lead_messages").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: pid, error: null }).eq("id", m.id);
      await admin.from("leads").update({ status: "contacted", last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", lead.id);
      sent++;
      left--;
    } catch (e) {
      await admin.from("lead_messages").update({ status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq("id", m.id);
      failed++;
    }
  }
  return json(200, { sent, failed, skipped, left_today: left });
}
