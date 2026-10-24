import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Bu iki değer herkese açıktır (uygulamanın içine gömülür). Veriyi koruyan şey veritabanındaki RLS kurallarıdır.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://rakmatyrsoswbbhnzeph.supabase.co';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export const supabaseConfigured = key.length > 0;

export const supabase = createClient(url, key || 'eksik-anahtar', {
  auth: {
    storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Uygulama ön plandayken oturum yenilenir, arka plandayken durur.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Supabase / Postgres hatasını kullanıcıya gösterilecek Türkçe cümleye çevirir. */
export function errorText(e: unknown): string {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/Invalid login credentials/i.test(msg)) return 'E-posta veya şifre hatalı.';
  if (/Email not confirmed/i.test(msg)) return 'E-postanızı doğrulayın: gelen kutunuzdaki bağlantıya dokunun.';
  if (/User already registered/i.test(msg)) return 'Bu e-postayla zaten hesap var. Giriş yapın.';
  if (/Password should be at least/i.test(msg)) return 'Şifre en az 6 karakter olmalı.';
  if (/rate limit/i.test(msg)) return 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.';
  if (/Network request failed|Failed to fetch/i.test(msg)) return 'İnternet bağlantısı yok. Bağlantınızı kontrol edip tekrar deneyin.';
  if (/row-level security|permission denied/i.test(msg)) return 'Bu işlem için yetkiniz yok.';
  return msg || 'Bir şeyler ters gitti. Tekrar deneyin.';
}
