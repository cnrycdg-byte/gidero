import { test } from "node:test";
import assert from "node:assert/strict";
import { askClaude, cleanMessage, extractContact, wantsHuman } from "../chat.ts";

test("e-posta ve telefon yakalanır", () => {
  assert.equal(extractContact("bana muhasebe@ornek.com.tr adresinden dönün"), "muhasebe@ornek.com.tr");
  assert.equal(extractContact("numaram 0532 123 45 67"), "05321234567");
  assert.equal(extractContact("fiyat nedir"), null);
});

test("görüşme isteği anlaşılır", () => {
  assert.equal(wantsHuman("Demo görmek istiyorum"), true);
  assert.equal(wantsHuman("Büro paketi kaç firma"), false);
});

test("mesaj temizlenir ve kısaltılır", () => {
  assert.equal(cleanMessage("  merhaba \n dünya "), "merhaba dünya");
  assert.equal(cleanMessage(""), null);
  assert.equal(cleanMessage(5), null);
  assert.equal(cleanMessage("a".repeat(900))?.length, 600);
});

test("Claude'a giden mesajlar kullanıcıyla başlar ve roller birleşir", async () => {
  let sent: any = null;
  const fake = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ content: [{ type: "text", text: " Merhaba! " }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const out = await askClaude("k", [
    { role: "assistant", content: "Hoş geldiniz" },
    { role: "visitor", content: "Fiyat?" },
    { role: "visitor", content: "Büro için" },
  ], fake);
  assert.equal(out, "Merhaba!");
  assert.deepEqual(sent.messages, [{ role: "user", content: "Fiyat?\nBüro için" }]);
  assert.ok(sent.system.includes("Gidero"));
});
