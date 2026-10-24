import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Button, Empty, Group, Notice, Perforation, Row, SectionTitle, Slip, StatusTag } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { currentPeriod, dateText, money } from '@/lib/format';
import { useQueue } from '@/lib/queue';
import { ensureMonthReport, pickFromLibrary } from '@/lib/receipts';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import type { Report } from '@/lib/types';

export default function Home() {
  const c = useColors();
  const { userId, active, hasRole } = useSession();
  const { version, enqueue, items } = useQueue();
  const [reports, setReports] = useState<Report[]>([]);
  const [receiptCount, setReceiptCount] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<null | 'camera' | 'gallery'>(null);
  const [error, setError] = useState<string | null>(null);
  const { period, title: monthTitle } = currentPeriod();

  const load = useCallback(async () => {
    if (!userId || !active) return;
    setLoading(true);
    const [mine, approvals] = await Promise.all([
      supabase
        .from('reports')
        .select('*, expenses(count)')
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
    ]);
    const list = (mine.data ?? []) as (Report & { expenses: { count: number }[] })[];
    setReports(list);
    setReceiptCount(
      list.filter((r) => r.period === period).reduce((a, r) => a + (r.expenses?.[0]?.count ?? 0), 0),
    );
    setWaiting(approvals.count ?? 0);
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
  const inFlight = items.filter((i) => i.status !== 'failed').length;
  const monthName = monthTitle.replace(' masrafları', '');

  return (
    <>
      <Stack.Screen
        options={{
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
        <Slip>
          <View style={styles.slipHead}>
            <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>{monthName}</Text>
            <Text style={[type.small, { color: c.muted }]} numberOfLines={1}>
              {active?.companies.legal_name}
            </Text>
          </View>
          <Text style={[type.display, { color: c.ink }]} adjustsFontSizeToFit numberOfLines={1}>
            {money(monthTotal)}
          </Text>
          <Perforation />
          <View style={styles.slipFoot}>
            <Text style={[type.small, { color: c.muted }]}>
              {receiptCount} fiş
              {inFlight > 0 ? `, ${inFlight} fiş okunuyor` : ''}
            </Text>
            <Text style={[type.small, { color: c.muted }]}>
              {reports.filter((r) => r.status === 'pending').length} rapor onayda
            </Text>
          </View>
        </Slip>

        <View style={{ gap: space.sm }}>
          <Button
            size="large"
            icon="camera"
            title="Fiş çek"
            onPress={() => capture('camera')}
            loading={opening === 'camera'}
          />
          <Button
            variant="secondary"
            icon="gallery"
            title="Galeriden ekle"
            onPress={() => capture('gallery')}
            loading={opening === 'gallery'}
          />
          <Text style={[type.small, { color: c.muted, textAlign: 'center' }]}>
            Fişler “{monthTitle}” raporuna eklenir.
          </Text>
        </View>

        {error && <Notice tone="bad" text={error} />}

        {waiting > 0 && (
          <Group>
            <Row
              icon="inbox"
              title={`${waiting} rapor onayınızı bekliyor`}
              subtitle="İnceleyip onaylayın ya da iade edin"
              onPress={() => router.push('/approvals')}
            />
          </Group>
        )}

        <SectionTitle
          title="Raporlarım"
          action={
            <Pressable onPress={() => router.push('/new-report')} hitSlop={10}>
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

        {hasRole('admin') && (
          <Group>
            <Row icon="team" title="Ekibi yönet" subtitle="Çalışan ekleyin, rollerini belirleyin" onPress={() => router.push('/team')} />
          </Group>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  slipHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  slipFoot: { flexDirection: 'row', justifyContent: 'space-between' },
});
