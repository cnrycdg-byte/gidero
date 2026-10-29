import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Field, Notice, SectionTitle } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { adminAccounts, chatSessions, fetchFinance, type AdminAccount, type ChatSession, type FinanceMonth } from '@/lib/admin';
import { daysLeft, fetchPlans, type Plan } from '@/lib/billing';
import { dateText, money } from '@/lib/format';
import { useWide } from '@/lib/layout';
import { fetchBands, unitPrice, type Band } from '@/lib/pricing';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';

type Filter = 'all' | 'trial' | 'active' | 'expired' | 'bureau' | 'company' | 'orders' | 'full';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** Paket kullanım oranı: büroda firma, şirkette çalışan */
function usageOf(r: AdminAccount) {
  const used = r.kind === 'bureau' ? r.companies : r.employees;
  const max = r.kind === 'bureau' ? r.max_companies : r.max_users;
  return { used, max, ratio: max ? used / max : 0, label: r.kind === 'bureau' ? 'firma' : 'çalışan' };
}

/** Aylık tekrar eden gelir: yıllık ödemedeki aylık fiyat × kademe × adet (KDV hariç) */
function mrrOf(r: AdminAccount, plans: Plan[], bands: Band[]) {
  if (!r.active || r.status !== 'active') return 0;
  const p = plans.find((x) => x.id === r.plan_id);
  if (!p) return 0;
  const qty = p.unit === 'user' ? (r.max_users ?? 1) : p.unit === 'company' ? (r.max_companies ?? 1) : 1;
  const own = bands.filter((b) => b.plan_id === p.id);
  return unitPrice(Number(p.price_yearly_monthly), own, qty) * (p.unit === 'account' ? 1 : qty);
}

