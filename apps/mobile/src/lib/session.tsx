import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { BrandContext } from '@/constants/theme';
import { supabase } from './supabase';
import type { Membership } from './types';

export type Bureau = { account_id: string; name: string; role: 'owner' | 'accountant' };

type Ctx = {
  ready: boolean;
  session: Session | null;
  userId: string | null;
  /** Erişilen firmalar (kendi üyelikleri + büro müşterileri) */
  memberships: Membership[];
  bureaus: Bureau[];
  platformAdmin: boolean;
  active: Membership | null;
  setActiveCompany: (id: string) => void;
  reloadMemberships: () => Promise<void>;
  hasRole: (role: string) => boolean;
  /** Şifre yenileme bağlantısıyla gelindi: yeni şifre istenir */
  recovery: boolean;
  /** Davet bağlantısıyla ilk giriş */
  invite: boolean;
  finishRecovery: () => void;
  /** Bağlantı geçersiz ya da süresi dolmuşsa giriş ekranında gösterilir */
  authNotice: string | null;
};

/** Web'de e-posta bağlantısından dönüşte adres çubuğundaki oturum bilgisini okur ve adresten siler. */
async function consumeAuthRedirect(): Promise<{ recovery: boolean; notice: string | null; invite?: boolean }> {
  if (typeof window === 'undefined' || !window.location) return { recovery: false, notice: null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const clean = () => window.history?.replaceState?.(null, '', window.location.pathname);
  // Davet bağlantısı (yöneticinin WhatsApp'tan yolladığı): kişi şifresini belirler
  const davet = query.get('davet');
  if (davet) {
    clean();
    const { error } = await supabase.auth.verifyOtp({ token_hash: davet, type: 'recovery' });
    if (error) return { recovery: false, notice: 'Davet bağlantısının süresi dolmuş ya da kullanılmış. Yöneticinizden yeni bağlantı isteyin.' };
    return { recovery: true, notice: null, invite: true };
  }
  const err = hash.get('error_description') || query.get('error_description');
  if (err) {
    clean();
    return { recovery: false, notice: 'Bağlantının süresi dolmuş ya da daha önce kullanılmış. "Şifremi unuttum" ile yeni bağlantı isteyin.' };
  }
  const access = hash.get('access_token');
  const refresh = hash.get('refresh_token');
  if (access && refresh) {
    clean();
    const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
    if (error) return { recovery: false, notice: 'Bağlantı geçersiz. "Şifremi unuttum" ile yeni bağlantı isteyin.' };
    return { recovery: hash.get('type') === 'recovery', notice: null };
  }
  const code = query.get('code');
  if (code) {
    clean();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { recovery: false, notice: 'Bağlantı geçersiz. "Şifremi unuttum" ile yeni bağlantı isteyin.' };
  }
  return { recovery: false, notice: null };
}

const SessionContext = createContext<Ctx | null>(null);

type WorkspaceCompany = {
  company_id: string;
  legal_name: string;
  tax_number: string;
  roles: string[];
  vehicle_plates: string[];
  bureau_account_id: string | null;
  billing_account_id: string;
  active: boolean;
  brand_primary?: string | null;
  brand_accent?: string | null;
  logo_path?: string | null;
  phase?: 'active' | 'grace' | 'locked';
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [bureaus, setBureaus] = useState<Bureau[]>([]);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [membershipsReady, setMembershipsReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [invite, setInvite] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await consumeAuthRedirect().catch(() => ({ recovery: false, notice: null }));
      setRecovery(r.recovery);
      setInvite(!!(r as { invite?: boolean }).invite);
      setAuthNotice(r.notice);
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setAuthReady(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') {
        setRecovery(false);
        setInvite(false);
      }
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const reloadMemberships = useCallback(async () => {
    if (!userId) {
      setMemberships([]);
      setBureaus([]);
      setPlatformAdmin(false);
      setMembershipsReady(true);
      return;
    }
    // Gidero sahibinin hesabı ilk girişte yönetici olarak tanınır (sunucu doğrular)
    await supabase.rpc('claim_platform_admin').then(
      () => {},
      () => {},
    );
    const { data, error } = await supabase.rpc('my_workspace');
    let list: Membership[] = [];
    if (!error && data) {
      const ws = data as { companies: WorkspaceCompany[]; bureaus: Bureau[]; platform_admin: boolean };
      list = ws.companies.map((c) => ({
        company_id: c.company_id,
        roles: c.roles,
        vehicle_plates: c.vehicle_plates ?? [],
        bureau_account_id: c.bureau_account_id,
        billing_account_id: c.billing_account_id,
        company_active: c.active,
        phase: c.phase ?? (c.active ? 'active' : 'grace'),
        companies: {
          id: c.company_id,
          legal_name: c.legal_name,
          tax_number: c.tax_number,
          brand_primary: c.brand_primary ?? null,
          brand_accent: c.brand_accent ?? null,
          logo_path: c.logo_path ?? null,
        },
      }));
      setBureaus(ws.bureaus ?? []);
      setPlatformAdmin(!!ws.platform_admin);
    } else {
      // Sunucu henüz güncellenmediyse eski sorgu
      const { data: rows } = await supabase
        .from('memberships')
        .select('company_id, roles, companies(id, legal_name, tax_number)')
        .eq('user_id', userId)
        .eq('status', 'active');
      list = ((rows ?? []) as unknown as Membership[])
        .filter((m) => m.companies)
        .map((m) => ({ ...m, vehicle_plates: [], bureau_account_id: null, billing_account_id: null, company_active: true }));
      setBureaus([]);
      setPlatformAdmin(false);
    }
    setMemberships(list);
    setActiveId((cur) => (cur && list.some((m) => m.company_id === cur) ? cur : list[0]?.company_id ?? null));
    setMembershipsReady(true);
  }, [userId]);

  useEffect(() => {
    setMembershipsReady(false);
    reloadMemberships();
  }, [reloadMemberships]);

  const active = memberships.find((m) => m.company_id === activeId) ?? null;

  // Seçili şirketin renkleri tüm ekranlara uygulanır; şirket değişince palet de değişir
  const brandPrimary = active?.companies.brand_primary ?? null;
  const brandAccent = active?.companies.brand_accent ?? null;
  // Gidero yöneticisi her zaman Gidero renklerini görür (müşteri firmalarının rengini değiştirmek onu etkilemez)
  const brand = useMemo(
    () => (platformAdmin ? { primary: null, accent: null } : { primary: brandPrimary, accent: brandAccent }),
    [brandPrimary, brandAccent, platformAdmin],
  );

  const value = useMemo<Ctx>(
    () => ({
      ready: authReady && (!userId || membershipsReady),
      session,
      userId,
      memberships,
      bureaus,
      platformAdmin,
      active,
      setActiveCompany: setActiveId,
      reloadMemberships,
      hasRole: (role) => !!active?.roles.includes(role),
      recovery,
      invite,
      finishRecovery: () => setRecovery(false),
      authNotice,
    }),
    [authReady, membershipsReady, session, userId, memberships, bureaus, platformAdmin, active, reloadMemberships, recovery, invite, authNotice],
  );

  return (
    <SessionContext.Provider value={value}>
      <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession SessionProvider içinde kullanılmalı');
  return ctx;
}
