import { Link, router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Label, Pill } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { currentPeriod, dateText, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { STATUS_LABEL, statusTone, type Report } from '@/lib/types';

export default function Home() {
  const c = useColors();
  const { userId, active, hasRole } = useSession();
  const [reports, setReports] = useState<Report[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !active) return;
    setLoading(true);
    const [mine, approvals] = await Promise.all([
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
    ]);
    setReports((mine.data ?? []) as Report[]);
    setWaiting(approvals.count ?? 0);
    setLoading(false);
  }, [userId, active]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const { period } = currentPeriod();
  const monthTotal = reports.filter((r) => r.period === period).reduce((a, r) => a + Number(r.total), 0);
  const openCount = reports.filter((r) => r.status === 'draft' || r.status === 'returned').length;
  const pendingCount = reports.filter((r) => r.status === 'pending').length;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityLabel="Ayarlar">
              <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>Ayarlar</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Body muted>{active?.companies.legal_name}</Body>

        <Card>
          <Label>Bu ay harcadığınız</Label>
          <Text style={[type.amount, { color: c.text }]}>{money(monthTotal)}</Text>
          <View style={styles.statRow}>
            <Stat label="Açık rapor" value={openCount} />
            <Stat label="Onayda" value={pendingCount} />
            <Stat label="Toplam rapor" value={reports.length} />
          </View>
        </Card>

        <Button title="Yeni masraf raporu aç" onPress={() => router.push('/new-report')} />

        {waiting > 0 && (
          <Link href="/approvals" asChild>
            <Pressable style={[styles.banner, { backgroundColor: c.infoSoft }]}>
              <Text style={{ color: c.info, fontWeight: '600', fontSize: 16 }}>
                {waiting} rapor onayınızı bekliyor
              </Text>
              <Text style={{ color: c.info }}>Aç ›</Text>
            </Pressable>
          </Link>
        )}

        <Label>Raporlarım</Label>
        {reports.length === 0 && !loading && (
          <Card>
            <Body>Henüz rapor yok.</Body>
            <Body muted>
              Bir başlık açın (örneğin “Ekim masrafları”), sonra fişlerinizi çekip içine ekleyin. Ay sonunda tek seferde
              onaya gönderin.
            </Body>
          </Card>
        )}
        {reports.map((r) => (
          <Link key={r.id} href={{ pathname: '/report/[id]', params: { id: r.id } }} asChild>
            <Pressable>
              <Card>
                <View style={styles.rowBetween}>
                  <Text style={[type.heading, { color: c.text, flex: 1 }]} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={[type.heading, { color: c.text, fontVariant: ['tabular-nums'] }]}>{money(r.total)}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Pill text={STATUS_LABEL[r.status]} tone={statusTone(r.status)} />
                  <Text style={[type.small, { color: c.muted }]}>{dateText(r.created_at)}</Text>
                </View>
              </Card>
            </Pressable>
          </Link>
        ))}

        {hasRole('admin') && <Button variant="secondary" title="Ekibi yönet" onPress={() => router.push('/team')} />}
      </ScrollView>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={[type.small, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', marginTop: space.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  banner: {
    borderRadius: radius.md,
    padding: space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
