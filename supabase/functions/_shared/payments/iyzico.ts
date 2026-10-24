// iyzico Checkout Form istemcisi (HMACSHA256 / IYZWSv2 kimlik doğrulama).
// Belgeler: https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth

export type IyzicoConfig = { apiKey: string; secretKey: string; baseUrl: string };

type Fetch = typeof fetch;

const enc = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(s: string): string {
  const bytes = enc.encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Authorization başlığı: IYZWSv2 base64("apiKey:..&randomKey:..&signature:HMAC(rnd+path+body)") */
export async function authHeader(cfg: IyzicoConfig, path: string, body: string, randomKey: string): Promise<string> {
  const signature = await hmacHex(cfg.secretKey, randomKey + path + body);
  return "IYZWSv2 " + b64(`apiKey:${cfg.apiKey}&randomKey:${randomKey}&signature:${signature}`);
}

async function call<T>(cfg: IyzicoConfig, path: string, payload: unknown, fetchImpl: Fetch = fetch): Promise<T> {
  const body = JSON.stringify(payload);
  const rnd = `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
  const res = await fetchImpl(cfg.baseUrl + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-iyzi-rnd": rnd,
      Authorization: await authHeader(cfg, path, body, rnd),
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  return json as T;
}

/** "1234.5" → "1234.5" (iyzico ondalık nokta bekler, en fazla 2 hane) */
export const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export type CheckoutInit = {
  conversationId: string;
  basketId: string;
  price: number;
  callbackUrl: string;
  item: { id: string; name: string; category: string };
  buyer: {
    id: string; name: string; surname: string; email: string; gsmNumber: string; identityNumber: string;
    address: string; city: string; ip: string;
  };
  billing: { contactName: string; address: string; city: string };
};

export async function initCheckout(cfg: IyzicoConfig, p: CheckoutInit, fetchImpl?: Fetch) {
  const price = money(p.price);
  return await call<{ status: string; errorMessage?: string; token?: string; paymentPageUrl?: string }>(
    cfg,
    "/payment/iyzipos/checkoutform/initialize/auth/ecom",
    {
      locale: "tr",
      conversationId: p.conversationId,
      price,
      paidPrice: price,
      currency: "TRY",
      basketId: p.basketId,
      paymentGroup: "SUBSCRIPTION",
      callbackUrl: p.callbackUrl,
      enabledInstallments: [1],
      buyer: {
        id: p.buyer.id,
        name: p.buyer.name,
        surname: p.buyer.surname,
        gsmNumber: p.buyer.gsmNumber,
        email: p.buyer.email,
        identityNumber: p.buyer.identityNumber,
        registrationAddress: p.buyer.address,
        ip: p.buyer.ip,
        city: p.buyer.city,
        country: "Turkey",
      },
      billingAddress: { contactName: p.billing.contactName, city: p.billing.city, country: "Turkey", address: p.billing.address },
      basketItems: [{ id: p.item.id, name: p.item.name, category1: p.item.category, itemType: "VIRTUAL", price }],
    },
    fetchImpl,
  );
}

export async function retrieveCheckout(cfg: IyzicoConfig, token: string, fetchImpl?: Fetch) {
  return await call<{
    status: string; paymentStatus?: string; paidPrice?: number | string; price?: number | string;
    basketId?: string; conversationId?: string; paymentId?: string; errorMessage?: string;
  }>(cfg, "/payment/iyzipos/checkoutform/auth/ecom/detail", { locale: "tr", token }, fetchImpl);
}

/** Ad soyad ayırma: "Ayşe Nur Demir" → ["Ayşe Nur", "Demir"] */
export function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [parts[0] || "Müşteri", parts[0] || "Müşteri"];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}
