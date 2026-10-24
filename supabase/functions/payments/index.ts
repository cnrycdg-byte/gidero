// payments: abonelik satın alma (iyzico ile kartla ödeme).
//
// POST { action: "checkout", account_id, plan_id, period, seats?, code?, billing }  (Authorization: Bearer <oturum>)
//   → siparişi oluşturur (fiyat veritabanında hesaplanır), iyzico ödeme sayfasını başlatır, { order, paymentPageUrl } döner.
// POST ?callback=1  (iyzico'dan, form: token=...)
//   → ödemeyi iyzico'dan sorgular; tutar ve sipariş eşleşirse sipariş ödenir ve paket kendiliğinden açılır.
//
// Güvenlik: sipariş ve fiyat kullanıcının kendi oturumuyla (yetki kontrollü RPC) oluşturulur; ödendi işareti
// yalnızca sunucu anahtarıyla ve iyzico'dan doğrulanmış sonuçla verilir. Kart bilgisi bize hiç gelmez.

import { createClient } from "npm:@supabase/supabase-js@2";
import { initCheckout, retrieveCheckout, splitName, type IyzicoConfig } from "../_shared/payments/iyzico.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

function page(title: string, text: string, ok: boolean) {
  const color = ok ? "#0B6E5F" : "#B42318";
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head><body style="margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F4F6F5;color:#16211F">
<main style="max-width:420px;margin:15vh auto;padding:32px;background:#fff;border-radius:20px;text-align:center">
<div style="width:56px;height:56px;border-radius:28px;background:${color};color:#fff;font-size:30px;line-height:56px;margin:0 auto 16px">${ok ? "✓" : "!"}</div>
<h1 style="font-size:22px;margin:0 0 8px">${title}</h1><p style="color:#4A5856;line-height:1.5;margin:0 0 24px">${text}</p>
<a href="gidero://abonelik" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:600">Gidero'ya dön</a>
</main></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function iyzicoConfig(): IyzicoConfig | null {
  const apiKey = Deno.env.get("IYZICO_API_KEY");
  const secretKey = Deno.env.get("IYZICO_SECRET_KEY");
  if (!apiKey || !secretKey) return null;
  return { apiKey, secretKey, baseUrl: Deno.env.get("IYZICO_BASE_URL") ?? "https://sandbox-api.iyzipay.com" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Yalnızca POST" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);
  const cfg = iyzicoConfig();
  const isCallback = new URL(req.url).searchParams.get("callback") === "1";

  // ---------------- iyzico dönüşü ----------------
  if (isCallback) {
    if (!cfg) return page("Ödeme alınamadı", "Kartla ödeme şu anda kapalı.", false);
    const form = await req.formData().catch(() => null);
    const token = form?.get("token")?.toString();
    if (!token) return page("Ödeme alınamadı", "Ödeme bilgisi eksik geldi. Tekrar deneyin.", false);

    const { data: order } = await admin.from("orders").select("id, total, status").eq("provider_token", token).maybeSingle();
    if (!order) return page("Ödeme bulunamadı", "Bu ödemeye ait sipariş bulunamadı. Bizimle iletişime geçin.", false);
    if (order.status === "paid" || order.status === "approved") {
      return page("Paketiniz açıldı", "Ödemeniz daha önce alındı. Uygulamaya dönebilirsiniz.", true);
    }

    const r = await retrieveCheckout(cfg, token);
    const success = r.status === "success" && r.paymentStatus === "SUCCESS" && r.basketId === order.id;
    if (!success) {
      await admin.rpc("fail_card_order", { p_order: order.id, p_reason: r.errorMessage ?? r.paymentStatus ?? "Ödeme başarısız" });
      return page("Ödeme tamamlanmadı", r.errorMessage ? `Banka yanıtı: ${r.errorMessage}` : "Kartınızdan çekim yapılmadı. Tekrar deneyebilirsiniz.", false);
    }
    const { data: done, error } = await admin.rpc("complete_card_order", {
      p_order: order.id, p_payment_id: String(r.paymentId ?? ""), p_paid: Number(r.paidPrice),
    });
    if (error || (done as { status?: string } | null)?.status !== "paid") {
      console.error("payments complete error", error, done);
      return page("Ödeme kontrol ediliyor", "Ödemeniz alındı ancak paket açılırken bir sorun oldu. Ekibimiz kısa sürede kontrol edecek.", false);
    }
    return page("Paketiniz açıldı", "Ödemeniz alındı, paketiniz hemen kullanıma açıldı. Faturanız e-postanıza gönderilecek.", true);
  }

  // ---------------- Ödeme başlatma ----------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Oturum gerekli." });
  let body: {
    action?: string; account_id?: string; plan_id?: string; period?: string; seats?: number; code?: string;
    billing?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Geçersiz istek." });
  }
  if (body.action !== "checkout") return json(400, { error: "Geçersiz işlem." });
  if (!cfg) return json(503, { error: "Kartla ödeme henüz açılmadı. Havale ile ödeme için siparişinizi oluşturun." });

  const user = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: me } = await user.auth.getUser();
  const { data: order, error: orderErr } = await user.rpc("create_order", {
    p_account: body.account_id, p_plan: body.plan_id, p_period: body.period, p_seats: body.seats ?? null,
    p_code: body.code ?? null, p_method: "card", p_billing: body.billing ?? {},
  });
  if (orderErr || !order) return json(400, { error: orderErr?.message ?? "Sipariş oluşturulamadı." });
  const o = order as { id: string; total: number; plan_id: string; billing_period: string; billing: Record<string, string> };

  const { data: plan } = await admin.from("plans").select("name").eq("id", o.plan_id).single();
  const b = o.billing;
  const [name, surname] = splitName(b.contact_name || b.title);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "85.34.78.112";
  const init = await initCheckout(cfg, {
    conversationId: o.id,
    basketId: o.id,
    price: Number(o.total),
    callbackUrl: `${url}/functions/v1/payments?callback=1`,
    item: { id: o.plan_id, name: `Gidero ${plan?.name ?? o.plan_id} (${o.billing_period === "year" ? "yıllık" : "aylık"})`, category: "Yazılım aboneliği" },
    buyer: {
      id: me.user?.id ?? o.id, name, surname, email: b.email, gsmNumber: b.phone || "+905000000000",
      identityNumber: /^\d{11}$/.test(b.tax_number) ? b.tax_number : "11111111111",
      address: b.address, city: b.city, ip,
    },
    billing: { contactName: b.title, address: b.address, city: b.city },
  });
  if (init.status !== "success" || !init.token || !init.paymentPageUrl) {
    await admin.rpc("fail_card_order", { p_order: o.id, p_reason: init.errorMessage ?? "Ödeme sayfası açılamadı" });
    return json(502, { error: init.errorMessage ? `Ödeme sayfası açılamadı: ${init.errorMessage}` : "Ödeme sayfası açılamadı. Biraz sonra tekrar deneyin." });
  }
  await admin.from("orders").update({ provider: "iyzico", provider_token: init.token }).eq("id", o.id);
  return json(200, { order_id: o.id, total: o.total, paymentPageUrl: init.paymentPageUrl });
});
