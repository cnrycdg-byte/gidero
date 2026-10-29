import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { InviteLink } from '@/components/invite-link';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle, Slip } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { adminAccounts, adminPeople, ROLE_TEXT, type AdminAccount, type Person } from '@/lib/admin';
import { daysLeft, fetchPlans, ORDER_STATUS, STATUS_TEXT, type Order, type Plan } from '@/lib/billing';
import { dateInput, dateText, money, parseDate } from '@/lib/format';
import { confirm } from '@/lib/confirm';
import { ownerLink } from '@/lib/people';
import { errorText, supabase } from '@/lib/supabase';

type Status = 'trial' | 'active' | 'canceled' | 'expired';

const addDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return d.toISOString().slice(0, 10);
};

// Müşteri detayı: abonelik (elle paket verme, deneme uzatma), firmalar ve kişiler, siparişler
export default function AdminAccountScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const [link, setLink] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const c = useColors();
  const [acc, setAcc] = useState<AdminAccount | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ plan: string | null; status: Status; period: 'month' | 'year'; seats: string; end: string; note: string }>({
    plan: null, status: 'active', period: 'year', seats: '', end: '', note: '',
  });

  const load = useCallback(async () => {
    try {
      const [all, ppl, ps, ord] = await Promise.all([
        adminAccounts(),
        adminPeople(id),
        fetchPlans(),
        supabase.from('orders').select('*').eq('account_id', id).order('created_at', { ascending: false }),
      ]);
      const a = all.find((x) => x.account_id === id) ?? null;
      setAcc(a);
      setPeople(ppl);
      setPlans(ps);
      setOrders((ord.data ?? []) as Order[]);
      if (a) {
        setForm({
          plan: a.plan_id,
          status: a.status,
          period: 'year',
          seats: a.max_users ? String(a.max_users) : '',
          end: dateInput(a.ends_at ?? addDays(14)),
          note: '',
        });
      }
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const kindPlans = plans.filter((p) => p.kind === acc?.kind);
  const byCompany = useMemo(() => {
    const map = new Map<string, Person[]>();
    people.forEach((p) => {
      const k = p.company_name;
      map.set(k, [...(map.get(k) ?? []), p]);
    });
    return [...map.entries()];
  }, [people]);

  async function setSubscription(patch?: Partial<typeof form>) {
    const f = { ...form, ...patch };
    const end = parseDate(f.end);
    if (!end) return setError('Bitiş tarihini GG.AA.YYYY biçiminde yazın.');
    if (f.status === 'active' && !f.plan) return setError('Ücretli abonelik için paket seçin.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_set_subscription', {
      p_account: id,
      p_plan: f.plan,
      p_status: f.status,
      p_period: f.status === 'trial' ? null : f.period,
      p_seats: f.seats ? Number(f.seats) : null,
      p_end: end,
      p_note: f.note || null,
    });
    setBusy(false);
    if (e) return setError(errorText(e));
    setEditing(false);
    setInfo('Abonelik güncellendi.');
    load();
  }

  async function approve(o: Order) {
    const { error: e } = await supabase.rpc('admin_approve_order', { p_order: o.id, p_note: null });
    if (e) return setError(errorText(e));
    setInfo(`Sipariş ${o.order_no} onaylandı, paket açıldı.`);
    load();
  }

  if (!acc) {
    return (
      <Page>
        {error ? <Notice tone="bad" text={error} /> : <Text style={[type.body, { color: c.muted }]}>Yükleniyor…</Text>}
      </Page>
    );
  }

  const left = daysLeft(acc.ends_at);

  return (
    <Page wide>
      {created && <Notice tone="ok" text="Müşteri açıldı. Aşağıdan hesap sahibine giriş bağlantısı oluşturup WhatsApp'tan gönderin." />}
      {link ? (
        <InviteLink link={link} name={acc.owner_email ?? "Hesap sahibi"} email={acc.owner_email ?? undefined} onClose={() => setLink(null)} />
      ) : (
        <Button
          variant="secondary"
          title="Hesap sahibine giriş bağlantısı oluştur"
          loading={linkBusy}
          onPress={async () => {
            setLinkBusy(true);
            setError(null);
            try {
              const r = await ownerLink(String(id));
              if (r.link) setLink(r.link);
              else setInfo(r.note ?? 'Hesap sahibi kendi şifresiyle girer.');
            } catch (e) {
              setError(errorText(e));
            } finally {
              setLinkBusy(false);
            }
          }}
        />
      )}
      <Stack.Screen options={{ title: acc.name }} />
      <Slip tone="deep">
        <Text style={[type.small, { color: c.onDeepMuted, fontWeight: '600' }]}>
          {acc.kind === 'bureau' ? 'Muhasebe bürosu' : 'Şirket'}, {acc.owner_email ?? 'sahibi yok'}
        </Text>
        <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 28, color: c.onDeep }}>
          {acc.status === 'trial' ? 'Ücretsiz deneme' : acc.plan_name ?? STATUS_TEXT[acc.status]}
        </Text>
        <Text style={[type.body, { color: acc.active ? c.onDeepMuted : c.gold }]}>
          {acc.active ? `${dateText(acc.ends_at)} tarihine kadar (${left} gün)` : `Süresi doldu: ${dateText(acc.ends_at)}`}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.xl, marginTop: space.sm }}>
          <Stat value={acc.kind === 'bureau' ? `${acc.companies}/${acc.max_companies ?? '∞'}` : String(acc.companies)} label="firma" />
          <Stat value={`${acc.employees}/${acc.max_users ?? '∞'}`} label={acc.kind === 'bureau' ? 'çalışan (firma başı sınır)' : 'çalışan'} />
          <Stat value={String(acc.accountants)} label="muhasebeci" />
        </View>
      </Slip>

      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}

      <SectionTitle title="Hızlı işlemler" />
      <View style={styles.actions}>
        <Button variant="secondary" title="Denemeyi 14 gün uzat" onPress={() => setSubscription({ status: 'trial', plan: null, end: dateInput(addDays((Math.max(0, left ?? 0)) + 14)) })} style={styles.action} />
        <Button variant="secondary" title="Paket ver / değiştir" onPress={() => setEditing(!editing)} style={styles.action} />
        <Button
          variant="danger"
          title="Erişimi kapat"
          onPress={() =>
            confirm('Erişim kapatılsın mı?', 'Müşteri yeni fiş giremez; kayıtları silinmez.', 'Kapat', () =>
              setSubscription({ status: 'expired', end: dateInput(addDays(-1)) }),
            )
          }
          style={styles.action}
        />
      </View>

      {editing && (
        <View style={[styles.box, { backgroundColor: c.paper }]}>
          <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Paket</Text>
          <View style={styles.chips}>
            {kindPlans.map((p) => (
              <Chip key={p.id} on={form.plan === p.id} label={p.name} onPress={() => setForm({ ...form, plan: p.id, status: 'active' })} />
            ))}
          </View>
          <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Durum</Text>
          <View style={styles.chips}>
            {(['active', 'trial', 'canceled', 'expired'] as Status[]).map((s) => (
              <Chip key={s} on={form.status === s} label={STATUS_TEXT[s]} onPress={() => setForm({ ...form, status: s })} />
            ))}
          </View>
          {form.status === 'active' && (
            <>
              <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Ödeme dönemi</Text>
              <View style={styles.chips}>
                <Chip on={form.period === 'year'} label="Yıllık" onPress={() => setForm({ ...form, period: 'year' })} />
                <Chip on={form.period === 'month'} label="Aylık" onPress={() => setForm({ ...form, period: 'month' })} />
              </View>
            </>
          )}
          {acc.kind === 'company' && form.status === 'active' && (
            <Field label="Çalışan sayısı (koltuk)" value={form.seats} onChangeText={(v) => setForm({ ...form, seats: v.replace(/\D/g, '') })} keyboardType="number-pad" />
          )}
          <Field label="Bitiş tarihi" value={form.end} onChangeText={(v) => setForm({ ...form, end: v })} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" />
          <View style={styles.chips}>
            <Chip on={false} label="+1 ay" onPress={() => setForm({ ...form, end: dateInput(addDays(30)) })} />
            <Chip on={false} label="+1 yıl" onPress={() => setForm({ ...form, end: dateInput(addDays(365)) })} />
          </View>
          <Field label="Not (müşteri görmez)" value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} placeholder="Örn. telefonla anlaşıldı, havale geldi" />
          <Button title="Kaydet" onPress={() => setSubscription()} loading={busy} />
        </View>
      )}

      <SectionTitle title={`Siparişler (${orders.length})`} />
      {orders.length === 0 ? (
        <Text style={[type.body, { color: c.muted }]}>Sipariş yok.</Text>
      ) : (
        <Group>
          {orders.map((o) => (
            <Row
              key={o.id}
              icon="receipt"
              title={`${o.order_no}: ${plans.find((p) => p.id === o.plan_id)?.name ?? o.plan_id}, ${o.billing_period === 'year' ? 'yıllık' : 'aylık'}`}
              subtitle={`${ORDER_STATUS[o.status]}, ${o.payment_method === 'card' ? 'kart' : o.payment_method === 'transfer' ? 'havale' : 'elle'}, ${dateText(o.created_at)}${o.campaign_code ? `, kod ${o.campaign_code}` : ''}`}
              value={money(o.total)}
              right={
                o.status === 'pending_payment' ? (
                  <Pressable onPress={() => approve(o)} style={[styles.approve, { backgroundColor: c.pen }]}>
                    <Text style={{ color: c.onPen, fontWeight: '600', fontSize: 13 }}>Onayla</Text>
                  </Pressable>
                ) : undefined
              }
              chevron={false}
            />
          ))}
        </Group>
      )}

      <SectionTitle title="Firmalar ve kişiler" />
      {byCompany.map(([company, list]) => (
        <View key={company} style={{ gap: space.sm }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 16, color: c.ink }}>
            {company}
            {list[0]?.tax_number ? <Text style={[type.small, { color: c.muted }]}>  VKN {list[0].tax_number}</Text> : null}
          </Text>
          <Group>
            {list.filter((p) => p.user_id).length === 0 ? (
              <Row title="Henüz kişi eklenmemiş" />
            ) : (
              list
                .filter((p) => p.user_id)
                .map((p) => (
                  <Row
                    key={`${company}-${p.user_id}`}
                    title={p.full_name || p.email || 'İsimsiz'}
                    subtitle={`${p.email ?? ''}${p.roles?.length ? `, ${p.roles.map((r) => ROLE_TEXT[r] ?? r).join(', ')}` : ''}${p.member_status === 'inactive' ? ', pasif' : ''}`}
                  />
                ))
            )}
          </Group>
        </View>
      ))}
      <Text style={[type.small, { color: c.faint }]}>Kayıt: {dateText(acc.created_at)}. Son fiş: {acc.last_activity ? dateText(acc.last_activity) : 'yok'}.</Text>
    </Page>
  );
}

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
      <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const c = useColors();
  return (
    <View>
      <Text style={{ fontFamily: fonts.display, fontSize: 20, color: c.onDeep }}>{value}</Text>
      <Text style={[type.small, { color: c.onDeepMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: { flexGrow: 1 },
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  approve: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
});
