import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Notice, SectionTitle } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { fetchPlans, type Plan } from '@/lib/billing';
import { money, parseAmount } from '@/lib/format';
import { useWide } from '@/lib/layout';
import { fetchBands, type Band } from '@/lib/pricing';
import { buildTiers, CURVE_LABEL, distribute, parseThresholds, priceFor, type Curve } from '@/lib/pricing/distribute';
import { errorText, supabase } from '@/lib/supabase';

type Kind = 'company' | 'bureau';

const KIND: Record<Kind, { tab: string; unit: string; units: string; minLabel: string; sample: number[] }> = {
  company: { tab: 'Şirketler', unit: 'kişi', units: 'masraf giren çalışan', minLabel: 'En az kişi', sample: [5, 20, 60, 150] },
  bureau: { tab: 'Muhasebe büroları', unit: 'firma', units: 'müşteri firma', minLabel: 'En az firma', sample: [3, 12, 40, 120] },
};

type Draft = { max: string; min: string; yearly: string; minSeats: string; thresholds: string; curve: Curve; prices: number[] | null };

/** Kayıtlı fiyat ve kademelerden düzenleme taslağı */
function draftFrom(plan: Plan, bands: Band[]): Draft {
  const own = bands.filter((b) => b.plan_id === plan.id).sort((a, b) => a.min_qty - b.min_qty);
  const max = Number(plan.price_monthly);
  const prices = [max, ...own.map((b) => Math.round(max * Number(b.factor) * 100) / 100)];
  return {
    max: String(max).replace('.', ','),
    min: String(prices.at(-1) ?? max).replace('.', ','),
    yearly: String(Number(plan.price_yearly_monthly)).replace('.', ','),
    minSeats: String(plan.min_seats),
    thresholds: own.map((b) => b.min_qty).join(', '),
    curve: 'even',
    prices,
  };
}

