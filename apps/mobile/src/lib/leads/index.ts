// Müşteri bulma ve tanıtım e-postaları (yalnızca Gidero yöneticisi). Okuma RLS'ten, yazma RPC ve sunucu fonksiyonundan.
import { functionError } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

export type LeadStatus = 'new' | 'contacted' | 'replied' | 'interested' | 'customer' | 'lost' | 'unsubscribed';
export type LeadKind = 'bureau' | 'company';
export type Lead = {
  id: string;
  name: string;
  kind: LeadKind;
  sector: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  contact_name: string | null;
  source: 'manual' | 'csv' | 'web' | 'maps';
  status: LeadStatus;
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
};

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Yeni',
  contacted: 'Yazıldı',
  replied: 'Yanıt verdi',
  interested: 'İlgileniyor',
  customer: 'Müşteri oldu',
  lost: 'İlgilenmiyor',
  unsubscribed: 'Listeden çıktı',
};
export const KIND_LABEL: Record<LeadKind, string> = { bureau: 'Muhasebe bürosu', company: 'Şirket' };
export const SOURCE_LABEL: Record<Lead['source'], string> = { manual: 'Elle', csv: 'Excel', web: 'Web araması', maps: 'Google Haritalar' };

export async function listLeads(): Promise<Lead[]> {
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []) as Lead[];
}

export type NewLead = Partial<Omit<Lead, 'id' | 'status' | 'created_at' | 'last_contacted_at'>> & { name: string; source_ref?: string | null };

export async function addLeads(rows: NewLead[]): Promise<{ added: number; skipped: number }> {
  const { data, error } = await supabase.rpc('admin_upsert_leads', { p_rows: rows });
  if (error) throw error;
  return data as { added: number; skipped: number };
}

export async function updateLead(id: string, p: { status: LeadStatus; email: string | null; contact: string | null; notes: string | null }) {
  const { error } = await supabase.rpc('admin_update_lead', { p_id: id, p_status: p.status, p_email: p.email, p_contact: p.contact, p_notes: p.notes });
  if (error) throw error;
}

/** Seçilen firmalara 3 adımlı e-posta dizisini taslak olarak hazırlar; gönderim onayla yapılır */
export async function prepareSequence(ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('admin_prepare_sequence', { p_lead_ids: ids });
  if (error) throw error;
  return data as number;
}

export type Candidate = NewLead & { source: 'maps' | 'web'; known: boolean; opted_out: boolean };

export async function findLeads(p: { source: 'maps' | 'web'; kind: LeadKind; what: string; city: string; count: number }) {
  const { data, error } = await supabase.functions.invoke('leads', { body: { action: 'find', ...p } });
  if (error) throw await functionError(error);
  return data as { candidates: Candidate[]; cost_usd: number };
}

/** Arama başlamadan gösterilen tahmini maliyet (sunucudaki hesapla aynı) */
export function estimateUsd(source: 'maps' | 'web', count: number) {
  return source === 'maps' ? Math.ceil(Math.max(1, count) / 20) * 0.035 : 4 * 0.01 + 0.0035;
}

export type MessageStatus = 'draft' | 'sent' | 'failed' | 'skipped';
export type OutMessage = {
  id: number;
  step: number;
  subject: string;
  body: string;
  status: MessageStatus;
  due_at: string;
  sent_at: string | null;
  error: string | null;
  lead: { id: string; name: string; email: string | null; city: string | null; status: LeadStatus } | null;
};

export async function listMessages(): Promise<OutMessage[]> {
  const { data, error } = await supabase
    .from('lead_messages')
    .select('id, step, subject, body, status, due_at, sent_at, error, lead:leads(id, name, email, city, status)')
    .order('due_at', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as OutMessage[];
}

export async function dueCount(): Promise<number> {
  const { count } = await supabase
    .from('lead_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'draft')
    .lte('due_at', new Date().toISOString());
  return count ?? 0;
}

export async function editMessage(id: number, subject: string, body: string, skip = false) {
  const { error } = await supabase.rpc('admin_edit_message', { p_id: id, p_subject: subject, p_body: body, p_skip: skip });
  if (error) throw error;
}

export async function sendMessages(ids: number[]) {
  const { data, error } = await supabase.functions.invoke('leads', { body: { action: 'send', ids } });
  if (error) throw await functionError(error);
  return data as { sent: number; failed: number; skipped: number; left_today: number };
}

export type Sender = { name: string; company: string; address: string; phone: string; website: string };
export type Template = { step: number; delay_days: number; subject: string; body: string };
export type OutreachSettings = { sender: Sender; cap: number; templates: Record<LeadKind, Template[]> };

export async function outreachSettings(): Promise<OutreachSettings> {
  const { data, error } = await supabase.from('platform_settings').select('key, value').in('key', ['outreach_sender', 'outreach_daily_cap', 'outreach_templates']);
  if (error) throw error;
  const get = (k: string) => (data ?? []).find((r) => r.key === k)?.value;
  return {
    sender: { name: '', company: 'Gidero', address: '', phone: '', website: '', ...(get('outreach_sender') ?? {}) },
    cap: Number(get('outreach_daily_cap') ?? 40),
    templates: { bureau: [], company: [], ...(get('outreach_templates') ?? {}) },
  };
}

export async function saveSetting(key: 'outreach_sender' | 'outreach_daily_cap' | 'outreach_templates', value: unknown) {
  const { error } = await supabase.rpc('admin_set_setting', { p_key: key, p_value: value });
  if (error) throw error;
}

/** E-postadaki "listeden çıkın" bağlantısı (oturum gerekmez) */
export async function unsubscribe(token: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('unsubscribe', { body: { token } });
  if (error) throw await functionError(error);
  return !!(data as { ok?: boolean }).ok;
}
