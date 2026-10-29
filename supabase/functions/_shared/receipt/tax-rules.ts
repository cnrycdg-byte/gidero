// Vergi kuralları motoru (MVP). Saf fonksiyon: girdi alır, uyarı listesi döndürür.
// Tutarlar kodda sabit değil, ctx.params (tax_parameters tablosu, belge yılı) içinden okunur.
// Kurallar ve dayanaklar: docs/vergi-kurallari.md, docs/bagimsiz-inceleme.md, turk-masraf-vergi skill'i.

import type { Flag, ReceiptFields, TaxContext } from "./types.ts";
import { formatPlate, normalizePlate } from "./validate.ts";

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

export function evaluateTaxRules(ctx: TaxContext): Flag[] {
  const flags: Flag[] = [];
  const f = ctx.fields;
  const rule = ctx.category?.tax_rule ?? "standard";
  const total = ctx.entered_total ?? f.total ?? 0;
  const invoiceLimit = Number(ctx.params["invoice_limit_incl_vat"] ?? NaN);
  const vatRates = (ctx.params["vat_rates"] as number[] | undefined) ?? [1, 10, 20];
  const add = (code: string, severity: Flag["severity"], message: string, legal_ref?: string) =>
    flags.push({ code, severity, message, legal_ref });

  // 0. Alkollü içki: şirket kuralına ya da muhasebe kararına göre
  const alc = alcoholFlag(f.alcohol);
  if (alc) flags.push(alc);

  // 1. Okunamayan belge
  if (!f.readable) {
    add("unreadable", "warning", "Fiş okunamadı. Tutarı elle girin; muhasebe bu belgeyi ayrıca kontrol edecek.");
  }

  // 2. Vergisel belge olmayanlar
  if (f.doc_type === "dekont") {
    add("not_tax_document", "critical",
      "Bu belge fiş veya fatura değil (dekont, kart slipi, biniş kartı vb.). Asıl fiş ya da faturayı yükleyin.",
      "VUK 227");
  }

  // 2b. Bilgi fişi: asıl belge e-Arşiv fatura; çalışan onayı muhasebede görünür
  if (f.doc_type === "bilgi_fisi") {
    if (ctx.einvoice_confirmed) {
      add("info_slip", "info",
        "Bu bir bilgi fişi. Çalışan, e-Arşiv faturasının şirket adına düzenlendiğini onayladı. Kayıt e-Arşiv faturaya göre yapılır; faturayı e-postadan ya da ETTN ile kontrol edin.",
        "VUK 509 GT");
    } else {
      add("info_slip", "warning",
        "Bu bir bilgi fişi; tek başına gider belgesi değil, asıl belge e-Arşiv faturasıdır. Faturanın şirket adına düzenlenip e-postanıza geldiğini onaylayın.",
        "VUK 509 GT");
    }
  }

  // Görseli olmayan masraf: belge muhasebeye sonra gelir ya da GİB'den bulunur
  if (ctx.has_image === false && !f.ettn) {
    add("no_image", "warning",
      "Bu masrafın görseli yok; bilgiler elle yazıldı. e-Arşiv faturasını GİB'de \"Adıma düzenlenen belgeler\"den ya da e-Fatura dosyasından bulup eşleştirin; fatura numarası, satıcı VKN'si ve ödenecek tutarla GİB'den doğrulanabilir.",
      "VUK 509 GT");
  }

  // 3. Kilometre ve gündelik: gider değil, ücret
  if (rule === "mileage") {
    add("payroll_mileage", "warning",
      "Özel araç kilometre ödemesi ücret sayılır; gider belgesi yerine geçmez, bordroya aktarılmalıdır.",
      "GVK 61");
  }

  // 4. Alıcı vergi numarası
  if ((f.doc_type === "e_fatura" || f.doc_type === "e_arsiv" || f.doc_type === "bilgi_fisi") && f.buyer_vkn) {
    if (f.buyer_vkn !== ctx.company_tax_number) {
      const toEmployee = f.buyer_vkn.length === 11;
      add(toEmployee ? "invoice_to_person" : "invoice_to_other_company", "warning",
        toEmployee
          ? "Fatura çalışan adına kesilmiş. KDV indirilemez; gider yazılması da riskli. Satıcıdan şirket adına fatura isteyin."
          : "Fatura başka bir vergi numarasına kesilmiş. KDV indirilemez. Satıcıdan şirket adına fatura isteyin.",
        "KDVK 29/1, 34/1");
    }
  }

  // 5. Fatura düzenleme sınırı (akaryakıt pompa fişi hariç)
  if (f.doc_type === "okc_fis" && Number.isFinite(invoiceLimit)) {
    if (total > invoiceLimit) {
      add("over_invoice_limit", "critical",
        `Bu fiş ${fmt(invoiceLimit)} TL'yi aşıyor. Bu tutarda şirket adına fatura alınması gerekir.`, "VUK 232");
    } else if (total + ctx.same_day_same_seller_total > invoiceLimit) {
      add("split_receipts", "warning",
        `Aynı gün aynı satıcıdan alınan fişlerin toplamı ${fmt(total + ctx.same_day_same_seller_total)} TL ve fatura sınırını aşıyor. Bölünmüş fiş olarak değerlendirilebilir.`,
        "VUK 232");
    }
  }

  // 6. Yazar kasa fişinde KDV indirimi kapsamı
  // Varsayılan: yazar kasa fişi kabul edilir (flexible). Yalnızca şirket "temkinli" seçtiyse uyarılır.
  if (ctx.company.okc_vat_policy === "cautious" && f.doc_type === "okc_fis" &&
    (rule === "meal" || rule === "representation" || rule === "accommodation")) {
    add("okc_vat_not_deductible", "warning",
      "Yemek ve konaklamada yazar kasa fişindeki KDV indirilemez. KDV'nin indirilmesi için şirket adına fatura isteyin.",
      "KDVK 29, 34; KDV GUT");
  }

  // 7. KDV ve toplam tutarlılığı
  for (const line of f.vat_lines) {
    if (!vatRates.includes(line.rate) && line.rate !== 0) {
      add("vat_rate_invalid", "warning", `Fişte geçersiz görünen bir KDV oranı var (%${line.rate}). Fişi kontrol edin.`);
    }
  }

  // 8. Okunan ile girilen tutar farkı
  if (ctx.read_total != null && ctx.entered_total != null && Math.abs(ctx.read_total - ctx.entered_total) > 0.5) {
    add("amount_mismatch", "warning",
      `Girilen tutar (${fmt(ctx.entered_total)} TL) fişte okunan tutardan (${fmt(ctx.read_total)} TL) farklı.`);
  }

  // 9. Mükerrer
  if (ctx.duplicate_of.length > 0) {
    add("duplicate", "critical", "Bu belge daha önce başka bir masrafta kaydedilmiş görünüyor. Mükerrer kaydı kontrol edin.");
  }

  // 10. Katılımcılar
  if ((rule === "meal" || rule === "representation" || ctx.category?.attendees_required) && ctx.attendees.length === 0) {
    add("attendees_missing", "warning", "Bu masraf için birlikte harcama yapılan kişileri yazın.");
  }

  // 11. Akaryakıt: plaka okunmalı ve masraf sahibinin kartındaki araçlardan biri olmalı
  const isFuel = f.doc_type === "akaryakit_okc" || rule === "fuel";
  const plate = normalizePlate(f.plate);
  if (isFuel && !plate) {
    add("fuel_plate_missing", "warning",
      f.plate
        ? `Fişteki plaka (${f.plate}) geçerli bir plaka gibi görünmüyor. Fişteki plakayı kontrol edip düzeltin.`
        : "Akaryakıt fişinde plaka okunamadı. Fişteki plakayı yazın; plakasız akaryakıt gider yazılamaz.",
      "UTTS GT");
  } else if (isFuel && plate && ctx.owner_plates) {
    const own = ctx.owner_plates.map((p) => normalizePlate(p)).filter((p): p is string => !!p);
    if (own.length === 0) {
      add("plate_not_registered", "info",
        `Fişteki plaka ${formatPlate(plate)}. Kişi kartınızda kayıtlı araç yok; yöneticiniz Ekip ekranından ekleyebilir.`);
    } else if (!own.includes(plate)) {
      add("plate_mismatch", "critical",
        `Fişteki plaka (${formatPlate(plate)}) kişi kartınızdaki araçlarla eşleşmiyor: ${own.map(formatPlate).join(", ")}. ` +
          "Başka bir araca alınan yakıt bu masrafa yazılamaz.");
    }
  }

  // 11b. Gider grubu sınırı (şirketin koyduğu kişi başı dönemsel üst limit)
  if (ctx.limit && total > 0) {
    const after = ctx.limit.used_other + total;
    const label = { month: "aylık", quarter: "3 aylık", half: "6 aylık", year: "yıllık" }[ctx.limit.period];
    if (after > ctx.limit.amount) {
      add("over_limit", "warning",
        `${ctx.limit.category} için ${label} sınırınız ${fmt(ctx.limit.amount)} TL. Bu fişle ${fmt(after)} TL oldu, ` +
          `${fmt(after - ctx.limit.amount)} TL aşıldı. Onaylayıcınız bu aşımı görecek.`);
    } else if (after >= ctx.limit.amount * 0.9) {
      add("near_limit", "info",
        `${ctx.limit.category} için ${label} sınırınızın %${Math.round((after / ctx.limit.amount) * 100)}'ini kullandınız ` +
          `(${fmt(after)} / ${fmt(ctx.limit.amount)} TL).`);
    }
  }

  // 12. Binek araç
  if (rule === "car_running" || rule === "fuel") {
    const ratio = Number(ctx.params["car_running_cost_ratio"] ?? 0.7);
    add("car_expense_split", "info",
      `Binek araç gideriyse giderin %${Math.round(ratio * 100)}'i yazılır, kalanı kanunen kabul edilmeyen gider olur.` +
        (ctx.company.car_kkeg_vat_deductible ? "" : " Kabul edilmeyen kısmın KDV'si de indirilmez (şirket ayarı)."),
      "GVK 40/1-5");
  }

  // 13. Konaklama vergisi
  if (rule === "accommodation" && (f.doc_type === "e_fatura" || f.doc_type === "e_arsiv")) {
    if (!f.other_taxes.some((t) => t.type === "konaklama")) {
      add("accommodation_tax_missing", "info", "Otel faturasında konaklama vergisi satırı bulunamadı. Faturayı kontrol edin.",
        "6802 s. Kanun md. 34");
    }
  }

  // 14. KKEG kategorisi
  if (rule === "kkeg") {
    add("kkeg", "info", "Bu kategori kanunen kabul edilmeyen gider olarak kaydedilir.", "KVK 11, GVK 41");
  }

  // 15. Tarih kontrolleri
  if (f.date) {
    const age = daysBetween(f.date, ctx.today);
    if (age < -1) add("date_future", "warning", "Fiş tarihi ileri bir tarih görünüyor. Tarihi kontrol edin.");
    const docYear = Number(f.date.slice(0, 4));
    const deadline = `${docYear + 1}-12-31`;
    if (ctx.today > deadline) {
      add("vat_deadline_passed", "warning",
        "Bu belgenin KDV indirim süresi geçmiş. KDV gidere eklenir.", "KDVK 29/3");
    } else if (age > 365) {
      add("date_old", "info", "Fiş bir yıldan eski.");
    }
  }

  // 16. Düşük güven
  if (f.readable && Math.min(f.confidence.total, f.confidence.date) < 0.7) {
    add("low_confidence", "info", "Bazı alanlar net okunamadı. Tutar ve tarihi kontrol edin.");
  }

  return flags;
}

