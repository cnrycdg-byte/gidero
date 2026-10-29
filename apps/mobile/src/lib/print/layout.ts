// Fiş görsellerini A4 sayfalara sığdırır: kâğıt israfı olmasın diye sayfa başına olabildiğince çok görsel.
// Görseller eşit sütunlara (sütun genişliği okunabilirliği korur) en kısa sütundan başlayarak yerleşir;
// fatura gibi geniş belgeler birden çok sütun kaplar. Saf fonksiyon: ölçüler milimetre.

export type Density = 'tight' | 'normal' | 'large';

/** Yoğunluğa göre sütun sayısı: sıkı 4 (yazar kasa fişi gerçek boyutuna yakın), normal 3, büyük 2 */
export const COLUMNS: Record<Density, number> = { tight: 4, normal: 3, large: 2 };

/** wide: fatura gibi tam sayfa belge (yarım sayfa genişliğinde basılır) */
export type LayoutInput = { id: string; w: number; h: number; wide?: boolean };
export type Placed = { id: string; x: number; y: number; w: number; h: number; boxW: number };
export type Page = { items: Placed[] };

export type LayoutOptions = {
  density: Density;
  /** Yazdırılabilir alan (A4, 10 mm kenar boşluğu: 190 x 277) */
  pageW?: number;
  pageH?: number;
  gap?: number;
  /** Görselin altındaki numara ve açıklama satırı */
  captionH?: number;
};

/** Görselin kaç sütun kaplayacağı: fiş 1 sütun, fatura yarım sayfa, yatay fotoğraf tam genişlik */
export function spanFor(aspect: number, cols: number, wide = false): number {
  if (aspect >= 1.15) return cols;
  if (wide) return Math.max(1, Math.ceil(cols / 2));
  return 1;
}

export function layoutImages(items: LayoutInput[], o: LayoutOptions): Page[] {
  const W = o.pageW ?? 190;
  const H = o.pageH ?? 277;
  const gap = o.gap ?? 3;
  const cap = o.captionH ?? 5;
  const cols = COLUMNS[o.density];
  const colW = (W - gap * (cols - 1)) / cols;

  // Açık sayfalar: her görsel, sığdığı ilk sayfaya yerleşir (sıra numarası altyazıda olduğundan sıra kayması sorun değil)
  const open: { page: Page; heights: number[] }[] = [];

  for (const it of items) {
    const aspect = it.w > 0 && it.h > 0 ? it.w / it.h : 0.5;
    const span = spanFor(aspect, cols, it.wide);
    const boxW = span * colW + (span - 1) * gap;
    // Sayfaya sığmayacak kadar uzun fiş: yükseklikten küçültülür, genişlik daralır
    let imgW = boxW;
    let imgH = boxW / aspect;
    if (imgH + cap > H) {
      imgH = H - cap;
      imgW = imgH * aspect;
    }
    const need = imgH + cap;

    const bestOn = (heights: number[]) => {
      let col = -1;
      let y = Infinity;
      for (let c = 0; c + span <= cols; c++) {
        const top = Math.max(...heights.slice(c, c + span));
        if (top < y - 0.01) {
          y = top;
          col = c;
        }
      }
      return { col, y };
    };

    let target = open.find((o) => bestOn(o.heights).y + need <= H + 0.01);
    if (!target) {
      target = { page: { items: [] }, heights: new Array<number>(cols).fill(0) };
      open.push(target);
    }
    const p = bestOn(target.heights);
    target.page.items.push({ id: it.id, x: p.col * (colW + gap), y: p.y, w: imgW, h: imgH, boxW });
    for (let c = p.col; c < p.col + span; c++) target.heights[c] = p.y + need + gap;
  }
  return open.map((o) => o.page);
}

/** JPEG, PNG ve WEBP başlığından piksel boyutu; okunamazsa null */
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: v.getUint32(16), h: v.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      // SOF0..SOF15 (DHT, JPG, DAC hariç)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
    return null;
  }
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (tag === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (tag === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (tag === 'VP8L') {
      const n = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}
