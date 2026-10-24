import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type Source = 'camera' | 'library';

/** Fotoğraf çeker veya galeriden seçer; iptal edilirse null döner. */
export async function pickReceipt(source: Source): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Kameraya izin verilmedi. Ayarlar > Expo Go > Kamera bölümünden izin verin.');
    }
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return null;
  return res.assets[0].uri;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Fişi küçültüp JPEG'e çevirir (iPhone HEIC dahil), depolamaya yükler, masraf satırını açar ve okumayı başlatır.
 * Okuma başarısız olsa bile masraf oluşturulmuş olur; kullanıcı tutarı elle girebilir.
 */
export async function addReceipt(params: { uri: string; companyId: string; reportId: string; userId: string }) {
  const { uri, companyId, reportId, userId } = params;

  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1600 });
  const img = await ctx.renderAsync();
  const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('Fotoğraf hazırlanamadı. Tekrar deneyin.');

  const path = `${companyId}/${reportId}/${randomId()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from('receipts')
    .upload(path, base64ToBytes(saved.base64), { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw upErr;

  const { data: exp, error: insErr } = await supabase
    .from('expenses')
    .insert({ company_id: companyId, report_id: reportId, created_by: userId, total: 0, image_path: path })
    .select('id')
    .single();
  if (insErr) {
    await supabase.storage.from('receipts').remove([path]);
    throw insErr;
  }

  const read = await readReceipt(exp.id);
  return { expenseId: exp.id as string, readError: read.error };
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
  return { error: 'Fiş şu anda okunamadı. Tutarı elle girebilir veya sonra tekrar deneyebilirsiniz.' };
}

/** Kullanıcı bilgileri düzelttikten sonra vergi uyarılarını yeniden hesaplatır (fiş yeniden okunmaz). */
export async function recheckExpense(expenseId: string): Promise<void> {
  try {
    await supabase.functions.invoke('read-receipt', { body: { expense_id: expenseId, recheck: true } });
  } catch {
    // Uyarılar güncellenemese de kayıt geçerli; sessizce geç
  }
}

export async function receiptUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60 * 30);
  return data?.signedUrl ?? null;
}
