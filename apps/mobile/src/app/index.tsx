import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { LimitBars } from '@/components/limit-bars';
import { Logo } from '@/components/logo';
import { QueueProgress } from '@/components/queue-progress';
import { Text } from '@/components/text';
import { Button, Empty, Group, Notice, Perforation, Row, SectionTitle, Slip, StatusTag } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { currentPeriod, dateText, money } from '@/lib/format';
import { accountStatus, daysLeft, type AccountStatus } from '@/lib/billing';
import { fetchUsage, usageState, type Usage } from '@/lib/limits';
import { useQueue } from '@/lib/queue';
import { ensureMonthReport, pickFromLibrary } from '@/lib/receipts';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { ROLE_LABEL, type Report } from '@/lib/types';

type CategorySum = { name: string; total: number };

export default function Home() {
  const c = useColors();
  const { userId, active, hasRole, session, memberships, bureaus, platformAdmin } = useSession();
  const { version, enqueue, items } = useQueue();
  const [reports, setReports] = useState<Report[]>([]);
  const [receiptCount, setReceiptCount] = useState(0);
  const [byCategory, setByCategory] = useState<CategorySum[]>([]);
  const [limits, setLimits] = useState<Usage[]>([]);
  const [sub, setSub] = useState<AccountStatus | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<null | 'camera' | 'gallery'>(null);
  const [error, setError] = useState<string | null>(null);
  const { period, title: monthTitle } = currentPeriod();

  const load = useCallback(async () => {
    if (!userId || !active) return;
    setLoading(true);
    const [mine, approvals, spend] = await Promise.all([
      supabase
        .from('reports')
        .select('*')
        .eq('company_id', active.company_id)
        .or(`owner_user_id.eq.${userId},created_by.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', active.company_id)
        .eq('status', 'pending')
        .contains('current_approver_ids', [userId]),
      supabase
        .from('expenses')
        .select('total, categories(name), reports!inner(period, owner_user_id)')
        .eq('company_id', active.company_id)
        .eq('reports.period', period)
        .eq('reports.owner_user_id', userId),
    ]);
    setReports((mine.data ?? []) as Report[]);
    setWaiting(approvals.count ?? 0);
    const rows = (spend.data ?? []) as unknown as { total: number; categories: { name: string } | null }[];
    setReceiptCount(rows.length);
    const sums = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.categories?.name ?? 'Kategorisiz';
      sums.set(k, (sums.get(k) ?? 0) + Number(r.total));
    });
    setByCategory(
      [...sums.entries()]
        .map(([name, total]) => ({ name, total }))
        .filter((x) => x.total > 0)
        .sort((a, b) => b.total - a.total),
    );
    if (active.billing_account_id) {
      accountStatus(active.billing_account_id)
        .then(setSub)
        .catch(() => setSub(null));
    }
    fetchUsage(active.company_id, userId)
      .then(setLimits)
      .catch(() => setLimits([]));
    setLoading(false);
  }, [userId, active, period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    load();
  }, [version, load]);

  async function capture(source: 'camera' | 'gallery') {
    if (!userId || !active) return;
    setError(null);
    if (!active.company_active) {
      setError('Aboneliğin süresi doldu; yeni fiş girilemiyor. Ayarlar > Abonelik ve ödeme bölümünden paketi yenileyin.');
      return;
    }
    setOpening(source);
    try {
      const reportId = await ensureMonthReport(active.company_id, userId);
      if (source === 'camera') {
        router.push({ pathname: '/camera', params: { reportId, companyId: active.company_id } });
      } else {
        const uris = await pickFromLibrary();
        uris.forEach((uri) => enqueue({ reportId, companyId: active.company_id, userId, uri }));
        if (uris.length) router.push({ pathname: '/report/[id]', params: { id: reportId } });
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setOpening(null);
    }
  }

  const monthTotal = reports.filter((r) => r.period === period).reduce((a, r) => a + Number(r.total), 0);
  const inFlight = items.filter((i) => i.status === 'waiting' || i.status === 'uploading' || i.status === 'reading').length;
  const monthName = monthTitle.replace(' masrafları', '');
  const pendingCount = reports.filter((r) => r.status === 'pending').length;
  const maxCat = byCategory[0]?.total ?? 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => <Logo size={26} color={c.ink} />,
          headerTitleAlign: 'left',
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityLabel="Ayarlar">
              <Icon name="settings" size={22} color={c.pen} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Pressable onPress={() => router.push(bureaus.length ? '/clients' : '/settings')} style={styles.who}>
          <View style={[styles.avatar, { backgroundColor: c.penSoft }]}>
            <Text style={{ color: c.pen, fontWeight: '700' }}>
              {String(session?.user.user_metadata?.full_name || session?.user.email || '?').trim().charAt(0).toLocaleUpperCase('tr-TR')}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: c.ink }]} numberOfLines={1}>
              {session?.user.user_metadata?.full_name || session?.user.email}
            </Text>
            <Text style={[type.small, { color: c.muted }]} numberOfLines={1}>
              {memberships.length > 1 ? `${active?.companies.legal_name}, ` : ''}
              {(active?.roles ?? []).map((r) => ROLE_LABEL[r] ?? r).join(', ')} olarak görüyorsunuz
            </Text>
          </View>
        </Pressable>

        {platformAdmin && (
          <Pressable onPress={() => router.push('/admin')} style={[styles.trial, { backgroundColor: c.deep }]}>
            <Icon name="settings" size={16} color={c.gold} />
            <Text style={[type.small, { flex: 1, color: c.onDeep, fontWeight: '600' }]}>Gidero Yönetim Paneli: müşteriler, siparişler, paketler</Text>
            <Icon name="chevron" size={12} color={c.onDeepMuted} />
          </Pressable>
        )}

        {sub && (!sub.active || (sub.status === 'trial' && (daysLeft(sub.ends_at) ?? 99) <= 14)) && (
          <Pressable
            onPress={() => (sub.can_manage ? router.push({ pathname: '/subscription', params: { account: sub.account_id } }) : undefined)}
            style={[styles.trial, { backgroundColor: sub.active ? c.stampSoft : c.redSoft }]}>
            <Icon name={sub.active ? 'clock' : 'warning'} size={16} color={sub.active ? c.stamp : c.red} />
            <Text style={[type.small, { flex: 1, color: sub.active ? c.stamp : c.red, fontWeight: '600' }]}>
              {sub.active
                ? `Ücretsiz denemenizin bitmesine ${daysLeft(sub.ends_at)} gün kaldı.${sub.can_manage ? ' Paket seçmek için dokunun.' : ''}`
                : `Aboneliğin süresi doldu; yeni fiş girilemiyor.${sub.can_manage ? ' Yenilemek için dokunun.' : ' Yöneticinize haber verin.'}`}
            </Text>
            {sub.can_manage && <Icon name="chevron" size={12} color={sub.active ? c.stamp : c.red} />}
          </Pressable>
        )}

        <Slip tone="deep">
          <View style={styles.rowBetween}>
            <Text style={[type.small, { color: c.onDeepMuted, fontWeight: '600' }]}>{monthName} harcamanız</Text>
            {inFlight > 0 ? (
              <View style={[styles.goldPill, { backgroundColor: c.gold }]}>
                <Text style={{ color: '#3B2500', fontSize: 12, fontWeight: '700' }}>{inFlight} fiş okunuyor</Text>
              </View>
            ) : (
              <Text style={[type.small, { color: c.onDeepMuted, flexShrink: 1 }]} numberOfLines={1}>
                {active?.companies.legal_name}
              </Text>
            )}
          </View>
          <Text style={[type.display, { color: c.onDeep, fontSize: 46 }]} adjustsFontSizeToFit numberOfLines={1}>
            {money(monthTotal)}
          </Text>
          <View style={styles.statRow}>
            <Stat value={receiptCount} label="fiş" />
            <Stat value={reports.filter((r) => r.period === period).length} label="rapor" />
            <Stat value={pendingCount} label="onayda" />
          </View>
          <Perforation color="rgba(255,255,255,0.18)" />
          <View style={{ gap: space.sm, marginTop: space.xs }}>
            <Button size="large" variant="light" icon="camera" title="Fiş çek" onPress={() => capture('camera')} loading={opening === 'camera'} />
            <Button variant="ghostLight" icon="gallery" title="Galeriden ekle" onPress={() => capture('gallery')} loading={opening === 'gallery'} />
          </View>
        </Slip>

        <QueueProgress />

        {error && <Notice tone="bad" text={error} />}

        {waiting > 0 && (
          <Pressable onPress={() => router.push('/approvals')} style={[styles.approvalCard, { backgroundColor: c.stampSoft }]}>
            <View style={[styles.approvalBadge, { backgroundColor: c.gold }]}>
              <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 18, color: '#3B2500' }}>{waiting}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: c.ink }]}>Onayınızı bekleyen rapor</Text>
              <Text style={[type.small, { color: c.muted }]}>İnceleyip onaylayın ya da iade edin</Text>
            </View>
            <Icon name="chevron" size={13} color={c.muted} />
          </Pressable>
        )}

        {limits.length > 0 && (
          <>
            <SectionTitle
              title="Harcama sınırlarınız"
              action={
                limits.some((u) => usageState(u).over) ? (
                  <Text style={[type.small, { color: c.red, fontWeight: '700' }]}>Aşım var</Text>
                ) : undefined
              }
            />
            <LimitBars rows={limits} />
          </>
        )}

        {byCategory.length > 0 && (
          <>
            <SectionTitle title="Bu ay nereye harcadınız" />
            <View style={[styles.box, { backgroundColor: c.paper }]}>
              {byCategory.slice(0, 6).map((k, i) => (
                <View key={k.name} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={[type.body, { color: c.ink }]}>{k.name}</Text>
                    <Text style={[type.amount, { color: c.ink }]}>{money(k.total)}</Text>
                  </View>
                  <View style={[styles.track, { backgroundColor: c.canvas }]}>
                    <View
                      style={[
                        styles.bar,
                        { width: `${Math.max(4, (k.total / maxCat) * 100)}%`, backgroundColor: c.pen, opacity: 1 - i * 0.13 },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <SectionTitle
          title="Raporlarım"
          action={
            <Pressable onPress={() => router.push('/new-report')} hitSlop={10} style={styles.newReport}>
              <Icon name="plus" size={13} color={c.pen} />
              <Text style={{ color: c.pen, fontWeight: '600', fontSize: 15 }}>Yeni rapor</Text>
            </Pressable>
          }
        />
        {reports.length === 0 && !loading ? (
          <Empty
            icon="receipt"
            title="Henüz rapor yok"
            text="“Fiş çek”e dokunun; bu ayın raporu kendiliğinden açılır ve fişleriniz içine eklenir."
          />
        ) : (
          <Group>
            {reports.map((r) => (
              <Row
                key={r.id}
                title={r.title}
                subtitle={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <StatusTag status={r.status} />
                    <Text style={[type.small, { color: c.faint }]}>{dateText(r.created_at)}</Text>
                  </View>
                }
                value={money(r.total)}
                onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })}
              />
            ))}
          </Group>
        )}

        {(hasRole('admin') || hasRole('accountant') || hasRole('approver')) && (
          <Group>
            <Row icon="warning" title="Ekibin sınır durumu" subtitle="Kim hangi gider grubunda sınırı aştı" onPress={() => router.push('/limits')} />
            {hasRole('admin') || hasRole('accountant') ? (
              <Row icon="receipt" title="Gider grupları ve sınırlar" subtitle="Kişi başı aylık, 3 aylık, 6 aylık, yıllık sınır" onPress={() => router.push('/categories')} />
            ) : null}
            {hasRole('admin') || hasRole('accountant') ? (
              <Row icon="inbox" title="Muhasebe aktarımı" subtitle="Excel döküm, Luca ve Logo dosyası" onPress={() => router.push('/export')} />
            ) : null}
            {hasRole('admin') ? (
              <Row icon="team" title="Ekibi yönet" subtitle="Çalışan ekleyin, rollerini ve araçlarını belirleyin" onPress={() => router.push('/team')} />
            ) : null}
          </Group>
        )}
      </ScrollView>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: c.onDeep }}>{value}</Text>
      <Text style={[type.small, { color: c.onDeepMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  trial: { borderRadius: radius.md, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: -space.xs },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  statRow: { flexDirection: 'row', gap: space.xl, marginTop: space.xs },
  goldPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  approvalCard: { borderRadius: radius.lg, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  approvalBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
  newReport: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
