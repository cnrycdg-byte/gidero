// Şirket markası: kurumsal renklerden okunabilir bir uygulama paleti türetir.
// Saf fonksiyonlar (React yok); testleri test/colors.test.ts.

export type Rgb = [number, number, number];

export const HEX_RE = /^#[0-9A-F]{6}$/;

/** "#c8102e", "c8102e", "#C10" → "#C8102E"; geçersizse null */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toUpperCase();
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9A-F]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX_RE.test(s) ? s : null;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** a ile b arasında karışım: t=0 → a, t=1 → b */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG karşıtlık oranı (1–21) */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Rengi, zemin üzerinde en az `min` karşıtlık verene kadar zemine zıt yöne (siyah/beyaz) kaydırır */
export function ensureContrast(color: string, bg: string, min: number): string {
  if (contrast(color, bg) >= min) return color;
  const toward = luminance(bg) > 0.4 ? '#000000' : '#FFFFFF';
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(color, toward, t);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}

export type BrandInput = { primary: string | null; accent: string | null };

type PaletteLike = {
  canvas: string;
  paper: string;
  pen: string;
  penSoft: string;
  onPen: string;
  deep: string;
  onDeep: string;
  onDeepMuted: string;
  gold: string;
};

/**
 * Temel paletin marka renklerini şirketin renkleriyle değiştirir.
 * Metin ve buton karşıtlığı WCAG AA (4,5) altına düşmez; uyarı renkleri (kırmızı, turuncu) değişmez.
 */
export function brandPalette<P extends PaletteLike>(base: P, brand: BrandInput, scheme: 'light' | 'dark'): P {
  const primary = normalizeHex(brand.primary);
  const accent = normalizeHex(brand.accent);
  if (!primary && !accent) return base;
  const out = { ...base };
  if (primary) {
    if (scheme === 'light') {
      const pen = ensureContrast(primary, base.paper, 4.5);
      out.pen = pen;
      out.penSoft = mix(pen, '#FFFFFF', 0.9);
      out.onPen = contrast('#FFFFFF', pen) >= 4.5 ? '#FFFFFF' : '#000000';
      out.deep = ensureContrast(mix(pen, '#000000', 0.35), '#FFFFFF', 8);
      out.onDeep = '#FFFFFF';
      out.onDeepMuted = ensureContrast(mix(primary, '#FFFFFF', 0.6), out.deep, 4.5);
    } else {
      const pen = ensureContrast(primary, base.paper, 4.5);
      out.pen = pen;
      out.penSoft = mix(pen, base.canvas, 0.78);
      out.onPen = contrast('#000000', pen) >= contrast('#FFFFFF', pen) ? '#0A0F0E' : '#FFFFFF';
      out.deep = ensureContrast(mix(primary, '#000000', 0.55), '#FFFFFF', 8);
      out.onDeep = '#FFFFFF';
      out.onDeepMuted = ensureContrast(mix(primary, '#FFFFFF', 0.55), out.deep, 4.5);
    }
  }
  if (accent) out.gold = accent;
  return out;
}

/** Hazır kurumsal renk önerileri (ana, vurgu) */
export const BRAND_PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: 'Gidero yeşili', primary: '#0B6E5F', accent: '#F2A93B' },
  { name: 'Lacivert', primary: '#1F3A93', accent: '#F5B700' },
  { name: 'Kraliyet mavisi', primary: '#0057B8', accent: '#FFB81C' },
  { name: 'Bordo', primary: '#8C1D40', accent: '#E0B04B' },
  { name: 'Kırmızı', primary: '#C8102E', accent: '#1D1D1B' },
  { name: 'Turuncu', primary: '#D9480F', accent: '#2B2D42' },
  { name: 'Mor', primary: '#5B2A86', accent: '#F4B942' },
  { name: 'Antrasit', primary: '#2E3A46', accent: '#F28C28' },
  { name: 'Petrol', primary: '#00616E', accent: '#E9C46A' },
  { name: 'Zeytin', primary: '#556B2F', accent: '#D4A017' },
];

/**
 * Logodan baskın rengi bulur: piksel listesinden (r,g,b,a) beyaz, siyah, gri ve saydam olanları atar,
 * kalanları kaba renk kutularına toplayıp en kalabalık kutunun ortalamasını verir.
 */
export function dominantColor(pixels: ArrayLike<number>): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 40) continue; // gri, beyaz, siyah
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    k.n++;
    k.r += r;
    k.g += g;
    k.b += b;
    buckets.set(key, k);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const k of buckets.values()) if (!best || k.n > best.n) best = k;
  return best ? rgbToHex([best.r / best.n, best.g / best.n, best.b / best.n]) : null;
}
