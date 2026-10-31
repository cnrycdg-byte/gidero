// Müşteri bulma ve e-posta gönderimi için saf yardımcılar (node --test ile test edilir).
//
// Maliyet notu (CLAUDE.md kural 7):
// - Google Haritalar (Places Text Search, telefon+web alanlarıyla): istek başına en çok 20 firma, ~0,035 $;
//   Google her ay ilk 1.000 isteği ücretsiz sayar. Web sitesinden e-posta okuma ücretsizdir (yapay zekâ yok).
// - Web araması: ucuz model (Haiku) + en çok MAX_WEB_SEARCHES arama. Arama başına 0,01 $ + birkaç kuruşluk token.
//   Bu yüzden önce Haritalar önerilir; web araması yalnızca Haritalar'da çıkmayan firma türleri için.

export type Candidate = {
  name: string;
  kind: "bureau" | "company";
  sector?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  source: "maps" | "web";
  source_ref?: string | null;
};

type Fetch = typeof fetch;

export const LEAD_MODEL = "claude-haiku-5-5";
export const MAX_WEB_SEARCHES = 4;
export const MAPS_USD_PER_REQUEST = 0.035;
export const WEB_SEARCH_USD = 0.01;

/** Arama başlamadan gösterilen tahmini maliyet (ABD doları) */
export function estimateUsd(source: "maps" | "web", count: number): number {
  if (source === "maps") return Math.ceil(Math.max(1, count) / 20) * MAPS_USD_PER_REQUEST;
  // Haiku: ~25 bin giriş (arama sonuçları) + 2 bin çıkış token
  return MAX_WEB_SEARCHES * WEB_SEARCH_USD + (25000 * 0.1 + 2000 * 0.5) / 1e6;
}

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|^(example|test|user|name|email|your)@|@(example|sentry|wixpress|domain)\./i;

/** Sayfa HTML'inden e-posta adreslerini çıkarır; resim adı ve örnek adresleri atar, en uygununu öne alır */
export function extractEmails(html: string, website?: string | null): string[] {
  const text = html.replace(/&#64;|&#x40;|\s*\[at\]\s*|\s*\(at\)\s*/gi, "@").replace(/mailto:/gi, " ");
  const found = new Set<string>();
  for (const m of text.match(EMAIL_IN_TEXT) ?? []) {
    const e = m.toLowerCase().replace(/^[._-]+|[._-]+$/g, "");
    if (!BAD_EMAIL.test(e) && e.length <= 120) found.add(e);
  }
  const host = website ? hostOf(website) : null;
  const score = (e: string) =>
    (host && e.endsWith("@" + host) ? 0 : 2) + (/^(info|bilgi|iletisim|muhasebe|ofis|office|contact)@/.test(e) ? 0 : 1);
  return [...found].sort((a, b) => score(a) - score(b));
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Web sitesinin ana sayfası ve iletişim sayfasından e-posta bulur (en çok 3 istek, 6 sn) */
export async function findEmailOnSite(website: string, fetchImpl: Fetch = fetch): Promise<string | null> {
  const base = website.startsWith("http") ? website : `https://${website}`;
  let root: URL;
  try {
    root = new URL(base);
  } catch {
    return null;
  }
  const pages = [root.href, new URL("/iletisim", root).href, new URL("/contact", root).href];
  for (const href of pages) {
    try {
      const res = await fetchImpl(href, { redirect: "follow", signal: AbortSignal.timeout(6000), headers: { "user-agent": "Mozilla/5.0 GideroBot" } });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, 400_000);
      const [best] = extractEmails(html, website);
      if (best) return best;
    } catch {
      // ulaşılamayan siteyi atla
    }
  }
  return null;
}

type Place = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  addressComponents?: { longText: string; types: string[] }[];
};

export function placeToCandidate(p: Place, kind: Candidate["kind"], sector: string | null): Candidate | null {
  const name = p.displayName?.text?.trim();
  if (!name) return null;
  const comp = (t: string) => p.addressComponents?.find((c) => c.types.includes(t))?.longText ?? null;
  return {
    name,
    kind,
    sector,
    city: comp("administrative_area_level_1"),
    district: comp("administrative_area_level_2"),
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    email: null,
    source: "maps",
    source_ref: p.id,
  };
}

