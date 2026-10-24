const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 });

export const money = (n: number | null | undefined) => (n == null ? '—' : tl.format(Number(n)));

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** 2026-10-20 → 20 Ekim 2026 */
export function dateText(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${AYLAR[m - 1]} ${y}`;
}

/** Bu ayın adı ve dönem kodu: { title: 'Ekim 2026 masrafları', period: '2026-10' } */
export function currentPeriod(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return { title: `${AYLAR[m - 1]} ${y} masrafları`, period: `${y}-${String(m).padStart(2, '0')}` };
}

/** Kullanıcının yazdığı tutarı sayıya çevirir: "1.250,50" → 1250.5 ; "1250.5" → 1250.5 */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\s|₺|TL/gi, '');
  if (!t) return null;
  let norm = t;
  if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sayıyı düzenleme kutusu için yazıya çevirir: 1250.5 → "1250,50" */
export const amountInput = (n: number | null | undefined) =>
  n == null ? '' : Number(n).toFixed(2).replace('.', ',');

/** GG.AA.YYYY veya YYYY-AA-GG → YYYY-AA-GG (geçersizse null) */
export function parseDate(text: string): string | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export const dateInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};
