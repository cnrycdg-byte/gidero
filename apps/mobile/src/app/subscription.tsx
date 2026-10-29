import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Perforation, Row, SectionTitle, Slip } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import {
  accountStatus,
  daysLeft,
  fetchPlans,
  ORDER_STATUS,
  quote,
  STATUS_TEXT,
  type AccountStatus,
  type Order,
  type Plan,
  type Quote,
} from '@/lib/billing';
import { dateText, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Period = 'month' | 'year';

// Abonelik: mevcut paket ve kullanım, paket seçimi, kampanya kodu, kartla ödeme, sipariş geçmişi
/**
 * Mağaza kuralı: telefon uygulamasında satın alma yok (B2B, şirketlere doğrudan satılır; ödeme web sitesinden).
 * Telefonda yalnızca paket durumu gösterilir; paket ve ödeme işlemleri web panelinden yapılır.
 */
export default function Subscription() {
  return Platform.OS === 'web' ? <SubscriptionWeb /> : <SubscriptionStatus />;
}

function SubscriptionStatus() {
  const c = useColors();
  const params = useLocalSearchParams<{ account?: string }>();
  const { active, bureaus } = useSession();
  const accountId = params.account ?? bureaus.find((b) => b.role === 'owner')?.account_id ?? active?.billing_account_id ?? null;
  const [st, setSt] = useState<AccountStatus | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (accountId) accountStatus(accountId).then(setSt).catch(() => setSt(null));
    }, [accountId]),
  );
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      {st ? (
        <Group>
          <Row title="Paket" value={st.plan_name ?? (st.status === 'trial' ? 'Deneme' : '-')} />
          <Row title="Durum" value={st.active ? 'Aktif' : 'Süresi doldu'} />
          {st.ends_at ? <Row title="Bitiş" value={dateText(st.ends_at)} /> : null}
          {st.kind === 'bureau' ? <Row title="Firma" value={`${st.companies_used}/${st.max_companies ?? '∞'}`} /> : <Row title="Kullanıcı" value={`${st.users_used}/${st.max_users ?? '∞'}`} />}
        </Group>
      ) : null}
      <Text style={[type.body, { color: c.muted }]}>Paket değişikliği ve ödeme işlemleri bilgisayardan, yönetim panelinden yapılır.</Text>
    </ScrollView>
  );
}

