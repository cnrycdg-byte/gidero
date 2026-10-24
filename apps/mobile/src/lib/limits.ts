import { supabase } from './supabase';

export type LimitPeriod = 'month' | 'quarter' | 'half' | 'year';

export type Usage = {
  user_id: string;
  full_name: string;
  category_id: string;
  category_name: string;
  limit_amount: number;
  limit_period: LimitPeriod;
  period_start: string;
  period_end: string;
  used: number;
};

export const PERIOD_LABEL: Record<LimitPeriod, string> = {
  month: 'Aylık',
  quarter: '3 aylık',
  half: '6 aylık',
  year: 'Yıllık',
};

const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** 2026-10-01..2026-12-31 → "Ekim–Aralık 2026"; tek ay → "Ekim 2026" */
export function rangeText(start: string, end: string): string {
  const [y1, m1] = start.split('-').map(Number);
  const [y2, m2] = end.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${AY[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${AY[m1 - 1]}–${AY[m2 - 1]} ${y1}`;
  return `${AY[m1 - 1]} ${y1}–${AY[m2 - 1]} ${y2}`;
}

/** Kullanım oranı ve durumu */
export function usageState(u: Pick<Usage, 'used' | 'limit_amount'>) {
  const ratio = u.limit_amount > 0 ? Number(u.used) / Number(u.limit_amount) : 0;
  return { ratio, over: ratio > 1, near: ratio >= 0.9 && ratio <= 1, remaining: Number(u.limit_amount) - Number(u.used) };
}

/** p_user verilmezse: yönetici/muhasebe herkesi, onaylayıcı ekibini (ve kendini) görür */
export async function fetchUsage(companyId: string, userId?: string): Promise<Usage[]> {
  const { data, error } = await supabase.rpc('category_usage', { p_company: companyId, ...(userId ? { p_user: userId } : {}) });
  if (error) throw error;
  return ((data ?? []) as Usage[]).map((u) => ({ ...u, used: Number(u.used), limit_amount: Number(u.limit_amount) }));
}