// Fiyatlar: şirket (kişi başı) ve büro (firma başı) için en yüksek ve en düşük birim fiyatı girin, kademelere dağıtılsın.
export default function AdminPricing() {
  const c = useColors();
  const wide = useWide();
  const [kind, setKind] = useState<Kind>('company');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<Kind, Draft>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [qty, setQty] = useState('');

  const load = useCallback(async () => {
    const [p, b] = await Promise.all([fetchPlans(), fetchBands()]);
    setPlans(p);
    setBands(b);
    const next: Partial<Record<Kind, Draft>> = {};
    for (const k of ['company', 'bureau'] as Kind[]) {
      const plan = p.find((x) => x.kind === k && x.active);
      if (plan) next[k] = draftFrom(plan, b);
    }
    setDrafts(next);
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const plan = plans.find((p) => p.kind === kind && p.active);
  const d = drafts[kind];
  const set = (patch: Partial<Draft>) => {
    setSaved(null);
    setDrafts((x) => ({ ...x, [kind]: { ...(x[kind] as Draft), ...patch } }));
  };

  const calc = useMemo(() => {
    if (!d) return null;
    const max = parseAmount(d.max);
    const min = parseAmount(d.min);
    const minSeats = Math.max(1, Number(d.minSeats) || 1);
    const yearly = parseAmount(d.yearly);
    const thresholds = parseThresholds(d.thresholds, minSeats);
    if (max == null || max <= 0) return { error: 'En yüksek birim fiyatı yazın.' };
    if (min == null || min <= 0 || min > max) return { error: 'En düşük birim fiyat, en yüksekten büyük olamaz.' };
    if (yearly == null || yearly <= 0 || yearly > max) return { error: 'Yıllık ödemedeki fiyat sıfırdan büyük ve aylık ödeme fiyatından düşük olmalı.' };
    const prices = d.prices && d.prices.length === thresholds.length + 1 && d.prices[0] === max ? d.prices : distribute(max, min, thresholds, d.curve);
    return { tiers: buildTiers(prices, thresholds, minSeats, yearly), prices, max, yearly, minSeats, thresholds };
  }, [d]);

  function redistribute(curve?: Curve) {
    if (!d) return;
    const max = parseAmount(d.max);
    const min = parseAmount(d.min);
    const minSeats = Math.max(1, Number(d.minSeats) || 1);
    if (max == null || min == null) return set({ curve: curve ?? d.curve });
    set({ curve: curve ?? d.curve, prices: distribute(max, min, parseThresholds(d.thresholds, minSeats), curve ?? d.curve) });
  }

  function editPrice(i: number, text: string) {
    if (!calc || !('prices' in calc) || !calc.prices) return;
    const v = parseAmount(text);
    const next = [...calc.prices];
    next[i] = v ?? 0;
    set({ prices: next });
  }

  async function save() {
    if (!plan || !calc || !('tiers' in calc) || !calc.tiers) return;
    setError(null);
    const t = calc.tiers;
    for (let i = 1; i < t.length; i++) {
      if (!(t[i].monthly > 0) || t[i].monthly > t[i - 1].monthly) return setError('Kademe fiyatları adet arttıkça düşmeli; tabloyu kontrol edin.');
    }
    setBusy(true);
    const { error: e } = await supabase.rpc('admin_set_pricing', {
      p_plan: plan.id,
      p_price_monthly: calc.max,
      p_price_yearly: calc.yearly,
      p_min_seats: calc.minSeats,
      p_bands: t.slice(1).map((x) => ({ min_qty: x.from, factor: x.factor })),
    });
    setBusy(false);
    if (e) return setError(errorText(e));
    setSaved('Kaydedildi. Yeni fiyatlar sitede ve yeni siparişlerde geçerli; mevcut abonelikler dönem sonuna kadar eski fiyatla devam eder.');
    load();
  }

  const k = KIND[kind];
  const q = Math.max(0, Number(qty) || 0);
  const tiers = calc && 'tiers' in calc ? calc.tiers : null;

  const inputs = d ? (
    <View style={[styles.card, { backgroundColor: c.paper }]}>
      <Text style={[type.bodyStrong, { color: c.ink }]}>{`${k.tab}: ${k.unit} başı aylık fiyat`}</Text>
      <View style={styles.two}>
        <View style={{ flex: 1 }}>
          <Field label={`En yüksek (₺/${k.unit})`} value={d.max} onChangeText={(v) => set({ max: v, prices: null })} keyboardType="decimal-pad" hint="İlk kademe, aylık ödemede" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={`En düşük (₺/${k.unit})`} value={d.min} onChangeText={(v) => set({ min: v, prices: null })} keyboardType="decimal-pad" hint="Son kademe" />
        </View>
      </View>
      <View style={styles.two}>
        <View style={{ flex: 1 }}>
          <Field
            label={`Yıllık ödemede (₺/${k.unit})`}
            value={d.yearly}
            onChangeText={(v) => set({ yearly: v })}
            keyboardType="decimal-pad"
            hint={(() => {
              const mx = parseAmount(d.max);
              const yr = parseAmount(d.yearly);
              return mx && yr ? `İlk kademe, %${Math.round((1 - yr / mx) * 100)} indirim` : 'İlk kademe';
            })()}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={k.minLabel} value={d.minSeats} onChangeText={(v) => set({ minSeats: v, prices: null })} keyboardType="number-pad" />
        </View>
      </View>
      <Field
        label="Kademe başlangıçları"
        value={d.thresholds}
        onChangeText={(v) => set({ thresholds: v, prices: null })}
        placeholder="10, 25, 50, 100, 250"
        hint={`Fiyatın düştüğü ${k.unit} sayıları, virgülle.`}
      />
      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Fiyat nasıl düşsün</Text>
      <View style={styles.chips}>
        {(Object.keys(CURVE_LABEL) as Curve[]).map((cv) => {
          const on = d.curve === cv;
          return (
            <Pressable key={cv} onPress={() => redistribute(cv)} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{CURVE_LABEL[cv]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  ) : null;

  const table = tiers ? (
    <View style={[styles.card, { backgroundColor: c.paper, gap: 0 }]}>
      <View style={[styles.tr, { borderBottomColor: c.paperLine }]}>
        <Text style={[styles.th, { color: c.muted, flex: 1.2 }]}>{`${k.unit[0].toLocaleUpperCase('tr-TR')}${k.unit.slice(1)} sayısı`}</Text>
        <Text style={[styles.th, { color: c.muted, flex: 1, textAlign: 'right' }]}>Aylık ödemede</Text>
        <Text style={[styles.th, { color: c.muted, flex: 1, textAlign: 'right' }]}>Yıllık ödemede</Text>
      </View>
      {tiers.map((t, i) => (
        <View key={t.from} style={[styles.tr, { borderBottomColor: c.paperLine }]}>
          <Text style={{ flex: 1.2, color: c.ink }}>{t.to ? `${t.from} – ${t.to}` : `${t.from} ve üzeri`}</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            {i === 0 ? (
              <Text style={{ color: c.ink, fontFamily: fonts.display }}>{money(t.monthly)}</Text>
            ) : (
              <TextInput
                value={((v) => (Number.isInteger(v) ? String(v) : v.toFixed(2)).replace('.', ','))(calc && 'prices' in calc && calc.prices ? calc.prices[i] : t.monthly)}
                onChangeText={(v) => editPrice(i, v)}
                keyboardType="decimal-pad"
                accessibilityLabel={`${t.from} ${k.unit} ve üzeri aylık fiyat`}
                style={[styles.cell, { color: c.ink, borderColor: c.paperLine, backgroundColor: c.canvas }]}
              />
            )}
          </View>
          <Text style={{ flex: 1, textAlign: 'right', color: c.muted }}>{money(t.yearly)}</Text>
        </View>
      ))}
      <Text style={[type.small, { color: c.muted, marginTop: space.sm }]}>
        Kademe fiyatlarını tabloda elle de değiştirebilirsiniz. "Fiyat nasıl düşsün" seçimine dokunmak dağıtımı baştan yapar.
      </Text>
    </View>
  ) : null;

  const preview = tiers ? (
    <View style={[styles.card, { backgroundColor: c.deep }]}>
      <Text style={[type.bodyStrong, { color: c.onDeep }]}>Müşteri ne öder</Text>
      <View style={styles.sampleRow}>
        {k.sample.map((n) => (
          <View key={n} style={styles.sample}>
            <Text style={[type.small, { color: c.onDeepMuted }]}>{`${n} ${k.unit}`}</Text>
            <Text style={{ color: c.onDeep, fontFamily: fonts.display, fontSize: 18 }}>{`${money(priceFor(tiers, n, 'year') * n)} / ay`}</Text>
            <Text style={[type.small, { color: c.onDeepMuted }]}>{`Yıllık tek ödeme ${money(priceFor(tiers, n, 'year') * n * 12)}`}</Text>
            <Text style={[type.small, { color: c.onDeepMuted }]}>{`Aylık ödemede ${money(priceFor(tiers, n, 'month') * n)} / ay`}</Text>
          </View>
        ))}
      </View>
      <View style={styles.two}>
        <TextInput
          value={qty}
          onChangeText={setQty}
          placeholder={`${k.unit} sayısı yazın`}
          placeholderTextColor={c.onDeepMuted}
          keyboardType="number-pad"
          accessibilityLabel={`Hesaplanacak ${k.unit} sayısı`}
          style={[styles.qty, { color: c.onDeep, borderColor: c.onDeepMuted }]}
        />
        {q > 0 ? (
          <Text style={{ color: c.onDeep, flex: 2, alignSelf: 'center' }}>
            {`${q} ${k.unit}: ${k.unit} başı ${money(priceFor(tiers, q, 'year'))}, aylık ${money(priceFor(tiers, q, 'year') * q)}, yıllık tek ödeme ${money(priceFor(tiers, q, 'year') * q * 12)}`}
          </Text>
        ) : null}
      </View>
    </View>
  ) : null;

  return (
    <Page wide>
      <View style={[styles.seg, { backgroundColor: c.paper }]}>
        {(['company', 'bureau'] as Kind[]).map((x) => {
          const on = x === kind;
          return (
            <Pressable key={x} onPress={() => setKind(x)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.segBtn, on && { backgroundColor: c.pen }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: '600' }}>{KIND[x].tab}</Text>
              <Text style={[type.small, { color: on ? c.onPen : c.muted }]}>{`${KIND[x].unit} başı, ${KIND[x].units} sayısına göre`}</Text>
            </Pressable>
          );
        })}
      </View>

      {!plan ? <Notice tone="warn" text={`${k.tab} için satışta paket yok. Paket ayrıntılarından birini satışa açın.`} /> : null}

      {d ? (
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.lg, alignItems: 'flex-start' }}>
          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: space.lg }}>{inputs}</View>
          <View style={{ flex: wide ? 1.15 : undefined, width: wide ? undefined : '100%', gap: space.lg }}>
            {calc && 'error' in calc && calc.error ? <Notice tone="warn" text={calc.error} /> : null}
            {table}
            {preview}
          </View>
        </View>
      ) : null}

      {error ? <Notice tone="bad" text={error} /> : null}
      {saved ? <Notice tone="ok" text={saved} /> : null}
      {plan && tiers ? <Button title={`${k.tab} fiyatlarını kaydet`} icon="check" onPress={save} loading={busy} /> : null}
      <Text style={[type.small, { color: c.muted }]}>Fiyatlara KDV dahil değildir. Site ve sipariş ekranı bu tabloyu kullanır.</Text>

      <SectionTitle title="Paket ayrıntıları" />
      <Button variant="secondary" title="Paket adı, açıklama, özellikler ve eski paketler" onPress={() => router.push('/admin/plan-details')} />
    </Page>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.lg },
  segBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, gap: 2 },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  two: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  th: { fontSize: 13, fontWeight: '600' },
  cell: { width: 96, textAlign: 'right', borderWidth: 1, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 8, fontSize: 15 },
  sampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  sample: { flexGrow: 1, flexBasis: 140, gap: 2 },
  qty: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
