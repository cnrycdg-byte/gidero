// Uygulama içi geri bildirim: kullanıcı gönderir, Gidero yöneticisi panelde okur ve yanıt notu yazar.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type FeedbackKind = 'idea' | 'bug' | 'question' | 'praise';
export type FeedbackStatus = 'new' | 'seen' | 'done';

export const KIND_LABEL: Record<FeedbackKind, string> = { idea: 'Öneri', bug: 'Hata', question: 'Soru', praise: 'Beğeni' };
export const STATUS_LABEL: Record<FeedbackStatus, string> = { new: 'Yeni', seen: 'Okundu', done: 'Tamamlandı' };

export type MyFeedback = { id: number; kind: FeedbackKind; message: string; status: FeedbackStatus; admin_note: string | null; created_at: string };
export type AdminFeedback = MyFeedback & { screen: string | null; app_info: string | null; user_name: string | null; user_email: string | null; company_name: string | null };

export function appInfo() {
  return `${Platform.OS} ${Platform.Version ?? ''}, Gidero ${Constants.expoConfig?.version ?? ''}`.trim();
}

export async function submitFeedback(p: { kind: FeedbackKind; message: string; companyId?: string | null; screen?: string | null }) {
  const { error } = await supabase.rpc('submit_feedback', {
    p_kind: p.kind,
    p_message: p.message,
    p_company: p.companyId ?? null,
    p_screen: p.screen ?? null,
    p_app_info: appInfo(),
  });
  if (error) throw error;
}

export async function myFeedback(): Promise<MyFeedback[]> {
  const { data, error } = await supabase
    .from('feedback')
    .select('id, kind, message, status, admin_note, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as MyFeedback[];
}

export async function adminFeedback(status?: FeedbackStatus): Promise<AdminFeedback[]> {
  const { data, error } = await supabase.rpc('admin_feedback', { p_status: status ?? null });
  if (error) throw error;
  return (data ?? []) as AdminFeedback[];
}

export async function setFeedback(id: number, status: FeedbackStatus, note?: string | null) {
  const { error } = await supabase.rpc('admin_set_feedback', { p_id: id, p_status: status, p_note: note ?? null });
  if (error) throw error;
}