// Gidero yönetim paneli: bugün ne yapılmalı, para nasıl gidiyor, müşteriler nerede
export default function AdminHome() {
  const c = useColors();
  const wide = useWide();
  const { active } = useSession();
  const [rows, setRows] = useState<AdminAccount[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [months, setMonths] = useState<FinanceMonth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
      const [a, p, b, f, ch] = await Promise.all([
        adminAccounts(),
        fetchPlans(),
        fetchBands(),
        fetchFinance(from, now.toISOString().slice(0, 10)).catch(() => null),
        chatSessions().catch(() => [] as ChatSession[]),
      ]);
      setRows(a);
      setPlans(p);
      setBands(b);
      setMonths(f?.months ?? []);
      setChats(ch);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const s = useMemo(() => {
    const paying = rows.filter((r) => r.status === 'active' && r.active);
    const trial = rows.filter((r) => r.status === 'trial' && r.active);
    const endingTrials = trial.filter((r) => (daysLeft(r.ends_at) ?? 99) <= 3).sort((a, b) => Date.parse(a.ends_at ?? '') - Date.parse(b.ends_at ?? ''));
    const renewals = paying.filter((r) => (daysLeft(r.ends_at) ?? 99) <= 14);
    const lapsed = rows.filter((r) => !r.active && (daysLeft(r.ends_at) ?? -999) >= -30);
    const full = rows.filter((r) => r.active && usageOf(r).max && usageOf(r).ratio >= 0.8);
    const orders = rows.filter((r) => r.open_orders > 0);
    const mrr = rows.reduce((a, r) => a + mrrOf(r, plans, bands), 0);
    const waitingChats = chats.filter((x) => x.needs_human && !x.handled);
    return { paying, trial, endingTrials, renewals, lapsed, full, orders, mrr, waitingChats };
  }, [rows, plans, bands, chats]);

  const thisMonth = months.at(-1);
  const counts: Record<Filter, number> = {
    all: rows.length,
    orders: s.orders.length,
    trial: s.trial.length,
    active: s.paying.length,
    expired: rows.filter((r) => !r.active).length,
    full: s.full.length,
    bureau: rows.filter((r) => r.kind === 'bureau').length,
    company: rows.filter((r) => r.kind === 'company').length,
  };
  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Hepsi' },
    { key: 'active', label: 'Ücretli' },
    { key: 'trial', label: 'Denemede' },
    { key: 'orders', label: 'Siparişi olan' },
    { key: 'full', label: 'Sınıra yakın' },
    { key: 'expired', label: 'Süresi dolan' },
    { key: 'company', label: 'Şirketler' },
    { key: 'bureau', label: 'Bürolar' },
  ];

  const list = rows.filter((r) => {
    const t = q.trim().toLocaleLowerCase('tr-TR');
    if (t && !`${r.name} ${r.owner_email ?? ''}`.toLocaleLowerCase('tr-TR').includes(t)) return false;
    switch (filter) {
      case 'trial':
        return r.status === 'trial' && r.active;
      case 'active':
        return r.status === 'active' && r.active;
      case 'expired':
        return !r.active;
      case 'bureau':
      case 'company':
        return r.kind === filter;
      case 'orders':
        return r.open_orders > 0;
      case 'full':
        return s.full.includes(r);
      default:
        return true;
    }
  });

  const openAccount = (r: AdminAccount) => router.push({ pathname: '/admin/account/[id]', params: { id: r.account_id } });

  // Bugün yapılacaklar: her satır bir iş, dokununca ilgili ekrana gider
  type Todo = { key: string; icon: IconName; tone: 'bad' | 'warn' | 'info'; title: string; text: string; onPress: () => void };
  const todos: Todo[] = [
    ...(s.orders.length
      ? [{ key: 'orders', icon: 'inbox' as IconName, tone: 'warn' as const, title: `${s.orders.length} sipariş onay bekliyor`, text: s.orders.slice(0, 3).map((r) => r.name).join(', '), onPress: () => router.push('/admin/orders') }]
      : []),
    ...s.endingTrials.map((r) => ({
      key: `t-${r.account_id}`,
      icon: 'clock' as IconName,
      tone: 'bad' as const,
      title: `${r.name}: deneme ${(daysLeft(r.ends_at) ?? 0) <= 0 ? 'bugün' : `${daysLeft(r.ends_at)} gün sonra`} bitiyor`,
      text: `${usageOf(r).used} ${usageOf(r).label} kullanıyor${r.owner_email ? `. Arayın ya da yazın: ${r.owner_email}` : ''}`,
      onPress: () => openAccount(r),
    })),
    ...s.renewals.map((r) => ({
      key: `r-${r.account_id}`,
      icon: 'clock' as IconName,
      tone: 'info' as const,
      title: `${r.name}: üyelik ${dateText(r.ends_at)} yenilenecek`,
      text: `${r.plan_name ?? 'Paket'}; yenileme hatırlatması gönderin`,
      onPress: () => openAccount(r),
    })),
    ...s.full.map((r) => ({
      key: `f-${r.account_id}`,
      icon: 'team' as IconName,
      tone: 'info' as const,
      title: `${r.name}: paketin %${Math.round(usageOf(r).ratio * 100)}'i dolu`,
      text: `${usageOf(r).used}/${usageOf(r).max} ${usageOf(r).label}. Paketi büyütmeyi önerin.`,
      onPress: () => openAccount(r),
    })),
    ...(s.waitingChats.length
      ? [{ key: 'chats', icon: 'send' as IconName, tone: 'warn' as const, title: `${s.waitingChats.length} site sohbeti sizi bekliyor`, text: s.waitingChats.find((x) => x.contact)?.contact ?? 'Ziyaretçi bir insanla konuşmak istedi', onPress: () => router.push('/admin/chats') }]
      : []),
    ...s.lapsed.map((r) => ({
      key: `l-${r.account_id}`,
      icon: 'warning' as IconName,
      tone: 'warn' as const,
      title: `${r.name}: üyelik ${dateText(r.ends_at)} bitti`,
      text: 'Verisi duruyor; geri kazanmak için arayın ya da kampanya kodu verin',
      onPress: () => openAccount(r),
    })),
  ];

  const maxRev = Math.max(1, ...months.map((m) => m.revenue));
  const toneColor = (t: Todo['tone']) => (t === 'bad' ? c.red : t === 'warn' ? c.amber : c.pen);
  const toneBg = (t: Todo['tone']) => (t === 'bad' ? c.redSoft : t === 'warn' ? c.amberSoft : c.penSoft);

  const actions: { icon: IconName; label: string; to: string; primary?: boolean }[] = [
    { icon: 'personAdd', label: 'Müşteri ekle', to: '/admin/new-customer', primary: true },
    { icon: 'receipt', label: 'Fiyatlar', to: '/admin/plans' },
    { icon: 'inbox', label: 'Siparişler', to: '/admin/orders' },
    { icon: 'doc', label: 'Gelir ve gider', to: '/admin/finance' },
    { icon: 'plus', label: 'Kampanyalar', to: '/admin/campaigns' },
    { icon: 'send', label: 'Site sohbetleri', to: '/admin/chats' },
    { icon: 'team', label: 'Test sürüşü', to: '/test' },
  ];

  const todoBlock = (
    <View style={[styles.card, { backgroundColor: c.paper }]}>
      <View style={styles.cardHead}>
        <Text style={[type.bodyStrong, { color: c.ink }]}>Bugün yapılacaklar</Text>
        <Text style={[type.small, { color: c.muted }]}>{todos.length ? `${todos.length} iş` : ''}</Text>
      </View>
      {todos.length === 0 ? (
        <Text style={[type.body, { color: c.muted }]}>Bekleyen iş yok. Biten deneme, sipariş, dolmak üzere paket ya da yanıt bekleyen sohbet olunca burada görünür.</Text>
      ) : (
        todos.slice(0, 12).map((t, i) => (
          <Pressable key={t.key} onPress={t.onPress} style={({ pressed }) => [styles.todo, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.paperLine }, pressed && { opacity: 0.7 }]}>
            <View style={[styles.todoIcon, { backgroundColor: toneBg(t.tone) }]}>
              <Icon name={t.icon} size={16} color={toneColor(t.tone)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: c.ink }]}>{t.title}</Text>
              <Text style={[type.small, { color: c.muted }]} numberOfLines={2}>{t.text}</Text>
            </View>
            <Icon name="chevron" size={14} color={c.faint} />
          </Pressable>
        ))
      )}
    </View>
  );

  const money6 = (
    <View style={[styles.card, { backgroundColor: c.paper }]}>
      <View style={styles.cardHead}>
        <Text style={[type.bodyStrong, { color: c.ink }]}>Tahsilat, son 6 ay</Text>
        <Pressable onPress={() => router.push('/admin/finance')}>
          <Text style={[type.small, { color: c.pen, fontWeight: '600' }]}>Ayrıntı</Text>
        </Pressable>
      </View>
      <View style={styles.bars} accessibilityLabel="Son altı ayın aylık tahsilatı">
        {months.slice(-6).map((m) => {
          const h = Math.max(2, Math.round((m.revenue / maxRev) * 96));
          const mm = Number(m.month.slice(5, 7)) - 1;
          return (
            <View key={m.month} style={styles.barCol}>
              <Text style={[type.small, { color: c.muted, fontSize: 12 }]}>{m.revenue ? `${Math.round(m.revenue / 1000)}b` : ''}</Text>
              <View style={[styles.bar, { height: h, backgroundColor: m === thisMonth ? c.pen : c.penSoft }]} />
              <Text style={[type.small, { color: c.muted, fontSize: 12 }]}>{MONTHS[mm] ?? m.month}</Text>
            </View>
          );
        })}
        {months.length === 0 ? <Text style={[type.small, { color: c.muted }]}>Henüz tahsilat yok.</Text> : null}
      </View>
      {thisMonth ? (
        <Text style={[type.small, { color: c.muted }]}>{`Bu ay ${money(thisMonth.revenue)} tahsilat, ${money(thisMonth.expense)} gider, ${money(thisMonth.profit)} kâr (KDV hariç).`}</Text>
      ) : null}
    </View>
  );

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      {error && <Notice tone="bad" text={error} />}

      <View style={styles.headRow}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text style={[type.title, { color: c.ink }]}>Gidero yönetim</Text>
          <Text style={[type.small, { color: c.muted }]}>{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>
        {active && (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={[styles.chip, { backgroundColor: c.paper }]}>
            <Text style={{ color: c.ink, fontWeight: '600' }}>Kendi şirket ekranıma geç</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.actions}>
        {actions.map((a) => (
          <Pressable
            key={a.to}
            onPress={() => router.push(a.to as never)}
            style={({ pressed }) => [styles.action, { backgroundColor: a.primary ? c.pen : c.paper, opacity: pressed ? 0.8 : 1 }]}>
            <Icon name={a.icon} size={15} color={a.primary ? c.onPen : c.pen} />
            <Text style={{ color: a.primary ? c.onPen : c.ink, fontWeight: '600' }}>{a.label}</Text>
            {a.to === '/admin/orders' && s.orders.length ? <Text style={{ color: c.red, fontWeight: '700' }}>{String(s.orders.length)}</Text> : null}
          </Pressable>
        ))}
      </View>

      <View style={styles.kpis}>
        <Kpi label="Aylık tekrar eden gelir" value={money(s.mrr)} hint="Ücretli üyelikler, KDV hariç" strong />
        <Kpi label="Bu ay tahsilat" value={money(thisMonth?.revenue ?? 0)} hint={thisMonth ? `Kâr ${money(thisMonth.profit)}` : undefined} />
        <Kpi label="Ücretli müşteri" value={String(s.paying.length)} hint={`${rows.filter((r) => r.kind === 'company' && r.status === 'active' && r.active).length} şirket, ${rows.filter((r) => r.kind === 'bureau' && r.status === 'active' && r.active).length} büro`} />
        <Kpi label="Denemede" value={String(s.trial.length)} hint={s.endingTrials.length ? `${s.endingTrials.length} tanesi 3 gün içinde bitiyor` : 'Yakında biten yok'} warn={s.endingTrials.length > 0} />
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.lg, alignItems: 'flex-start' }}>
        <View style={{ flex: wide ? 1.4 : undefined, width: wide ? undefined : '100%' }}>{todoBlock}</View>
        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>{money6}</View>
      </View>

      <SectionTitle title={`Müşteriler (${list.length})`} />
      <Field label="Ara" value={q} onChangeText={setQ} placeholder="Unvan veya e-posta" autoCapitalize="none" />
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, { backgroundColor: on ? c.pen : c.paper }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{`${f.label} ${counts[f.key]}`}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: c.paper, padding: 0, gap: 0 }]}>
        {wide && (
          <View style={[styles.tr, { borderBottomColor: c.paperLine }]}>
            <Text style={[styles.th, { flex: 2.2, color: c.muted }]}>Müşteri</Text>
            <Text style={[styles.th, { flex: 1.4, color: c.muted }]}>Durum</Text>
            <Text style={[styles.th, { flex: 1.3, color: c.muted }]}>Kullanım</Text>
            <Text style={[styles.th, { flex: 1, color: c.muted }]}>Bitiş</Text>
            <Text style={[styles.th, { flex: 1, color: c.muted, textAlign: 'right' }]}>Aylık gelir</Text>
          </View>
        )}
        {list.map((r) => {
          const u = usageOf(r);
          const left = daysLeft(r.ends_at);
          const state = !r.active ? 'Süresi doldu' : r.status === 'trial' ? `Deneme, ${left} gün` : r.plan_name ?? 'Ücretli';
          const dot = !r.active ? c.red : r.status === 'trial' ? c.amber : c.pen;
          const mrr = mrrOf(r, plans, bands);
          return (
            <Pressable key={r.account_id} onPress={() => openAccount(r)} style={({ pressed }) => [styles.tr, { borderBottomColor: c.paperLine, flexWrap: wide ? 'nowrap' : 'wrap' }, pressed && { backgroundColor: c.canvas }]}>
              <View style={{ flex: wide ? 2.2 : undefined, width: wide ? undefined : '100%' }}>
                <Text style={[type.bodyStrong, { color: c.ink }]} numberOfLines={1}>{r.name}</Text>
                <Text style={[type.small, { color: c.muted }]} numberOfLines={1}>{`${r.kind === 'bureau' ? 'Büro' : 'Şirket'}${r.owner_email ? `, ${r.owner_email}` : ''}${r.open_orders ? `, ${r.open_orders} sipariş` : ''}`}</Text>
              </View>
              <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.dot, { backgroundColor: dot }]} />
                <Text style={[type.small, { color: c.ink }]} numberOfLines={1}>{state}</Text>
              </View>
              <View style={{ flex: 1.3, gap: 3 }}>
                <Text style={[type.small, { color: c.muted }]}>{`${u.used}/${u.max ?? '∞'} ${u.label}`}</Text>
                <View style={[styles.track, { backgroundColor: c.canvas }]}>
                  <View style={{ width: `${Math.min(100, Math.round(u.ratio * 100))}%`, height: '100%', borderRadius: 3, backgroundColor: u.ratio >= 1 ? c.red : u.ratio >= 0.8 ? c.amber : c.pen }} />
                </View>
              </View>
              <Text style={[type.small, { flex: 1, color: left != null && left <= 7 && r.active ? c.red : c.muted }]}>{r.ends_at ? dateText(r.ends_at) : ''}</Text>
              <Text style={[type.small, { flex: 1, textAlign: 'right', color: c.ink, fontFamily: fonts.display }]}>{mrr ? money(mrr) : ''}</Text>
            </Pressable>
          );
        })}
        {list.length === 0 && !loading && <Text style={[type.body, { color: c.muted, textAlign: 'center', padding: space.lg }]}>Bu filtrede müşteri yok.</Text>}
      </View>
    </Page>
  );
}

function Kpi({ label, value, hint, strong, warn }: { label: string; value: string; hint?: string; strong?: boolean; warn?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.kpi, { backgroundColor: strong ? c.deep : c.paper }]}>
      <Text style={[type.small, { color: strong ? c.onDeepMuted : c.muted }]}>{label}</Text>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 26, color: strong ? c.onDeep : c.ink }}>{value}</Text>
      {hint ? <Text style={[type.small, { color: warn ? c.amber : strong ? c.onDeepMuted : c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kpi: { flexGrow: 1, flexBasis: 160, borderRadius: radius.lg, padding: space.lg, gap: 2 },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.sm, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10 },
  todoIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, height: 140, paddingTop: space.sm },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '70%', borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  th: { fontSize: 13, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
});
