/** Plakayı karşılaştırma için sadeleştirir: "35 abc-123" → "35ABC123". Geçersizse null. */
export function normalizePlate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const map: Record<string, string> = { Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
  const p = raw
    .toLocaleUpperCase('tr-TR')
    .replace(/[^0-9A-ZÇĞİÖŞÜ]/g, '')
    .replace(/[ÇĞİÖŞÜ]/g, (ch) => map[ch] ?? ch);
  return /^(0[1-9]|[1-7][0-9]|8[01])[A-Z]{1,3}[0-9]{2,4}$/.test(p) ? p : null;
}

/** "35ABC123" → "35 ABC 123" */
export function formatPlate(p: string | null | undefined): string {
  if (!p) return '';
  const m = p.match(/^(\d{2})([A-Z]{1,3})(\d{2,4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}
