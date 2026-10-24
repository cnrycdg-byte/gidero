import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Group, Notice, Row } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { fetchPlans, ORDER_STATUS, type Order, type Plan } from '@/lib/billing';
import { dateText, money } from '@/lib/format';
import { confirm } from '@/lib/confirm';
import { errorText, supabase } from '@/lib/supabase';

type Filter = 'open' | 'all' | 'paid';
type Row_ = Order & { accounts?: { name: string; kind: string } | null };

// Tüm siparişler: havale/bekleyen siparişi onayla, iptal et; kartla ödenenler kendiliğinden açılır
export default function AdminOrders() {
  const c = useColors();
  const [rows, setRows] = useState<Row_[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filter, setFilter] = useState<Filter>('open');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('orders').select('*, accounts(name, kind)').order('created_at', { ascending: false }).limit(200);
    if (filter === 'open') q = q.in('status', ['pending_payment']);
    if (filter === 'paid') q = q.in('status', ['paid', 'approved']);
    const [{ data, error: e }, ps] = await Promise.all([q, fetchPlans()]);
    if (e) setError(errorText(e));
    setRows((data ?? []) as Row_[]);
    setPlans(ps);
    setLoading(false);
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function approve(o: Row_) {
    const { error: e } = await supabase.rpc('admin_approve_order', { p_order: o.id, p_note: 'Ödeme kontrol edildi' });
    if (e) return setError(errorText(e));
    setInfo(`Sipariş ${o.order_no} onaylandı; ${o.accounts?.name ?? 'müşteri'} paketi açıldı.`);
    load();
  }

  function cancel(o: Row_) {
    confirm(`Sipariş ${o.order_no} iptal edilsin mi?`, 'Ödeme gelmediyse iptal edin. Müşterinin paketi değişmez.', 'İptal et', async () => {
      const { error: e } = await supabase.rpc('admin_cancel_order', { p_order: o.id, p_note: 'Yönetici iptal etti' });
      if (e) return setError(errorText(e));
      load();
    });
  }

  const paidTotal = rows.filter((o) => o.status === 'paid' || o.status === 'approved').reduce((a, o) => a + Number(o.total), 0);

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      <View style={styles.chips}>
        {(
          [
            ['open', 'Ödeme bekleyen'],
            ['paid', 'Ödenen'],
            ['all', 'Hepsi'],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, { backgroundColor: k === filter ? c.pen : c.paper }]}>
            <Text style={{ color: k === filter ? c.onPen : c.ink, fontWeight: k === filter ? '600' : '400' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {filter !== 'open' && <Text style={[type.body, { color: c.muted }]}>Listede tahsil edilen: {money(paidTotal)} (KDV dahil)</Text>}
      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}
      {rows.length === 0 && !loading ? (
        <Text style={[type.body, { color: c.muted, textAlign: 'center' }]}>Bu listede sipariş yok.</Text>
      ) : (
        <Group>
          {rows.map((o) => (
            <View key={o.id}>
              <Row
                icon="receipt"
                iconColor={o.status === 'pending_payment' ? c.stamp : o.status === 'failed' || o.status === 'canceled' ? c.red : c.pen}
                iconBg={o.status === 'pending_payment' ? c.stampSoft : o.status === 'failed' || o.status === 'canceled' ? c.redSoft : c.penSoft}
                title={`${o.order_no}: ${o.accounts?.name ?? '—'}`}
                subtitle={`${plans.find((p) => p.id === o.plan_id)?.name ?? o.plan_id}, ${o.billing_period === 'year' ? 'yıllık' : 'aylık'}${o.seats > 1 ? `, ${o.seats} kişi` : ''}, ${ORDER_STATUS[o.status]}, ${o.payment_method === 'card' ? 'kart' : 'havale'}, ${dateText(o.created_at)}${o.campaign_code ? `, kod ${o.campaign_code}` : ''}`}
                value={money(o.total)}
                onPress={() => router.push({ pathname: '/admin/account/[id]', params: { id: o.account_id } })}
              />
              {o.status === 'pending_payment' && (
                <View style={[styles.actions, { borderTopColor: c.paperLine }]}>
                  <Pressable onPress={() => cancel(o)} style={[styles.btn, { backgroundColor: c.canvas }]}>
                    <Text style={{ color: c.red, fontWeight: '600' }}>İptal et</Text>
                  </Pressable>
                  <Pressable onPress={() => approve(o)} style={[styles.btn, { backgroundColor: c.pen }]}>
                    <Text style={{ color: c.onPen, fontWeight: '600' }}>Ödemeyi aldım, onayla</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </Group>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: space.sm, padding: space.md, paddingTop: space.sm, justifyContent: 'flex-end' },
  btn: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
});
