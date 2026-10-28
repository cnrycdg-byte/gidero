import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Test modu: Gidero yöneticisi, "test müşterisi" olarak açtığı hesaplardaki herkese şifre girmeden geçer.
// Yöneticinin kendi oturumu cihazda saklanır, "Kendi hesabıma dön" ile geri yüklenir.

export type DemoPerson = { user_id: string; email: string; full_name: string; label: string; company: string | null };
export type DemoAccount = { account_id: string; kind: 'bureau' | 'company'; name: string; people: DemoPerson[] };

const HOME_KEY = 'gidero.test.home';
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export async function fetchDemoPeople(): Promise<DemoAccount[]> {
  const { data, error } = await supabase.rpc('demo_people');
  if (error) throw error;
  return (data ?? []) as DemoAccount[];
}

/** Şifresiz geçiş: sunucu tek kullanımlık anahtar üretir, burada oturuma çevrilir. */
export async function switchTo(userId: string) {
  const { data: cur } = await supabase.auth.getSession();
  const home = await AsyncStorage.getItem(HOME_KEY).catch(() => null);
  if (!home && cur.session) {
    // İlk geçiş: yöneticinin oturumu saklanır (yalnızca bu cihazda)
    await AsyncStorage.setItem(
      HOME_KEY,
      JSON.stringify({ access_token: cur.session.access_token, refresh_token: cur.session.refresh_token, email: cur.session.user.email }),
    );
  }
  const { data, error } = await supabase.functions.invoke('demo-login', { body: { action: 'login', user_id: userId } });
  if (error) throw await functionError(error);
  const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: (data as { token_hash: string }).token_hash, type: 'magiclink' });
  if (e2) throw e2;
  changed();
  goHome();
}

/** Kişi değişince o kişinin ana ekranı açılır */
function goHome() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign('/');
    return;
  }
  try {
    router.dismissAll();
  } catch {
    /* yığın zaten başta */
  }
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
  if (ok) goHome();
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

export async function resetDemoData(): Promise<{ accounts: number; companies: number; users: number }> {
  const { data, error } = await supabase.functions.invoke('demo-login', { body: { action: 'reset' } });
  if (error) throw await functionError(error);
  return data as { accounts: number; companies: number; users: number };
}

/** Test modu açık mı (yönetici oturumu saklı ya da şu anki kişi bir test kişisi) ve şu anki kişi kim */
export function useDemo(userId: string | null) {
  const [state, setState] = useState<{ me: DemoPerson | null; account: string | null; testMode: boolean }>({
    me: null,
    account: null,
    testMode: false,
  });
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
      if (!userId) return live && setState({ me: null, account: null, testMode: false });
      const home = await AsyncStorage.getItem(HOME_KEY).catch(() => null);
      let me: DemoPerson | null = null;
      let account: string | null = null;
      if (home) {
        const list = await fetchDemoPeople().catch(() => [] as DemoAccount[]);
        for (const a of list) {
          const p = a.people.find((x) => x.user_id === userId);
          if (p) {
            me = p;
            account = a.name;
            break;
          }
        }
      }
      if (live) setState({ me, account, testMode: !!home });
    })();
    return () => {
      live = false;
    };
  }, [userId, tick]);
  return state;
}

export async function functionError(e: unknown): Promise<Error> {
  const ctx = (e as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const b = (await ctx.json()) as { error?: string };
      if (b.error) return new Error(b.error);
    } catch {
      /* gövde okunamadı */
    }
  }
  return new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
}
