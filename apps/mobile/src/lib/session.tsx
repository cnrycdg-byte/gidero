import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';
import type { Membership } from './types';

type Ctx = {
  ready: boolean;
  session: Session | null;
  userId: string | null;
  memberships: Membership[];
  active: Membership | null;
  setActiveCompany: (id: string) => void;
  reloadMemberships: () => Promise<void>;
  hasRole: (role: string) => boolean;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [membershipsReady, setMembershipsReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const reloadMemberships = useCallback(async () => {
    if (!userId) {
      setMemberships([]);
      setMembershipsReady(true);
      return;
    }
    const { data } = await supabase
      .from('memberships')
      .select('company_id, roles, companies(id, legal_name, tax_number)')
      .eq('user_id', userId)
      .eq('status', 'active');
    const list = ((data ?? []) as unknown as Membership[]).filter((m) => m.companies);
    setMemberships(list);
    setActiveId((cur) => (cur && list.some((m) => m.company_id === cur) ? cur : list[0]?.company_id ?? null));
    setMembershipsReady(true);
  }, [userId]);

  useEffect(() => {
    setMembershipsReady(false);
    reloadMemberships();
  }, [reloadMemberships]);

  const active = memberships.find((m) => m.company_id === activeId) ?? null;

  const value = useMemo<Ctx>(
    () => ({
      ready: authReady && (!userId || membershipsReady),
      session,
      userId,
      memberships,
      active,
      setActiveCompany: setActiveId,
      reloadMemberships,
      hasRole: (role) => !!active?.roles.includes(role),
    }),
    [authReady, membershipsReady, session, userId, memberships, active, reloadMemberships],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession SessionProvider içinde kullanılmalı');
  return ctx;
}
