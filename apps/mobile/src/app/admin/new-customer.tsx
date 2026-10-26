import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Notice } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { createCustomer } from '@/lib/admin';
import { fetchPlans, type Plan } from '@/lib/billing';
import { amountInput, dateInput, money, parseAmount, parseDate } from '@/lib/format';
import { errorText } from '@/lib/supabase';

const addDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

// Gidero yöneticisi: telefonla ya da yüz yüze satılan müşteriyi panelden açar
export default function NewCustomer() {
  const c = useColors();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [kind, setKind] = useState<'company' | 'bureau'>('bureau');
  const [name, setName] = useState('');
  const [vkn, setVkn] = useState('');
  const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);
  const [status, setStatus] = useState<'trial' | 'active'>('trial');
  const [period, setPeriod] = useState<'month' | 'year'>('year');
  const [seats, setSeats] = useState('3');
  const [end, setEnd] = useState(dateInput(addDays(14)));
  const [note, setNote] = useState('');
  const [paid, setPaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchPlans().then(setPlans).catch(() => setPlans([]));
    }, []),
  );

  const list = plans.filter((p) => p.kind === kind && p.active);
  const plan = list.find((p) => p.id === planId) ?? null;
  const price = useMemo(() => {
    if (!plan || status !== 'active') return null;
    const unit = period === 'year' ? plan.price_yearly_monthly : plan.price_monthly;
    const qty = plan.unit === 'user' ? Math.max(Number(seats) || 0, plan.min_seats) : 1;
    return unit * qty * (period === 'year' ? 12 : 1);
  }, [plan, status, period, seats]);

  function pickStatus(s: 'trial' | 'active') {
    setStatus(s);
    setEnd(dateInput(addDays(s === 'trial' ? 14 : period === 'year' ? 365 : 30)));
  }

  async function save() {
    setError(null);
    const e = parseDate(end);
    if (!e) return setError('Bitiş tarihini GG.AA.YYYY biçiminde yazın.');
    if (status === 'active' && !planId) return setError('Ücretli müşteri için paket seçin.');
    setBusy(true);
    try {
      const r = await createCustomer({
        kind,
        name: name.trim(),
        taxNumber: vkn,
        ownerEmail: email.trim(),
        planId,
        status,
        period: status === 'active' ? period : null,
        seats: kind === 'company' && planId ? Number(seats) || null : null,
        end: e,
        note: note.trim(),
        paidNet: status === 'active' && paid.trim() ? parseAmount(paid) : null,
      });
      router.replace({ pathname: '/admin/account/[id]', params: { id: r.account_id, created: r.invited ? 'invited' : 'linked' } });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) => [styles.chip, { backgroundColor: on ? c.pen : c.paper }];
  const chipText = (on: boolean) => ({ color: on ? c.onPen : c.ink, fontWeight: (on ? '600' : '400') as '600' | '400' });

  return (
    <Page>
      <Text style={[type.body, { color: c.muted }]}>
        Satışı siz yaptıysanız müşteriyi buradan açın. Hesap sahibi Gidero'ya kayıtlıysa hesap hemen bağlanır; değilse o e-postayla kaydolduğunda kendiliğinden bağlanır.
      </Text>

      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Müşteri türü</Text>
      <View style={styles.chips}>
        <Pressable onPress={() => { setKind('bureau'); setPlanId(null); }} style={chip(kind === 'bureau')}>
          <Text style={chipText(kind === 'bureau')}>Muhasebe bürosu</Text>
        </Pressable>
        <Pressable onPress={() => { setKind('company'); setPlanId(null); }} style={chip(kind === 'company')}>
          <Text style={chipText(kind === 'company')}>Şirket</Text>
        </Pressable>
      </View>

      <Field label={kind === 'bureau' ? 'Büronun unvanı' : 'Şirketin unvanı'} value={name} onChangeText={setName} />
      <Field label="Vergi numarası ya da TC kimlik no" value={vkn} onChangeText={(v) => setVkn(v.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" />
      <Field label="Hesap sahibinin e-postası" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" hint={kind === 'bureau' ? 'Büro sahibi olur.' : 'Şirketin yöneticisi ve muhasebecisi olur; ekibini kendisi ekler.'} />

      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Durum</Text>
      <View style={styles.chips}>
        <Pressable onPress={() => pickStatus('trial')} style={chip(status === 'trial')}>
          <Text style={chipText(status === 'trial')}>Ücretsiz deneme</Text>
        </Pressable>
        <Pressable onPress={() => pickStatus('active')} style={chip(status === 'active')}>
          <Text style={chipText(status === 'active')}>Ücretli üyelik</Text>
        </Pressable>
      </View>

      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Paket{status === 'trial' ? ' (isteğe bağlı)' : ''}</Text>
      <View style={styles.chips}>
        {list.map((p) => (
          <Pressable key={p.id} onPress={() => setPlanId(planId === p.id ? null : p.id)} style={chip(planId === p.id)}>
            <Text style={chipText(planId === p.id)}>{p.name}</Text>
          </Pressable>
        ))}
      </View>

      {status === 'active' && (
        <>
          <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Ödeme dönemi</Text>
          <View style={styles.chips}>
            {(['year', 'month'] as const).map((p) => (
              <Pressable key={p} onPress={() => { setPeriod(p); setEnd(dateInput(addDays(p === 'year' ? 365 : 30))); }} style={chip(period === p)}>
                <Text style={chipText(period === p)}>{p === 'year' ? 'Yıllık' : 'Aylık'}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {kind === 'company' && plan?.unit === 'user' && (
        <Field label={`Çalışan sayısı (en az ${plan.min_seats})`} value={seats} onChangeText={(v) => setSeats(v.replace(/\D/g, ''))} keyboardType="number-pad" />
      )}
      <Field label="Üyelik bitiş tarihi" value={end} onChangeText={setEnd} placeholder="GG.AA.YYYY" />
      <Field label="Not (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Örnek: Havale ile ödedi, fatura kesildi" />

      {price != null && (
        <View style={[styles.sum, { backgroundColor: c.paper }]}>
          <Text style={[type.small, { color: c.muted }]}>Liste fiyatıyla dönem tutarı (KDV hariç)</Text>
          <Text style={[type.title, { color: c.ink }]}>{money(price)}</Text>
          <Pressable onPress={() => setPaid(amountInput(price))}>
            <Text style={[type.small, { color: c.pen, fontWeight: '600' }]}>Bu tutarı tahsilat olarak yaz</Text>
          </Pressable>
        </View>
      )}
      {status === 'active' && (
        <Field
          label="Tahsil edilen tutar (KDV hariç)"
          value={paid}
          onChangeText={setPaid}
          keyboardType="decimal-pad"
          placeholder="Boş bırakırsanız gelire işlenmez"
          hint="Kampanyalı ya da indirimli sattıysanız gerçek tutarı yazın. KDV eklenerek gelire işlenir."
        />
      )}

      {error && <Notice tone="bad" text={error} />}
      <Button title="Müşteriyi aç" onPress={save} loading={busy} disabled={!name.trim() || vkn.length < 10 || !email.includes('@')} />
    </Page>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  sum: { borderRadius: radius.lg, padding: space.lg, gap: 4 },
});
