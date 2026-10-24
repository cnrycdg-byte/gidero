// Okunan alanların tutarlılık kontrolleri ve karekod + yapay zekâ sonuçlarının birleştirilmesi.

import type { ReceiptFields } from "./types.ts";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** 10 haneli vergi kimlik numarası kontrol basamağı (GİB algoritması). */
export function isValidVkn(vkn: string): boolean {
  if (!/^\d{10}$/.test(vkn)) return false;
  const d = vkn.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const t = (d[i] + 10 - (i + 1)) % 10;
    let v = (t * 2 ** (10 - (i + 1))) % 9;
    if (t !== 0 && v === 0) v = 9;
    sum += v;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

/** 11 haneli TC kimlik numarası kontrolü. */
export function isValidTckn(tckn: string): boolean {
  if (!/^[1-9]\d{10}$/.test(tckn)) return false;
  const d = tckn.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if (((odd * 7 - even) % 10 + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

/** Tutarlılık sorunlarını döndürür; boş dizi = tutarlı. */
export function consistencyIssues(f: ReceiptFields, allowedRates: number[] = [0, 1, 10, 20]): string[] {
  const issues: string[] = [];
  if (!f.readable) return ["okunamadı"];
  if (f.total === null || f.total <= 0) issues.push("toplam yok");
  for (const line of f.vat_lines) {
    if (!allowedRates.includes(line.rate)) issues.push(`geçersiz KDV oranı %${line.rate}`);
    if (line.base > 0 && Math.abs(round2((line.base * line.rate) / 100) - line.vat) > 0.05) {
      issues.push(`%${line.rate} KDV tutarı matrahla uyuşmuyor`);
    }
  }
  if (f.total !== null && f.vat_lines.length > 0) {
    const sum = f.vat_lines.reduce((a, l) => a + l.base + l.vat, 0) +
      f.other_taxes.reduce((a, t) => a + t.amount, 0);
    // Yuvarlama ve servis bedeli gibi küçük farklar için 1 TL tolerans
    if (Math.abs(round2(sum) - f.total) > 1) issues.push("matrah + KDV toplamı tutmuyor");
  }
  if (f.seller_vkn && f.seller_vkn.length === 10 && !isValidVkn(f.seller_vkn)) issues.push("satıcı VKN geçersiz");
  const minConf = Math.min(f.confidence.total, f.confidence.date);
  if (minConf < 0.7) issues.push("düşük güven");
  return issues;
}

/** Karekoddan gelen kesin alanlar yapay zekâ sonucunun üzerine yazılır. */
export function mergeQr(ai: ReceiptFields, qr: Partial<ReceiptFields> | null): ReceiptFields {
  if (!qr) return ai;
  const merged: ReceiptFields = { ...ai };
  for (const [k, v] of Object.entries(qr) as [keyof ReceiptFields, unknown][]) {
    if (v === null || v === undefined) continue;
    if (k === "vat_lines" && Array.isArray(v) && v.length === 0) continue;
    (merged as unknown as Record<string, unknown>)[k] = v;
  }
  merged.confidence = {
    total: qr.total != null ? 1 : ai.confidence.total,
    date: qr.date ? 1 : ai.confidence.date,
    doc_no: qr.doc_no ? 1 : ai.confidence.doc_no,
    vat: qr.vat_lines?.length ? 1 : ai.confidence.vat,
  };
  return merged;
}
