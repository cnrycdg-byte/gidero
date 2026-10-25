// site-chat: tanıtım sitesindeki sohbet asistanı.
//
// POST { session_id?: uuid, message: string, page?: string }
//   → { session_id, reply }
//
// Oturum açmadan çağrılır (verify_jwt = false). Yazma sunucu anahtarıyla yapılır; ziyaretçi veritabanına
// doğrudan erişemez. Her soru ve yanıt site_chat_* tablolarına kaydedilir; platform yöneticisi Gidero
// Yönetim > Site sohbetleri ekranından izler. Kötüye kullanıma karşı: mesaj 600 karakter, oturum başına
// 30 mesaj, tüm site için günde 2.000 mesaj.

import { createClient } from "npm:@supabase/supabase-js@2";
import { askClaude, cleanMessage, extractContact, MAX_PER_SESSION, type Turn, wantsHuman } from "../_shared/sitechat/chat.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAILY_LIMIT = 2000;
const FALLBACK = "Şu an yanıt veremiyorum. E-posta adresinizi ya da telefonunuzu yazarsanız ekibimiz size dönsün.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Yalnızca POST" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Geçersiz istek" });
  }
  const message = cleanMessage(body.message);
  if (!message) return json(400, { error: "Mesaj boş" });
  const page = typeof body.page === "string" ? body.page.slice(0, 300) : null;

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Site geneli günlük sınır
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count: today } = await db.from("site_chat_messages").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((today ?? 0) >= DAILY_LIMIT) {
    return json(429, { error: "Şu an çok yoğunuz. Lütfen e-posta ile yazın." });
  }

  // Oturum: var olanı bul ya da yenisini aç
  let sessionId = typeof body.session_id === "string" && UUID.test(body.session_id) ? body.session_id : null;
  let session: { id: string; message_count: number; contact: string | null; needs_human: boolean } | null = null;
  if (sessionId) {
    const { data } = await db.from("site_chat_sessions").select("id, message_count, contact, needs_human").eq("id", sessionId).maybeSingle();
    session = data;
  }
  if (!session) {
    const { data, error } = await db.from("site_chat_sessions").insert({ page }).select("id, message_count, contact, needs_human").single();
    if (error || !data) return json(500, { error: "Sohbet başlatılamadı" });
    session = data;
    sessionId = data.id;
  }
  if (session.message_count >= MAX_PER_SESSION) {
    return json(200, { session_id: sessionId, reply: "Bu sohbette mesaj sınırına geldik. Sorunuz için e-posta adresinizi bırakırsanız ekibimiz size dönsün." });
  }

  const contact = extractContact(message);
  await db.from("site_chat_messages").insert({ session_id: sessionId, role: "visitor", content: message });

  const { data: rows } = await db.from("site_chat_messages").select("role, content").eq("session_id", sessionId)
    .order("created_at", { ascending: true }).limit(40);
  const history = (rows ?? []) as Turn[];

  let reply = FALLBACK;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (apiKey) {
    try {
      reply = await askClaude(apiKey, history.slice(-20));
    } catch (e) {
      console.error("site-chat claude", e);
    }
  }
  await db.from("site_chat_messages").insert({ session_id: sessionId, role: "assistant", content: reply });
  await db.from("site_chat_sessions").update({
    last_at: new Date().toISOString(),
    message_count: session.message_count + 2,
    contact: contact ?? session.contact,
    needs_human: session.needs_human || !!contact || wantsHuman(message),
  }).eq("id", sessionId);

  return json(200, { session_id: sessionId, reply });
});