/** Google Places (New) Text Search: sayfa başına 20 firma, en çok 3 sayfa */
export async function searchPlaces(apiKey: string, query: string, limit: number, fetchImpl: Fetch = fetch): Promise<{ places: Place[]; requests: number }> {
  const places: Place[] = [];
  let pageToken: string | undefined;
  let requests = 0;
  while (places.length < limit && requests < 3) {
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.addressComponents,nextPageToken",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "tr", regionCode: "TR", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    requests++;
    if (!res.ok) throw new Error(`Google Haritalar ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    places.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { places: places.slice(0, limit), requests };
}

export const WEB_PROMPT = (what: string, city: string, count: number) =>
  `Türkiye'de ${city} ilinde faaliyet gösteren ${what} firmalarını web'de ara ve en çok ${count} tanesini listele.
Yalnızca web sitesinde ya da resmi bir dizinde e-posta adresi yazan firmaları al; adres uydurma.
Yanıtın yalnızca şu JSON dizisi olsun, başka metin yazma:
[{"name":"...","city":"...","district":"...","website":"...","email":"...","phone":"..."}]`;

/** Modelin metninden JSON dizisini güvenle çıkarır */
export function parseWebCandidates(text: string, kind: Candidate["kind"], sector: string | null): Candidate[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const out: Candidate[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const name = s(r?.name, 200);
    if (!name) continue;
    const email = s(r.email, 200)?.toLowerCase() ?? null;
    out.push({
      name,
      kind,
      sector,
      city: s(r.city, 80),
      district: s(r.district, 80),
      address: null,
      phone: s(r.phone, 40),
      website: s(r.website, 300),
      email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
      source: "web",
      source_ref: s(r.website, 300) ? hostOf(String(r.website)) : null,
    });
  }
  return out;
}

export type WebUsage = { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };

/** Ucuz model + web araması. pause_turn gelirse en çok 2 kez devam ettirir. */
export async function searchWeb(
  apiKey: string,
  prompt: string,
  fetchImpl: Fetch = fetch,
): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number }; searches: number }> {
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: prompt }];
  let input = 0, output = 0, searches = 0, text = "";
  for (let turn = 0; turn < 3; turn++) {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: LEAD_MODEL,
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES, user_location: { type: "approximate", country: "TR" } }],
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const u: WebUsage = data.usage ?? {};
    input += u.input_tokens ?? 0;
    output += u.output_tokens ?? 0;
    searches += u.server_tool_use?.web_search_requests ?? 0;
    text = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    if (data.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: data.content });
  }
  return { text, usage: { input_tokens: input, output_tokens: output }, searches };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Sender = { name?: string; company?: string; address?: string; phone?: string; website?: string };

/** 6563 s. Kanun: gönderen kimliği, iletişim bilgisi ve ücretsiz ret bağlantısı her iletide bulunur */
export function footerLines(s: Sender, replyTo: string | null): string[] {
  return [
    [s.company || "Gidero", s.address].filter(Boolean).join(" · "),
    [s.phone, replyTo, s.website].filter(Boolean).join(" · "),
  ].filter((l) => l.trim());
}

export function renderOutreach(body: string, sender: Sender, replyTo: string | null, unsubscribeUrl: string): { html: string; text: string } {
  const foot = footerLines(sender, replyTo);
  const text = `${body}\n\n--\n${foot.join("\n")}\nBu e-postaları almak istemiyorsanız: ${unsubscribeUrl}`;
  const paras = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<!doctype html><html lang="tr"><body style="margin:0;font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1C1C1E">
<div style="max-width:560px;margin:0 auto;padding:20px">${paras}
<hr style="border:0;border-top:1px solid #E5E5EA;margin:24px 0 12px">
<p style="font-size:12px;color:#8E8E93;margin:0">${foot.map(esc).join("<br>")}<br>
Bu e-postaları almak istemiyorsanız <a href="${esc(unsubscribeUrl)}" style="color:#8E8E93">listeden çıkın</a>; bir daha yazmayız.</p>
</div></body></html>`;
  return { html, text };
}

export async function sendViaResend(
  cfg: { apiKey: string; from: string; replyTo: string | null },
  msg: { to: string; subject: string; html: string; text: string; unsubscribeUrl: string; oneClickUrl: string },
  fetchImpl: Fetch = fetch,
): Promise<string> {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      from: cfg.from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
      headers: { "List-Unsubscribe": `<${msg.oneClickUrl}>, <${msg.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!res.ok) throw new Error(`E-posta ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json().catch(() => ({}));
  return String(data.id ?? "");
}
