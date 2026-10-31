import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateUsd, extractEmails, findEmailOnSite, parseWebCandidates, placeToCandidate, renderOutreach, searchWeb } from "../lib.ts";

test("sayfadan e-posta çıkarılır; resim adı ve örnek adres atılır, sitenin kendi adresi öne alınır", () => {
  const html = `<a href="mailto:Ahmet@gmail.com">x</a> logo@2x.png info&#64;demirsmmm.com.tr destek@example.com`;
  assert.deepEqual(extractEmails(html, "https://www.demirsmmm.com.tr"), ["info@demirsmmm.com.tr", "ahmet@gmail.com"]);
  assert.deepEqual(extractEmails("yok"), []);
});

test("siteye ulaşılamazsa iletişim sayfası denenir", async () => {
  const calls: string[] = [];
  const fake = (async (url: string) => {
    calls.push(url);
    if (url.endsWith("/iletisim")) return new Response("Bize yazın: ofis@ege.com");
    return new Response("", { status: 404 });
  }) as typeof fetch;
  assert.equal(await findEmailOnSite("ege.com", fake), "ofis@ege.com");
  assert.equal(calls.length, 2);
});

test("Haritalar sonucu firmaya çevrilir", () => {
  const c = placeToCandidate({ id: "p1", displayName: { text: "Ege SMMM" }, websiteUri: "https://ege.com", nationalPhoneNumber: "0232 111 22 33",
    addressComponents: [{ longText: "İzmir", types: ["administrative_area_level_1"] }, { longText: "Bornova", types: ["administrative_area_level_2"] }] }, "bureau", null);
  assert.equal(c?.city, "İzmir");
  assert.equal(c?.district, "Bornova");
  assert.equal(c?.source_ref, "p1");
  assert.equal(placeToCandidate({ id: "p2" }, "bureau", null), null);
});

test("web yanıtındaki JSON güvenle okunur; bozuk e-posta boş bırakılır", () => {
  const rows = parseWebCandidates('Sonuçlar:\n[{"name":"A SMMM","email":"A@a.com","website":"https://www.a.com"},{"name":"B","email":"bozuk"},{"email":"x@y.z"}]', "bureau", null);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].email, "a@a.com");
  assert.equal(rows[0].source_ref, "a.com");
  assert.equal(rows[1].email, null);
  assert.deepEqual(parseWebCandidates("bulamadım", "bureau", null), []);
});

test("e-postada gönderen kimliği ve listeden çıkma bağlantısı bulunur", () => {
  const { html, text } = renderOutreach("Merhaba,\n\n<b>Deneme</b>", { company: "Gidero", phone: "0555" }, "caner@gidero.tr", "https://x/cikis?t=1");
  assert.match(text, /Gidero/);
  assert.match(text, /https:\/\/x\/cikis\?t=1/);
  assert.match(html, /listeden çıkın/);
  assert.match(html, /&lt;b&gt;Deneme/);
});

test("maliyet tahmini: Haritalar 20 firma başına bir istek", () => {
  assert.equal(estimateUsd("maps", 20), 0.035);
  assert.equal(estimateUsd("maps", 40), 0.07);
  assert.ok(estimateUsd("web", 10) < 0.05);
});

test("web araması pause_turn gelince devam eder, arama sayısı toplanır", async () => {
  let n = 0;
  const fake = (async () => {
    n++;
    const body = n === 1
      ? { stop_reason: "pause_turn", content: [{ type: "text", text: "" }], usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 2 } } }
      : { stop_reason: "end_turn", content: [{ type: "text", text: "[]" }], usage: { input_tokens: 50, output_tokens: 5, server_tool_use: { web_search_requests: 1 } } };
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
  const r = await searchWeb("k", "p", fake);
  assert.equal(r.searches, 3);
  assert.equal(r.usage.input_tokens, 150);
  assert.equal(r.text, "[]");
});
