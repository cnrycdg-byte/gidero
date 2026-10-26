import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { currentPeriod } from './format';
import { supabase } from './supabase';

/** Galeriden bir veya birden çok fiş seçer; iptal edilirse boş dizi döner. */
export async function pickFromLibrary(): Promise<string[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: 20,
  });
  if (res.canceled || !res.assets?.length) return [];
  return res.assets.map((a) => a.uri);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Fişi küçültüp JPEG'e çevirir (iPhone HEIC dahil), depolamaya yükler ve masraf satırını açar.
 * Dönen masraf kimliğiyle okuma ayrıca başlatılır.
 */
export async function uploadReceipt(p: { uri: string; companyId: string; reportId: string; userId: string }) {
  const ctx = ImageManipulator.manipulate(p.uri);
  ctx.resize({ width: 1280 });
  const img = await ctx.renderAsync();
  const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error('Fotoğraf hazırlanamadı. Tekrar deneyin.');

  const path = `${p.companyId}/${p.reportId}/${randomId()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from('receipts')
    .upload(path, base64ToBytes(saved.base64), { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw upErr;

  const payment_method = await lastPaymentMethod(p.companyId, p.userId);
  const { data: exp, error: insErr } = await supabase
    .from('expenses')
    .insert({ company_id: p.companyId, report_id: p.reportId, created_by: p.userId, total: 0, image_path: path, payment_method })
    .select('id')
    .single();
  if (insErr) {
    await supabase.storage.from('receipts').remove([path]);
    throw insErr;
  }
  return exp.id as string;
}

/** Kişinin bu şirkette en son seçtiği ödeme yolu (şirket kartı kullanan çalışan her fişte yeniden seçmesin) */
const lastPaymentCache = new Map<string, string>();
async function lastPaymentMethod(companyId: string, userId: string): Promise<string> {
  const k = `${companyId}:${userId}`;
  const hit = lastPaymentCache.get(k);
  if (hit) return hit;
  const { data } = await supabase
    .from('expenses')
    .select('payment_method')
    .eq('company_id', companyId)
    .eq('created_by', userId)
    .gt('total', 0)
    .order('updated_at', { ascending: false })
    .limit(1);
  const m = (data?.[0]?.payment_method as string) ?? 'personal';
  lastPaymentCache.set(k, m);
  setTimeout(() => lastPaymentCache.delete(k), 60_000);
  return m;
}

/** Sunucudaki fiş okuma fonksiyonunu çağırır. */
export async function readReceipt(expenseId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.functions.invoke('read-receipt', { body: { expense_id: expenseId } });
  if (!error) return { error: null };
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return { error: String(body.error) };
    } catch {
      // gövde okunamadı
    }
  }
  return { error: 'Fiş okunamadı. Tutarı elle girebilir veya sonra tekrar deneyebilirsiniz.' };
}

/** Kullanıcı bilgileri düzelttikten sonra vergi uyarılarını yeniden hesaplatır (fiş yeniden okunmaz). */
export async function recheckExpense(expenseId: string): Promise<void> {
  try {
    await supabase.functions.invoke('read-receipt', { body: { expense_id: expenseId, recheck: true } });
  } catch {
    // Uyarılar güncellenemese de kayıt geçerli
  }
}

export async function receiptUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60 * 30);
  return data?.signedUrl ?? null;
}

/** Bu ayın açık raporunu bulur; yoksa "Ekim 2026 masrafları" gibi yeni bir rapor açar. */
export async function ensureMonthReport(companyId: string, userId: string): Promise<string> {
  const { title, period } = currentPeriod();
  const { data: found } = await supabase
    .from('reports')
    .select('id')
    .eq('company_id', companyId)
    .eq('owner_user_id', userId)
    .eq('period', period)
    .in('status', ['draft', 'returned'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (found?.length) return found[0].id as string;
  const { data, error } = await supabase
    .from('reports')
    .insert({ company_id: companyId, owner_user_id: userId, created_by: userId, title, period })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}
