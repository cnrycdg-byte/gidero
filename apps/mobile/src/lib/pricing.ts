// Kademeli fiyat hesabı (sunucudaki private.band_factor ile aynı): kişi/firma sayısı arttıkça birim fiyat düşer.
import { supabase } from '@/lib/supabase';

export type Band = { plan_id?: string; min_qty: number; factor: number };

export function bandFactor(bands: Band[], qty: number): number {
  let f = 1;
  for (const b of [...bands].sort((a, z) => a.min_qty - z.min_qty)) if (b.min_qty <= qty) f = Number(b.factor);
  return f;
}

/** Aylık birim fiyat (kişi ya da firma başı), kuruşa yuvarlanmış */
export function unitPrice(base: number, bands: Band[], qty: number): number {
  return Math.round(base * bandFactor(bands, qty) * 100) / 100;
}

export async function fetchBands(): Promise<Band[]> {
  const { data } = await supabase.from('price_bands').select('plan_id, min_qty, factor');
  return ((data ?? []) as Band[]).map((b) => ({ ...b, factor: Number(b.factor) }));
}
