import { supabase } from './supabase';

export type Plan = {
  id: string;
  kind: 'company' | 'bureau';
  name: string;
  description: string;
  unit: 'user' | 'account';
  price_monthly: number;
  price_yearly_monthly: number;
  min_seats: number;
  max_companies: number | null;
  users_per_company: number | null;
  features: string[];
  active: boolean;
  sort: number;
};

export type AccountStatus = {
  account_id: string;
  kind: 'company' | 'bureau';
  name: string;
  plan_id: string | null;
  plan_name: string | null;
  status: 'trial' | 'active' | 'canceled' | 'expired';
  billing_period: 'month' | 'year' | null;
  ends_at: string | null;
  active: boolean;
  can_manage: boolean;
  max_companies: number | null;
  max_users: number | null;
  seats: number | null;
  companies_used: number;
  users_used: number;
};

export type Quote = {
  plan_name: string;
  months: number;
  seats: number;
  list_price: number;
  discount: number;
  net_amount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  extra_months: number;
  campaign_note: string | null;
};

export type Order = {
  id: string;
  order_no: number;
  account_id: string;
  plan_id: string;
  billing_period: 'month' | 'year';
  seats: number;
  months: number;
  campaign_code: string | null;
  net_amount: number;
  vat_amount: number;
  total: number;
  status: 'pending_payment' | 'paid' | 'approved' | 'failed' | 'canceled' | 'refunded';
  payment_method: 'card' | 'transfer' | 'manual';
  billing: Record<string, string>;
  created_at: string;
  paid_at: string | null;
  note: string | null;
};

export const STATUS_TEXT: Record<AccountStatus['status'], string> = {
  trial: 'Ücretsiz deneme',
  active: 'Aktif',
  canceled: 'İptal edildi',
  expired: 'Süresi doldu',
};

export const ORDER_STATUS: Record<Order['status'], string> = {
  pending_payment: 'Ödeme bekliyor',
  paid: 'Ödendi',
  approved: 'Onaylandı',
  failed: 'Başarısız',
  canceled: 'İptal',
  refunded: 'İade edildi',
};

export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
}

export async function accountStatus(accountId: string): Promise<AccountStatus> {
  const { data, error } = await supabase.rpc('account_status', { p_account: accountId });
  if (error) throw error;
  return data as AccountStatus;
}

export async function fetchPlans(kind?: 'company' | 'bureau'): Promise<Plan[]> {
  let q = supabase.from('plans').select('*').order('sort');
  if (kind) q = q.eq('kind', kind);
  const { data } = await q;
  return ((data ?? []) as Plan[]).map((p) => ({
    ...p,
    price_monthly: Number(p.price_monthly),
    price_yearly_monthly: Number(p.price_yearly_monthly),
  }));
}

export async function quote(accountId: string, planId: string, period: 'month' | 'year', seats: number | null, code: string | null) {
  const { data, error } = await supabase.rpc('quote_order', {
    p_account: accountId,
    p_plan: planId,
    p_period: period,
    p_seats: seats,
    p_code: code || null,
  });
  if (error) throw error;
  const q = data as Quote;
  return {
    ...q,
    list_price: Number(q.list_price),
    discount: Number(q.discount),
    net_amount: Number(q.net_amount),
    vat_amount: Number(q.vat_amount),
    total: Number(q.total),
  };
}