function SubscriptionWeb() {
  const c = useColors();
  const params = useLocalSearchParams<{ account?: string }>();
  const { active, bureaus, session } = useSession();
  const accountId =
    params.account ?? bureaus.find((b) => b.role === 'owner')?.account_id ?? active?.billing_account_id ?? null;

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('year');
  const [seats, setSeats] = useState(3);
  const [code, setCode] = useState('');
  const [appliedCode, setAppliedCode] = useState('');
  const [q, setQ] = useState<Quote | null>(null);
  const [qError, setQError] = useState<string | null>(null);
  const [billing, setBilling] = useState({ title: '', tax_number: '', tax_office: '', address: '', city: '', email: '', phone: '', contact_name: '' });
  const [step, setStep] = useState<'plan' | 'billing'>('plan');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    try {
      const st = await accountStatus(accountId);
      setStatus(st);
      const ps = (await fetchPlans(st.kind)).filter((p) => p.active);
      setPlans(ps);
      setPlanId((cur) => cur ?? st.plan_id ?? ps[Math.min(1, ps.length - 1)]?.id ?? null);
      if (st.seats) setSeats(st.seats);
      else setSeats(Math.max(3, st.users_used));
      const { data } = await supabase.from('orders').select('*').eq('account_id', accountId).order('created_at', { ascending: false }).limit(10);
      setOrders((data ?? []) as Order[]);
    } catch (e) {
      setError(errorText(e));
    }
  }, [accountId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    setBilling((b) => ({
      ...b,
      title: b.title || active?.companies.legal_name || status?.name || '',
      tax_number: b.tax_number || active?.companies.tax_number || '',
      email: b.email || session?.user.email || '',
      contact_name: b.contact_name || String(session?.user.user_metadata?.full_name ?? ''),
    }));
  }, [active, status, session]);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const minSeats = plan?.unit === 'user' ? Math.max(plan.min_seats, status?.users_used ?? 0) : 1;

  // Fiyatı sunucu hesaplar (kampanya ve KDV dahil)
  useEffect(() => {
    if (!accountId || !planId || !status?.can_manage) return;
    let cancel = false;
    setQError(null);
    quote(accountId, planId, period, plan?.unit === 'user' ? Math.max(seats, minSeats) : null, appliedCode || null)
      .then((r) => !cancel && setQ(r))
      .catch((e) => {
        if (cancel) return;
        setQ(null);
        setQError(errorText(e));
      });
    return () => {
      cancel = true;
    };
  }, [accountId, planId, period, seats, appliedCode, status?.can_manage, plan?.unit, minSeats]);

  async function pay() {
    if (!accountId || !planId) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error: e } = await supabase.functions.invoke('payments', {
        body: {
          action: 'checkout',
          account_id: accountId,
          plan_id: planId,
          period,
          seats: plan?.unit === 'user' ? Math.max(seats, minSeats) : null,
          code: appliedCode || null,
          billing,
        },
      });
      if (e) {
        let msg = 'Ödeme başlatılamadı.';
        try {
          const b = await (e as { context?: Response }).context?.json();
          if (b?.error) msg = b.error;
        } catch {
          // gövde okunamadı
        }
        throw new Error(msg);
      }
      const url = (data as { paymentPageUrl?: string })?.paymentPageUrl;
      if (!url) throw new Error('Ödeme sayfası açılamadı.');
      await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
      await load();
      setInfo('Ödeme sayfası kapandı. Ödeme tamamlandıysa paketiniz birkaç saniye içinde açılır.');
      setStep('plan');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const left = daysLeft(status?.ends_at ?? null);
  const usageText = useMemo(() => {
    if (!status) return '';
    if (status.kind === 'bureau') return `${status.companies_used} / ${status.max_companies ?? '∞'} müşteri firma`;
    return `${status.users_used} / ${status.max_users ?? '∞'} çalışan`;
  }, [status]);

  if (!accountId) {
    return (
      <View style={{ padding: space.xl }}>
        <Notice text="Abonelik bilgisi bulunamadı." />
      </View>
    );
  }
  if (!status) {
    return (
      <View style={{ padding: space.xl }}>
        {error ? <Notice tone="bad" text={error} /> : <ActivityIndicator color={c.pen} />}
      </View>
    );
  }

  const setB = (k: keyof typeof billing) => (v: string) => setBilling((b) => ({ ...b, [k]: v }));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }} keyboardShouldPersistTaps="handled">
      <Slip tone="deep">
        <Text style={[type.small, { color: c.onDeepMuted, fontWeight: '600' }]}>{status.name}</Text>
        <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 30, color: c.onDeep, letterSpacing: -0.6 }}>
          {status.status === 'trial' ? 'Ücretsiz deneme' : status.plan_name ?? STATUS_TEXT[status.status]}
        </Text>
        <Text style={[type.body, { color: status.active ? c.onDeepMuted : c.gold }]}>
          {status.active
            ? left != null
              ? `${dateText(status.ends_at)} tarihine kadar, ${left} gün kaldı`
              : 'Süresiz'
            : `Süresi doldu (${dateText(status.ends_at)}). Yeni fiş girmek için paket seçin.`}
        </Text>
        <Perforation color="rgba(255,255,255,0.18)" />
        <Text style={[type.small, { color: c.onDeepMuted }]}>{usageText}</Text>
      </Slip>

      {info && <Notice tone="ok" text={info} />}
      {!status.can_manage && <Notice text="Paketi yalnızca hesabın yöneticisi değiştirebilir." />}

      {status.can_manage && step === 'plan' && (
        <>
          <View style={[styles.segment, { backgroundColor: c.paper }]}>
            {(['year', 'month'] as Period[]).map((p) => {
              const on = p === period;
              return (
                <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.segItem, on && { backgroundColor: c.pen }]}>
                  <Text style={{ color: on ? c.onPen : c.ink, fontWeight: '600' }}>{p === 'year' ? 'Yıllık (indirimli)' : 'Aylık'}</Text>
                </Pressable>
              );
            })}
          </View>

          <SectionTitle title="Paket seçin" />
          <View style={{ gap: space.sm }}>
            {plans.map((p) => {
              const on = p.id === planId;
              const price = period === 'year' ? p.price_yearly_monthly : p.price_monthly;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPlanId(p.id)}
                  style={[styles.plan, { backgroundColor: c.paper, borderColor: on ? c.pen : 'transparent' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md }}>
                    <Text style={{ fontFamily: fonts.display, fontSize: 19, color: c.ink }}>{p.name}</Text>
                    <Text style={{ fontFamily: fonts.display, fontSize: 19, color: on ? c.pen : c.ink }}>
                      {money(price)}
                      <Text style={[type.small, { color: c.muted }]}>{p.unit === 'user' ? ' / kişi / ay' : ' / ay'}</Text>
                    </Text>
                  </View>
                  <Text style={[type.small, { color: c.muted }]}>{p.description}</Text>
                  {on &&
                    p.features.map((f) => (
                      <View key={f} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <Icon name="check" size={12} color={c.pen} />
                        <Text style={[type.small, { color: c.ink }]}>{f}</Text>
                      </View>
                    ))}
                </Pressable>
              );
            })}
          </View>

          {plan?.unit === 'user' && (
            <View style={[styles.box, { backgroundColor: c.paper }]}>
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: c.ink }]}>Çalışan sayısı</Text>
                <Text style={[type.small, { color: c.muted }]}>
                  Onaylayıcı ve muhasebeci ücretsiz. En az {minSeats} kişi.
                </Text>
              </View>
              <View style={styles.stepper}>
                <Pressable onPress={() => setSeats((s) => Math.max(minSeats, s - 1))} style={[styles.stepBtn, { backgroundColor: c.canvas }]} accessibilityLabel="Azalt">
                  <Text style={{ fontSize: 20, color: c.ink }}>−</Text>
                </Pressable>
                <Text style={{ fontFamily: fonts.display, fontSize: 20, color: c.ink, minWidth: 36, textAlign: 'center' }}>{Math.max(seats, minSeats)}</Text>
                <Pressable onPress={() => setSeats((s) => Math.max(minSeats, s) + 1)} style={[styles.stepBtn, { backgroundColor: c.canvas }]} accessibilityLabel="Artır">
                  <Text style={{ fontSize: 20, color: c.ink }}>+</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field label="Kampanya kodu" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" placeholder="Varsa yazın" />
            </View>
            <Button variant="secondary" title={appliedCode && appliedCode === code ? 'Uygulandı' : 'Uygula'} onPress={() => setAppliedCode(code.trim())} style={{ minHeight: 48 }} />
          </View>
          {qError && <Notice tone="bad" text={qError} />}

          {q && (
            <View style={[styles.summary, { backgroundColor: c.paper }]}>
              <Line label={`${q.plan_name}, ${period === 'year' ? '12 ay' : '1 ay'}${plan?.unit === 'user' ? `, ${q.seats} kişi` : ''}`} value={money(q.list_price)} />
              {q.discount > 0 && <Line label={`İndirim (${q.campaign_note})`} value={`−${money(q.discount)}`} tone="ok" />}
              {q.extra_months > 0 && <Line label={`Hediye süre (${q.campaign_note})`} value={`+${q.extra_months} ay`} tone="ok" />}
              <Line label={`KDV %${Number(q.vat_rate)}`} value={money(q.vat_amount)} />
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.paperLine, marginVertical: space.xs }} />
              <Line label="Toplam" value={money(q.total)} strong />
            </View>
          )}

          <Button size="large" title="Devam et" onPress={() => setStep('billing')} disabled={!q} />
        </>
      )}

      {status.can_manage && step === 'billing' && q && (
        <>
          <SectionTitle title="Fatura bilgileri" />
          <View style={[styles.form, { backgroundColor: c.paper }]}>
            <Field label="Unvan" value={billing.title} onChangeText={setB('title')} />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Field label="Vergi no" value={billing.tax_number} onChangeText={setB('tax_number')} keyboardType="number-pad" maxLength={11} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Vergi dairesi" value={billing.tax_office} onChangeText={setB('tax_office')} />
              </View>
            </View>
            <Field label="Adres" value={billing.address} onChangeText={setB('address')} multiline />
            <Field label="Şehir" value={billing.city} onChangeText={setB('city')} />
            <Field label="Yetkili ad soyad" value={billing.contact_name} onChangeText={setB('contact_name')} />
            <Field label="E-posta (fatura gönderilecek)" value={billing.email} onChangeText={setB('email')} autoCapitalize="none" keyboardType="email-address" />
            <Field label="Cep telefonu" value={billing.phone} onChangeText={setB('phone')} keyboardType="phone-pad" placeholder="+90 5xx xxx xx xx" />
          </View>
          <Notice text={`Ödenecek tutar ${money(q.total)} (KDV dahil). Kart bilgileriniz iyzico'nun güvenli sayfasında girilir; Gidero kart bilgisi saklamaz.`} />
          {error && <Notice tone="bad" text={error} />}
          <Button size="large" icon="receipt" title={`Kartla öde: ${money(q.total)}`} onPress={pay} loading={busy} />
          <Button variant="plain" title="Paket seçimine dön" onPress={() => setStep('plan')} />
        </>
      )}

      {orders.length > 0 && (
        <>
          <SectionTitle title="Siparişler" />
          <Group>
            {orders.map((o) => (
              <Row
                key={o.id}
                icon="receipt"
                title={`Sipariş ${o.order_no}: ${plans.find((p) => p.id === o.plan_id)?.name ?? o.plan_id}`}
                subtitle={`${ORDER_STATUS[o.status]}, ${dateText(o.created_at)}`}
                value={money(o.total)}
              />
            ))}
          </Group>
        </>
      )}
    </ScrollView>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'ok' }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <Text style={[strong ? type.bodyStrong : type.body, { color: tone === 'ok' ? c.pen : c.ink, flex: 1 }]}>{label}</Text>
      <Text style={[strong ? { fontFamily: fonts.displayHeavy, fontSize: 20 } : type.amount, { color: tone === 'ok' ? c.pen : c.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: radius.md, padding: 4, gap: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm },
  plan: { borderRadius: radius.lg, borderWidth: 2, padding: space.lg, gap: 6 },
  box: { borderRadius: radius.lg, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  summary: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  form: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
});
