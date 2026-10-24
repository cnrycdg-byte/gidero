// GİB e-Fatura / e-Arşiv karekodu çözümleyici.
// Karekod düz bir JSON taşır: vkntckn, avkntckn, senaryo, tip, tarih (YYYY-AA-GG), no, ettn, parabirimi,
// malhizmettoplam, kdvmatrah(ORAN), hesaplanankdv(ORAN), vergidahil, odenecek. Tutarlar nokta ondalıklı metin.
// Çoklu KDV oranlı faturalarda her oran ayrı anahtar olarak gelir (ör. "kdvmatrah(10)", "kdvmatrah(20)").
// Kaynak: GİB Karekod Standardı Kılavuzu (docs/vergi-kurallari.md, bölüm 6).

import type { ReceiptFields, VatLine } from "./types.ts";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** Karekod metnini çözer; GİB formatında değilse null döner. */
export function parseGibQr(raw: string): Partial<ReceiptFields> | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || !("ettn" in obj || "vkntckn" in obj)) return null;

  const rates = new Map<number, VatLine>();
  for (const [key, value] of Object.entries(obj)) {
    const m = /^(kdvmatrah|hesaplanankdv)\((\d+(?:[.,]\d+)?)\)$/i.exec(key);
    if (!m) continue;
    const rate = Number(m[2].replace(",", "."));
    const line = rates.get(rate) ?? { rate, base: 0, vat: 0 };
    if (m[1].toLowerCase() === "kdvmatrah") line.base = num(value) ?? 0;
    else line.vat = num(value) ?? 0;
    rates.set(rate, line);
  }

  const scenario = String(obj.senaryo ?? "").toUpperCase();
  const docType = scenario.includes("EARSIV") || scenario.includes("E-ARSIV") ? "e_arsiv" : "e_fatura";

  return {
    readable: true,
    doc_type: docType,
    seller_vkn: str(obj.vkntckn),
    buyer_vkn: str(obj.avkntckn),
    date: str(obj.tarih),
    doc_no: str(obj.no),
    ettn: str(obj.ettn),
    currency: str(obj.parabirimi) ?? "TRY",
    total: num(obj.odenecek) ?? num(obj.vergidahil),
    vat_lines: [...rates.values()].sort((a, b) => a.rate - b.rate),
    confidence: { total: 1, date: 1, doc_no: 1, vat: 1 },
  };
}
