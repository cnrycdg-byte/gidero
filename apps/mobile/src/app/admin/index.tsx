import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { adminAccounts, monthlyRevenue, type AdminAccount } from '@/lib/admin';
import { daysLeft, fetchPlans, type Plan } from '@/lib/billing';
import { dateText, money } from '@/lib/format';
import { errorText } from '@/lib/supabase';

type Filter = 'all' | 'trial' | 'active' | 'expired' | 'bureau' | 'company' | 'orders';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Hepsi' },
  { key: 'orders', label: 'Siparişi olan' },
  { key: 'trial', label: 'Denemede' },
  { key: 'active', label: 'Ücretli' },
  { key: 'expired', label: 'Süresi dolan' },
  { key: 'bureau', label: 'Bürolar' },
  { key: 'company', label: 'Şirketler' },
];

// Gidero sahibinin paneli: tüm müşteriler, gelir, denemeler, bekleyen siparişler
export default function AdminHome() {
  const c = useColors();
  const [rows, setRows] = useState<AdminAccount[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, p] = await Promise.all([adminAccounts(), fetchPlans()]);
      setRows(a);
      setPlans(p);
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

  const stats = useMemo(() => {
    const paying = rows.filter((r) => r.status === 'active' && r.active);
    const trial = rows.filter((r) => r.status === 'trial' && r.active);
    const ending = trial.filter((r) => (daysLeft(r.ends_at) ?? 99) <= 3);
    const expired = rows.filter((r) => !r.active);
    const orders = rows.reduce((a, r) => a + r.open_orders, 0);
    const mrr = monthlyRevenue(rows, plans, (a) => a.max_users ?? 1);
    return { paying: paying.length, trial: trial.length, ending: ending.length, expired: expired.length, orders, mrr };
  }, [rows, plans]);

  const ending = rows
    .filter((r) => r.active && r.ends_at && (daysLeft(r.ends_at) ?? 99) <= 30)
    .sort((a, b) => Date.parse(a.ends_at!) - Date.parse(b.ends_at!));

  const list = rows.filter((r) => {
    const t = q.trim().toLocaleLowerCase('tr-TR');
    if (t && !(`${r.name} ${r.owner_email ?? ''}`.toLocaleLowerCase('tr-TR').includes(t))) return false;
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
      default:
        return true;
    }
  });

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      {error && <Notice tone="bad" text={error} />}

      <View style={styles.kpis}>
        <Kpi label="Aylık gelir (tahmini, KDV hariç)" value={money(stats.mrr)} big />
        <Kpi label="Ücretli müşteri" value={String(stats.paying)} />
        <Kpi label="Denemede" value={String(stats.trial)} hint={stats.ending ? `${stats.ending} tanesi 3 gün içinde bitiyor` : undefined} />
        <Kpi label="Süresi dolan" value={String(stats.expired)} tone={stats.expired ? 'bad' : undefined} />
      </View>

      <Group>
        <Row
          icon="inbox"
          title="Siparişler"
          subtitle={stats.orders ? `${stats.orders} sipariş onay veya ödeme bekliyor` : 'Tüm siparişler ve onaylar'}
          onPress={() => router.push('/admin/orders')}
        />
        <Row icon="personAdd" title="Yeni müşteri ekle" subtitle="Şirket ya da büro; paket, bitiş tarihi, tahsilat" onPress={() => router.push('/admin/new-customer')} />
        <Row icon="doc" title="Gelir ve gider" subtitle="Aylık gelir, giderler, kâr, tahsil edilen KDV" onPress={() => router.push('/admin/finance')} />
        <Row icon="receipt" title="Paketler ve fiyatlar" subtitle="Şirket ve büro paketleri, limitler" onPress={() => router.push('/admin/plans')} />
        <Row icon="plus" title="Kampanyalar" subtitle="İndirim kodları, hediye süre" onPress={() => router.push('/admin/campaigns')} />
        <Row icon="send" title="Site sohbetleri" subtitle="Ziyaretçiler ne sordu, ne yanıt verildi" onPress={() => router.push('/admin/chats')} />
      </Group>

      {ending.length > 0 && (
        <>
          <SectionTitle title={`30 gün içinde bitecek üyelikler (${ending.length})`} />
          <Group>
            {ending.map((r) => {
              const left = daysLeft(r.ends_at) ?? 0;
              return (
                <Row
                  key={r.account_id}
                  icon="clock"
                  iconColor={left <= 7 ? c.red : c.stamp}
                  iconBg={left <= 7 ? c.redSoft : c.stampSoft}
                  title={r.name}
                  subtitle={`${r.status === 'trial' ? 'Deneme' : r.plan_name ?? 'Paket'}, ${dateText(r.ends_at)} bitiyor${r.owner_email ? `, ${r.owner_email}` : ''}`}
                  value={left <= 0 ? 'Bugün' : `${left} gün`}
                  onPress={() => router.push({ pathname: '/admin/account/[id]', params: { id: r.account_id } })}
                />
              );
            })}
          </Group>
        </>
      )}

      <SectionTitle title={`Müşteriler (${list.length})`} />
      <Field label="Ara" value={q} onChangeText={setQ} placeholder="Unvan veya e-posta" autoCapitalize="none" />
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, { backgroundColor: on ? c.pen : c.paper }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Group>
        {list.map((r) => {
          const left = daysLeft(r.ends_at);
          const usage =
            r.kind === 'bureau'
              ? `${r.companies}/${r.max_companies ?? '∞'} firma`
              : `${r.employees}/${r.max_users ?? '∞'} çalışan`;
          const state = !r.active
            ? 'Süresi doldu'
            : r.status === 'trial'
              ? `Deneme, ${left} gün`
              : `${r.plan_name}, ${dateText(r.ends_at)}`;
          return (
            <Row
              key={r.account_id}
              icon={r.kind === 'bureau' ? 'doc' : 'team'}
              iconColor={!r.active ? c.red : r.status === 'trial' ? c.stamp : c.pen}
              iconBg={!r.active ? c.redSoft : r.status === 'trial' ? c.stampSoft : c.penSoft}
              title={r.name}
              subtitle={`${r.kind === 'bureau' ? 'Büro' : 'Şirket'}, ${state}, ${usage}${r.open_orders ? `, ${r.open_orders} sipariş` : ''}`}
              onPress={() => router.push({ pathname: '/admin/account/[id]', params: { id: r.account_id } })}
            />
          );
        })}
      </Group>
      {list.length === 0 && !loading && <Text style={[type.body, { color: c.muted, textAlign: 'center' }]}>Bu filtrede müşteri yok.</Text>}
    </Page>
  );
}

function Kpi({ label, value, hint, big, tone }: { label: string; value: string; hint?: string; big?: boolean; tone?: 'bad' }) {
  const c = useColors();
  return (
    <View style={[styles.kpi, { backgroundColor: big ? c.deep : c.paper, flexBasis: big ? '100%' : '30%' }]}>
      <Text style={[type.small, { color: big ? c.onDeepMuted : c.muted }]}>{label}</Text>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: big ? 34 : 26, color: big ? c.onDeep : tone === 'bad' ? c.red : c.ink }}>{value}</Text>
      {hint ? <Text style={[type.small, { color: c.amber }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kpi: { flexGrow: 1, borderRadius: radius.lg, padding: space.lg, gap: 2, minWidth: 100 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
});
