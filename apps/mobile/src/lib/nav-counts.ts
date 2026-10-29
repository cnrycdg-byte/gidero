// Soldaki menüdeki sayılar: onay, muhasebe, ödeme, geri gönderilen rapor ve okunmamış bildirim.
// Sayfa değişince, pencereye dönünce ve dakikada bir yenilenir; sorgular RLS'ten geçer.
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { unreadCount } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type NavCounts = { approvals: number; accounting: number; payments: number; returned: number; notifications: number };
const ZERO: NavCounts = { approvals: 0, accounting: 0, payments: 0, returned: 0, notifications: 0 };

export function useNavCounts(): NavCounts {
  const { userId, active } = useSession();
  const path = usePathname();
  const [counts, setCounts] = useState<NavCounts>(ZERO);
  const seq = useRef(0);
  const company = active?.company_id ?? null;
  const roles = (active?.roles ?? []).join(',');

  const load = useCallback(async () => {
    const my = ++seq.current;
    if (!userId) return setCounts(ZERO);
    const has = (r: string) => roles.split(',').includes(r);
    const head = () => supabase.from('reports').select('id', { count: 'exact', head: true });
    const none = Promise.resolve({ count: 0 as number | null });
    const [approvals, accounting, returned, payments, notifications] = await Promise.all([
      company && (has('approver') || has('admin'))
        ? head().eq('company_id', company).eq('status', 'pending').contains('current_approver_ids', [userId])
        : none,
      company && has('accountant') ? head().eq('company_id', company).in('status', ['approved', 'booked']) : none,
      company ? head().eq('company_id', company).eq('owner_user_id', userId).eq('status', 'returned') : none,
      company && has('payer')
        ? supabase.rpc('payment_queue', { p_company: company, p_paid: false }).then(({ data }) => ({ count: ((data ?? []) as unknown[]).length }))
        : none,
      unreadCount().catch(() => 0),
    ]);
    if (my !== seq.current) return; // daha yeni bir sorgu başladıysa eskisini yazma
    setCounts({
      approvals: approvals.count ?? 0,
      accounting: accounting.count ?? 0,
      returned: returned.count ?? 0,
      payments: payments.count ?? 0,
      notifications,
    });
  }, [userId, company, roles]);

  // Sayfa değişince (ör. onay verip geri dönünce) yenile
  useEffect(() => {
    load().catch(() => {});
  }, [load, path]);

  useEffect(() => {
    const tick = setInterval(() => load().catch(() => {}), 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load().catch(() => {}));
    const onFocus = () => load().catch(() => {});
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(tick);
      sub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  return counts;
}
