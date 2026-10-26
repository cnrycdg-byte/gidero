import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import {
  addPlatformExpense,
  deletePlatformExpense,
  EXPENSE_CATEGORIES,
  fetchFinance,
  fetchPlatformExpenses,
  type Finance,
  type PlatformExpense,
} from '@/lib/admin';
import { confirm } from '@/lib/confirm';
import { dateInput, dateText, money, parseAmount, parseDate } from '@/lib/format';
import { errorText } from '@/lib/supabase';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const CAT_LABEL = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.label]));
type Range = 'this_year' | 'last12' | 'this_month';
const RANGES: { key: Range; label: string }[] = [
  { key: 'this_month', label: 'Bu ay' },
  { key: 'this_year', label: 'Bu yıl' },
  { key: 'last12', label: 'Son 12 ay' },
];

function bounds(r: Range) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const to = iso(now);
  if (r === 'this_month') return { from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))), to };
  if (r === 'this_year') return { from: `${now.getFullYear()}-01-01`, to };
  return { from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1))), to };
}

// Gidero'nun kendi gelir-gideri: gelir = ödenen siparişler, gider = elle girilen platform giderleri
export default function AdminFinance() {
  const c = useColors();
  const [range, setRange] = useState<Range>('this_year');
  const [fin, setFin] = useState<Finance | null>(null);
  const [exps, setExps] = useState<PlatformExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState({ date: dateInput(new Date().toISOString().slice(0, 10)), category: 'yapay_zeka', description: '', amount: '', vat: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const b = bounds(range);
    setLoading(true);
    setError(null);
    try {
      const [f, e] = await Promise.all([fetchFinance(b.from, b.to), fetchPlatformExpenses(b.from, b.to)]);
      setFin(f);
      setExps(e);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sum = (k: 'revenue' | 'expense' | 'profit' | 'revenue_vat') => (fin?.months ?? []).reduce((a, m) => a + m[k], 0);
  const maxBar = Math.max(1, ...(fin?.months ?? []).map((m) => Math.max(m.revenue, m.expense)));

  async function save() {
    setError(null);
    const date = parseDate(d.date);
    const amount = parseAmount(d.amount);
    const vat = d.vat.trim() ? parseAmount(d.vat) : 0;
    if (!date) return setError('Tarihi GG.AA.YYYY biçiminde yazın.');
    if (amount == null || amount <= 0) return setError('Tutarı yazın (KDV hariç).');
    if (vat == null) return setError('KDV tutarını rakamla yazın ya da boş bırakın.');
    setBusy(true);
    try {
      await addPlatformExpense({ spent_on: date, category: d.category, description: d.description.trim(), amount, vat_amount: vat });
      setAdding(false);
      setD({ ...d, description: '', amount: '', vat: '' });
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      {error && <Notice tone="bad" text={error} />}
      <View style={styles.chips}>
        {RANGES.map((r) => {
          const on = r.key === range;
          return (
            <Pressable key={r.key} onPress={() => setRange(r.key)} style={[styles.chip, { backgroundColor: on ? c.pen : c.paper }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.kpis}>
        <Kpi label="Gelir (KDV hariç)" value={money(sum('revenue'))} big />
        <Kpi label="Gider (KDV hariç)" value={money(sum('expense'))} />
        <Kpi label="Kâr" value={money(sum('profit'))} tone={sum('profit') < 0 ? 'bad' : 'good'} />
        <Kpi label="Tahsil edilen KDV" value={money(sum('revenue_vat'))} hint="Beyanda ödenecek" />
      </View>
      {fin && (
        <Text style={[type.small, { color: c.muted }]}>{`${fin.paying_accounts} ücretli, ${fin.trial_accounts} denemede müşteri. Gelir, kartla ödenen ve onaylanan siparişlerden hesaplanır.`}</Text>
      )}

      {fin && fin.months.length > 1 && (
        <>
          <SectionTitle title="Aylara göre" />
          <ScrollView horizontal contentContainerStyle={[styles.chart, { backgroundColor: c.paper }]}>
            {fin.months.map((m) => (
              <View key={m.month} style={styles.col}>
                <View style={styles.bars}>
                  <View style={[styles.bar, { height: Math.max(2, (m.revenue / maxBar) * 120), backgroundColor: c.pen }]} />
                  <View style={[styles.bar, { height: Math.max(2, (m.expense / maxBar) * 120), backgroundColor: c.amber }]} />
                </View>
                <Text style={[type.small, { color: c.muted }]}>{`${MONTHS[Number(m.month.slice(5)) - 1]} ${m.month.slice(2, 4)}`}</Text>
                <Text style={{ fontSize: 11, color: m.profit < 0 ? c.red : c.ink, fontWeight: '600' }}>{money(m.profit)}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <Legend color={c.pen} label="Gelir" />
            <Legend color={c.amber} label="Gider" />
            <Text style={[type.small, { color: c.muted }]}>Sütunların altındaki tutar o ayın kârı.</Text>
          </View>
        </>
      )}

      {fin && Object.keys(fin.by_category).length > 0 && (
        <>
          <SectionTitle title="Gider türleri" />
          <Group>
            {Object.entries(fin.by_category)
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .map(([k, v]) => (
                <Row key={k} icon="receipt" title={CAT_LABEL[k] ?? k} value={money(Number(v))} chevron={false} />
              ))}
          </Group>
        </>
      )}

      <SectionTitle title={`Giderler (${exps.length})`} />
      {!adding ? (
        <Button title="Gider ekle" variant="secondary" onPress={() => setAdding(true)} />
      ) : (
        <View style={[styles.form, { backgroundColor: c.paper }]}>
          <View style={styles.chips}>
            {EXPENSE_CATEGORIES.map((k) => {
              const on = d.category === k.key;
              return (
                <Pressable key={k.key} onPress={() => setD({ ...d, category: k.key })} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
                  <Text style={{ color: on ? c.onPen : c.ink }}>{k.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}><Field label="Tarih" value={d.date} onChangeText={(v) => setD({ ...d, date: v })} placeholder="GG.AA.YYYY" /></View>
            <View style={{ flex: 1 }}><Field label="Tutar (KDV hariç)" value={d.amount} onChangeText={(v) => setD({ ...d, amount: v })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Field label="KDV" value={d.vat} onChangeText={(v) => setD({ ...d, vat: v })} keyboardType="decimal-pad" placeholder="0" /></View>
          </View>
          <Field label="Açıklama" value={d.description} onChangeText={(v) => setD({ ...d, description: v })} placeholder="Örnek: Anthropic API, Ekim" />
          <View style={styles.chips}>
            <Button title="Kaydet" onPress={save} loading={busy} />
            <Button title="Vazgeç" variant="plain" onPress={() => setAdding(false)} />
          </View>
        </View>
      )}
      {exps.length > 0 && (
        <Group>
          {exps.map((e) => (
            <Row
              key={e.id}
              icon="receipt"
              title={e.description || CAT_LABEL[e.category]}
              subtitle={`${CAT_LABEL[e.category]}, ${dateText(e.spent_on)}${e.vat_amount ? `, KDV ${money(e.vat_amount)}` : ''}`}
              value={money(e.amount)}
              onPress={() =>
                confirm('Gider silinsin mi?', `${e.description || CAT_LABEL[e.category]}, ${money(e.amount)}`, 'Sil', async () => {
                  await deletePlatformExpense(e.id).catch((x) => setError(errorText(x)));
                  load();
                })
              }
            />
          ))}
        </Group>
      )}
      <Text style={[type.small, { color: c.muted }]}>Bir gideri silmek için üzerine dokunun. Değişiklikler kayıt altında tutulur.</Text>
    </Page>
  );
}

function Kpi({ label, value, hint, big, tone }: { label: string; value: string; hint?: string; big?: boolean; tone?: 'bad' | 'good' }) {
  const c = useColors();
  return (
    <View style={[styles.kpi, { backgroundColor: big ? c.deep : c.paper, flexBasis: big ? '100%' : '30%' }]}>
      <Text style={[type.small, { color: big ? c.onDeepMuted : c.muted }]}>{label}</Text>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: big ? 34 : 24, color: big ? c.onDeep : tone === 'bad' ? c.red : c.ink }}>{value}</Text>
      {hint ? <Text style={[type.small, { color: c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={[type.small, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kpi: { flexGrow: 1, borderRadius: radius.lg, padding: space.lg, gap: 2, minWidth: 100 },
  chart: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, alignItems: 'flex-end' },
  col: { alignItems: 'center', gap: 4, minWidth: 64 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 124 },
  bar: { width: 14, borderRadius: 3 },
  form: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  row2: { flexDirection: 'row', gap: space.sm },
});
