// Yönetici en yüksek (ilk kademe) ve en düşük (son kademe) birim fiyatı girer; kademe fiyatları bu ikisi arasına dağıtılır.
// Saf fonksiyonlar (testlerde Node ile çalışır).

export type Curve = 'even' | 'early' | 'late';

export const CURVE_LABEL: Record<Curve, string> = {
  even: 'Eşit adımlarla',
  early: 'Başta hızlı düşsün',
  late: 'Sonda hızlı düşsün',
};

export type Tier = { from: number; to: number | null; monthly: number; yearly: number; factor: number };

const shape: Record<Curve, (x: number) => number> = {
  even: (x) => x,
  early: (x) => 1 - (1 - x) * (1 - x),
  late: (x) => x * x,
};

/** "10, 25, 50" gibi yazılmış kademe başlangıçlarını sıralı, tekrarsız sayılara çevirir */
export function parseThresholds(text: string, minSeats: number): number[] {
  const nums = text
    .split(/[^0-9]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > minSeats);
  return [...new Set(nums)].sort((a, b) => a - b).slice(0, 20);
}

/** Kademe birim fiyatları: ilk kademe en yüksek fiyat, son kademe en düşük; tam TL'ye yuvarlanır, hiç yükselmez */
export function distribute(max: number, min: number, thresholds: number[], curve: Curve): number[] {
  const n = thresholds.length;
  const out = [Math.round(max)];
  for (let k = 1; k <= n; k++) {
    const p = Math.round(max - (max - min) * shape[curve](k / n));
    out.push(Math.min(p, out[out.length - 1]));
  }
  return out;
}

/** Kademeler: her satırda adet aralığı, aylık ve yıllık ödemede birim fiyat ve veritabanına yazılacak katsayı */
/** yearlyBase: yıllık ödemede ilk kademenin aylık birim fiyatı; diğer kademeler aynı oranla düşer */
export function buildTiers(prices: number[], thresholds: number[], minSeats: number, yearlyBase: number): Tier[] {
  const max = prices[0];
  const starts = [minSeats, ...thresholds];
  return starts.map((from, i) => {
    const factor = i === 0 ? 1 : Math.round((prices[i] / max) * 1e8) / 1e8;
    const monthly = Math.round(max * factor * 100) / 100;
    return {
      from,
      to: i + 1 < starts.length ? starts[i + 1] - 1 : null,
      monthly,
      yearly: Math.round(yearlyBase * factor * 100) / 100,
      factor,
    };
  });
}

/** Bir müşteri için aylık birim fiyat (sunucudaki hesapla aynı: taban fiyat × kademe katsayısı) */
export function priceFor(tiers: Tier[], qty: number, period: 'month' | 'year'): number {
  let t = tiers[0];
  for (const x of tiers) if (qty >= x.from) t = x;
  return period === 'year' ? t.yearly : t.monthly;
}
