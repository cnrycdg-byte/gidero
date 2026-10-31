// unsubscribe: tanıtım e-postalarındaki "listeden çıkın" bağlantısı (oturum gerekmez, verify_jwt = false).
//
// POST ?t=<token>            → e-posta programlarının tek tıkla çıkma isteği (RFC 8058, List-Unsubscribe-Post)
// POST { token }             → uygulamadaki /cikis sayfası
// Adres kalıcı ret listesine yazılır ve bekleyen takip e-postaları iptal edilir (6563 s. Kanun: en geç 3 iş günü).

import { clients, cors, json } from "../_shared/auth/clients.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Yalnızca POST" });
  let token = new URL(req.url).searchParams.get("t") ?? "";
  if (!token) {
    try {
      token = String((await req.json()).token ?? "");
    } catch {
      token = "";
    }
  }
  if (!UUID.test(token)) return json(400, { error: "Bağlantı geçersiz." });
  const { admin } = clients(req);
  const { data, error } = await admin.rpc("lead_unsubscribe", { p_token: token });
  if (error) {
    console.error("unsubscribe", error.message);
    return json(500, { error: "İşlem tamamlanamadı. Biraz sonra tekrar deneyin." });
  }
  return json(200, { ok: data === true });
});
