import { supabase } from './supabase';
import type { Plan } from './billing';

export type AdminAccount = {
  account_id: string;
  kind: 'company' | 'bureau';
  name: string;
  created_at: string;
  owner_email: string | null;
  plan_id: string | null;
  plan_name: string | null;
  status: 'trial' | 'active' | 'canceled' | 'expired';
  ends_at: string | null;
  active: boolean;
  companies: number;
  max_companies: number | null;
  employees: number;
  max_users: number | null;
  accountants: number;
  last_activity: string | null;
  open_orders: number;
};

export type Person = {
  company_id: string | null;
  company_name: string;
  tax_number: string | null;
  user_id: string | null;
  full_name: string;
  email: string | null;
  roles: string[] | null;
  member_status: string | null;
};

export type Campaign = {
  id: string;
  code: string;
  name: string;
  discount_type: 'percent' | 'amount' | 'none';
  discount_value: number;
  extra_months: number;
  plan_ids: string[];
  billing_periods: string[];
  first_order_only: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  active: boolean;
};

export async function adminAccounts(): Promise<AdminAccount[]> {
  const { data, error } = await supabase.rpc('admin_accounts');
  if (error) throw error;
  return (data ?? []) as AdminAccount[];
}

export async function adminPeople(accountId: string): Promise<Person[]> {
  const { data, error } = await supabase.rpc('admin_account_people', { p_account: accountId });
  if (error) throw error;
  return (data ?? []) as Person[];
}

/** Aylık yinelenen gelir tahmini (KDV hariç): yıllık ödemede aylık eşdeğer */
export function monthlyRevenue(accounts: AdminAccount[], plans: Plan[], seatsOf: (a: AdminAccount) => number) {
  return accounts
    .filter((a) => a.status === 'active' && a.active && a.plan_id)
    .reduce((sum, a) => {
      const p = plans.find((x) => x.id === a.plan_id);
      if (!p) return sum;
      return sum + p.price_yearly_monthly * (p.unit === 'user' ? seatsOf(a) : 1);
    }, 0);
}

export const ROLE_TEXT: Record<string, string> = {
  employee: 'Çalışan',
  approver: 'Onaylayıcı',
  accountant: 'Muhasebeci',
  admin: 'Yönetici',
  auditor: 'Denetçi',
  cost_center_owner: 'Masraf merkezi sorumlusu',
  bureau_owner: 'Büro sahibi',
  bureau_accountant: 'Büro muhasebecisi',
};

// Tanıtım sitesi sohbetleri (yalnızca platform yöneticisi okuyabilir)
export type ChatSession = {
  id: string;
  started_at: string;
  last_at: string;
  page: string | null;
  message_count: number;
  contact: string | null;
  needs_human: boolean;
  handled: boolean;
};
export type ChatMessage = { id: number; role: 'visitor' | 'assistant'; content: string; created_at: string };

export async function chatSessions(): Promise<ChatSession[]> {
  const { data, error } = await supabase
    .from('site_chat_sessions')
    .select('id, started_at, last_at, page, message_count, contact, needs_human, handled')
    .order('last_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as ChatSession[];
}

export async function chatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('site_chat_messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as ChatMessage[];
}

export async function setChatHandled(sessionId: string, handled: boolean) {
  const { error } = await supabase.from('site_chat_sessions').update({ handled }).eq('id', sessionId);
  if (error) throw error;
}
