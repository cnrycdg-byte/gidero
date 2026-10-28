import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

// Test modu: Gidero yöneticisi şifre girmeden deneme kişilerine geçer. Yöneticinin kendi oturumu cihazda saklanır,
// "Hesabıma dön" ile geri yüklenir. Anahtarlar supabase/functions/_shared/demo/personas.ts ile aynıdır.

export type PersonaInfo = { key: string; name: string; role: string; does: string; group: 'buro' | 'sirket' };

export const PERSONAS: PersonaInfo[] = [
  { key: 'buro_sahibi', name: 'Ayşe Demir', role: 'Büro sahibi (mali müşavir)', does: 'Müşteri firma ekler, ekibini atar, raporları kayda alır.', group: 'buro' },
  { key: 'buro_muhasebeci', name: 'Can Yıldız', role: 'Büro muhasebecisi', does: 'Atandığı firmaların raporlarını görür ve aktarır.', group: 'buro' },
  { key: 'musteri_calisan', name: 'Burak Öztürk', role: 'Müşteri firmanın çalışanı', does: 'Fiş çeker, raporu büroya gönderir.', group: 'buro' },
  { key: 'sirket_yonetici', name: 'Mehmet Kaya', role: 'Şirket yöneticisi (patron)', does: 'Ekibi ve onay şemasını kurar, büyük tutarları onaylar.', group: 'sirket' },
  { key: 'bolge_muduru', name: 'Emre Şahin', role: 'Bölge müdürü (onaylayıcı)', does: 'Ekibinin raporlarını onaylar ya da iade eder.', group: 'sirket' },
  { key: 'calisan', name: 'Ali Çelik', role: 'Saha çalışanı', does: 'Fiş çeker, raporu onaya gönderir.', group: 'sirket' },
  { key: 'calisan2', name: 'Elif Koç', role: 'Satış temsilcisi', does: 'İkinci çalışan: farklı yönetici ve tutarla dener.', group: 'sirket' },
  { key: 'sirket_muhasebeci', name: 'Zeynep Arslan', role: 'Şirket muhasebecisi', does: 'Onaylanan raporları denetler, Excel ve Luca dosyası alır.', group: 'sirket' },
];

export const personaInfo = (key: string | null | undefined) => PERSONAS.find((p) => p.key === key) ?? null;

const HOME_KEY = 'gidero.test.home'; // yöneticinin oturumu (yenileme anahtarı)
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

type DemoRow = { user_id: string; persona: string; email: string; full_name: string };

/** Deneme kişilerini açar (yoksa) ve e-postalarıyla listeler. */
export async function preparePersonas(): Promise<DemoRow[]> {
  const { error } = await supabase.functions.invoke('demo-login', { body: { action: 'prepare' } });
  if (error) throw await functionError(error);
  return fetchPersonas();
}

export async function fetchPersonas(): Promise<DemoRow[]> {
  const { data, error } = await supabase.from('demo_users').select('user_id, persona, email, full_name');
  if (error) throw error;
  return (data ?? []) as DemoRow[];
}

/** Şifresiz geçiş: sunucu tek kullanımlık anahtar üretir, burada oturuma çevrilir. */
export async function switchTo(persona: string) {
  const { data: cur } = await supabase.auth.getSession();
  const home = await AsyncStorage.getItem(HOME_KEY).catch(() => null);
  if (!home && cur.session) {
    // İlk geçiş: yöneticinin oturumu saklanır (yalnızca bu cihazda)
    const isDemo = await supabase.from('demo_users').select('user_id').eq('user_id', cur.session.user.id).maybeSingle();
    if (!isDemo.data) {
      await AsyncStorage.setItem(
        HOME_KEY,
        JSON.stringify({ access_token: cur.session.access_token, refresh_token: cur.session.refresh_token, email: cur.session.user.email }),
      );
    }
  }
  const { data, error } = await supabase.functions.invoke('demo-login', { body: { action: 'login', persona } });
  if (error) throw await functionError(error);
  const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: (data as { token_hash: string }).token_hash, type: 'magiclink' });
  if (e2) throw e2;
  changed();
}

/** Yöneticinin kendi hesabına döner. Saklı oturum geçersizse çıkış yapılır. */
export async function backHome(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(HOME_KEY).catch(() => null);
  await AsyncStorage.removeItem(HOME_KEY).catch(() => {});
  let ok = false;
  if (raw) {
    try {
      const s = JSON.parse(raw) as { access_token: string; refresh_token: string };
      const { error } = await supabase.auth.setSession(s);
      ok = !error;
    } catch {
      ok = false;
    }
  }
  if (!ok) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  changed();
  return ok;
}

export async function homeEmail(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(HOME_KEY).catch(() => null);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { email?: string }).email ?? '';
  } catch {
    return null;
  }
}

export async function resetDemoData(): Promise<{ accounts: number; companies: number }> {
  const { data, error } = await supabase.rpc('demo_reset');
  if (error) throw error;
  return data as { accounts: number; companies: number };
}

/** Şu anki kullanıcı bir deneme kişisi mi; test modu açık mı (yönetici oturumu saklı) */
export function useDemo(userId: string | null) {
  const [state, setState] = useState<{ persona: string | null; testMode: boolean }>({ persona: null, testMode: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!userId) return live && setState({ persona: null, testMode: false });
      const [home, row] = await Promise.all([
        AsyncStorage.getItem(HOME_KEY).catch(() => null),
        supabase.from('demo_users').select('persona').eq('user_id', userId).maybeSingle(),
      ]);
      const persona = (row.data as { persona: string } | null)?.persona ?? null;
      if (live) setState({ persona, testMode: !!home || !!persona });
    })();
    return () => {
      live = false;
    };
  }, [userId, tick]);
  return state;
}

async function functionError(e: unknown): Promise<Error> {
  const ctx = (e as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const b = (await ctx.json()) as { error?: string };
      if (b.error) return new Error(b.error);
    } catch {
      /* gövde okunamadı */
    }
  }
  return new Error('Test sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin.');
}