const tl = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Alkol uyarısı: karar yoksa muhasebe beklenir; varsa kararın sonucu bilgi olarak yazılır */
export function alcoholFlag(a: ReceiptFields["alcohol"]): Flag | null {
  if (!a?.present) return null;
  const amt = a.amount ? `${tl(a.amount)} TL` : "tutar okunamadı";
  const list = a.items.slice(0, 4).join(", ");
  const what = `Fişte alkollü içki var: ${amt}${list ? ` (${list})` : ""}.`;
  const by = a.auto ? "Şirket kuralına göre" : "Muhasebe kararıyla";
  switch (a.decision) {
    case "kkeg":
      return { code: "alcohol_decided", severity: "info", message: `${what} ${by} size ödenir; vergiden düşülmeyen gider (KKEG) olarak yazılır.` };
    case "accepted":
      return { code: "alcohol_decided", severity: "info", message: `${what} ${by} normal gider yazılır.` };
    case "rejected":
      return { code: "alcohol_decided", severity: "warning", message: `${what} ${by} bu tutar size ödenmez ve gider yazılmaz.` };
    default:
      return { code: "alcohol", severity: "warning", message: `${what} Muhasebe karar verene kadar rapor aktarılmaz; reddedilirse bu tutar size ödenmez.` };
  }
}
