import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { authHeader, initCheckout, money, splitName } from "../iyzico.ts";

const cfg = { apiKey: "sandbox-key", secretKey: "sandbox-secret", baseUrl: "https://sandbox-api.iyzipay.com" };

test("IYZWSv2 imzası belgedeki algoritmayla aynı", async () => {
  const path = "/payment/bin/check";
  const body = '{"binNumber":"589004"}';
  const rnd = "123456789";
  const sig = createHmac("sha256", cfg.secretKey).update(rnd + path + body).digest("hex");
  const expected = "IYZWSv2 " + Buffer.from(`apiKey:${cfg.apiKey}&randomKey:${rnd}&signature:${sig}`).toString("base64");
  assert.equal(await authHeader(cfg, path, body, rnd), expected);
});

test("ödeme formu isteği doğru alanlarla gider", async () => {
  let sent: { url: string; headers: Record<string, string>; body: Record<string, any> } | null = null;
  const fakeFetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    sent = { url, headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ status: "success", token: "tok", paymentPageUrl: "https://pay" }));
  }) as unknown as typeof fetch;
  const r = await initCheckout(cfg, {
    conversationId: "o1", basketId: "o1", price: 9590.4, callbackUrl: "https://cb",
    item: { id: "buro_5", name: "Büro 5 yıllık", category: "Yazılım aboneliği" },
    buyer: { id: "u1", name: "Ayşe", surname: "Demir", email: "a@b.c", gsmNumber: "+905000000000",
      identityNumber: "11111111111", address: "Alsancak", city: "İzmir", ip: "1.1.1.1" },
    billing: { contactName: "Defter Ltd", address: "Alsancak", city: "İzmir" },
  }, fakeFetch);
  assert.equal(r.token, "tok");
  assert.equal(sent!.url, "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom");
  assert.equal(sent!.body.price, "9590.40");
  assert.equal(sent!.body.paidPrice, "9590.40");
  assert.equal(sent!.body.basketItems[0].price, "9590.40");
  assert.equal(sent!.body.basketItems[0].itemType, "VIRTUAL");
  assert.ok(sent!.headers.Authorization.startsWith("IYZWSv2 "));
  assert.ok(sent!.headers["x-iyzi-rnd"]);
});

test("yardımcılar", () => {
  assert.equal(money(10), "10.00");
  assert.deepEqual(splitName("Ayşe Nur Demir"), ["Ayşe Nur", "Demir"]);
});
