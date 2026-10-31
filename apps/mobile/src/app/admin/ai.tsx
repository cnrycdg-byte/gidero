// Yönetim paneli: yapay zekâ (Claude API) maliyeti. Günlük harcama, model ve şirket dağılımı,
// verilere dayalı tasarruf önerileri; dolar kuru ve model fiyatları buradan güncellenir.
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { aiReport, savingTips, setAiPrice, setUsdTry, type AiPrice, type AiReport } from '@/lib/ai-usage';
import { errorText } from '@/lib/supabase';

const RANGES = [7, 30, 90] as const;
const FEATURE_LABEL = { receipt: 'Fiş okuma', site_chat: 'Site sohbeti' } as const;

const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: v < 1 ? 4 : 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;
const tl = (v: number) => `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });

export default function AdminAi() {
  const c = useColors();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [r, setR] = useState<AiReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<AiPrice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rep = await aiReport(days);
      setR(rep);
      setRate(String(rep.usd_try).replace('.', ','));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const k = r?.usd_try ?? 50;
  const stats = useMemo(() => {
    if (!r) return null;
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const forecast = (r.month.cost / Math.max(1, dayOfMonth)) * daysInMonth;
    const perReceipt = r.month.receipts ? r.month.cost / r.month.receipts : 0;
    const max = Math.max(0.000001, ...r.daily.map((d) => d.cost));
    const total = r.by_model.reduce((a, m) => a + m.cost, 0);
    return { forecast, perReceipt, max, total };
  }, [r]);

  async function saveRate() {
    const v = Number(rate.replace(/\./g, '').replace(',', '.'));
    if (!(v > 0)) return setError('Geçerli bir kur yazın, örneğin 50,25.');
    setError(null);
    try {
      await setUsdTry(v);
      setInfo('Kur kaydedildi. TL tutarları bu kurla hesaplanır.');
      load();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function savePrice() {
    if (!edit) return;
    try {
      await setAiPrice({ model: edit.model, input: edit.input_per_mtok, output: edit.output_per_mtok, cacheRead: edit.cache_read_per_mtok, cacheWrite: edit.cache_write_per_mtok });
      setEdit(null);
      setInfo('Fiyat kaydedildi. Yeni fiyat bundan sonraki çağrılara uygulanır; geçmiş kayıtlar değişmez.');
      load();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const picked = r && sel != null ? r.daily[sel] : null;

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      <Text style={[type.title, { color: c.ink }]}>Yapay zekâ maliyeti</Text>
      <Text style={[type.body, { color: c.muted }]}>Fiş okuma ve site sohbetindeki her Claude çağrısı, token sayısı ve o günkü fiyatıyla kaydedilir. TL tutarları aşağıdaki kurla hesaplanır.</Text>
      {error ? <Notice tone="bad" text={error} /> : null}
      {info ? <Notice tone="ok" text={info} /> : null}

      {r && stats ? (
        <>
          <View style={styles.kpis}>
            <Kpi label="Bugün" main={tl(r.today.cost * k)} sub={`${usd(r.today.cost)} · ${r.today.calls} çağrı`} />
            <Kpi label="Dün" main={tl(r.yesterday.cost * k)} sub={`${usd(r.yesterday.cost)} · ${r.yesterday.calls} çağrı`} />
            <Kpi label="Bu ay" main={tl(r.month.cost * k)} sub={`${usd(r.month.cost)} · ${r.month.receipts} fiş`} />
            <Kpi label="Ay sonu tahmini" main={tl(stats.forecast * k)} sub="Bugünkü hızla" />
            <Kpi label="Fiş başı" main={stats.perReceipt ? tl(stats.perReceipt * k) : '—'} sub="Bu ay ortalaması" />
          </View>

          <View style={[styles.card, { backgroundColor: c.paper }]}>
            <View style={styles.cardHead}>
              <Text style={[type.section, { color: c.ink }]}>Günlük harcama</Text>
              <View style={styles.seg}>
                {RANGES.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => {
                      setSel(null);
                      setDays(d);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: days === d }}
                    style={[styles.segItem, { backgroundColor: days === d ? c.pen : c.fill }]}>
                    <Text style={{ color: days === d ? c.onPen : c.ink, fontWeight: '600', fontSize: 13 }}>{`${d} gün`}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.bars} accessibilityLabel={`Son ${days} günün günlük yapay zekâ harcaması`}>
              {r.daily.map((d, i) => (
                <Pressable key={d.day} onPress={() => setSel(sel === i ? null : i)} style={styles.barCol} accessibilityLabel={`${dayLabel(d.day)}: ${tl(d.cost * k)}`}>
                  <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <View style={{ height: `${Math.max(d.cost > 0 ? 3 : 0, (d.cost / stats.max) * 100)}%`, backgroundColor: sel === i ? c.amber : c.pen, borderRadius: 3 }} />
                  </View>
                </Pressable>
              ))}
            </View>
            <View style={styles.axis}>
              <Text style={[type.caption, { color: c.muted }]}>{r.daily[0] ? dayLabel(r.daily[0].day) : ''}</Text>
              <Text style={[type.caption, { color: c.muted }]}>{`En yüksek gün ${tl(stats.max * k)}`}</Text>
              <Text style={[type.caption, { color: c.muted }]}>{r.daily.at(-1) ? dayLabel(r.daily.at(-1)!.day) : ''}</Text>
            </View>
            {picked ? (
              <Text style={[type.subhead, { color: c.ink }]}>{`${dayLabel(picked.day)}: ${tl(picked.cost * k)} (${usd(picked.cost)}), ${picked.calls} çağrı, ${picked.receipts} fiş`}</Text>
            ) : (
              <Text style={[type.small, { color: c.muted }]}>Bir güne dokunun, o günün ayrıntısı burada görünür.</Text>
            )}
          </View>

          <SectionTitle title="Maliyeti nasıl düşürürüm?" />
          <View style={{ gap: space.sm }}>
            {savingTips(r).map((t) => (
              <View key={t.title} style={[styles.tip, { backgroundColor: c.paper }]}>
                <Icon name={t.tone === 'warn' ? 'warning' : t.tone === 'ok' ? 'checkCircle' : 'info'} size={18} color={t.tone === 'warn' ? c.amber : t.tone === 'ok' ? c.green : c.pen} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: c.ink }]}>{t.title}</Text>
                  <Text style={[type.subhead, { color: c.muted }]}>{t.text}</Text>
                </View>
              </View>
            ))}
          </View>

          <SectionTitle title={`Modele göre (son ${days} gün)`} />
          <Group>
            {r.by_model.length === 0 ? <Row title="Henüz kayıt yok" subtitle="Fiş okundukça burada görünür" /> : null}
            {r.by_model.map((m) => (
              <Row
                key={m.model}
                title={m.model}
                subtitle={`${m.calls} çağrı · ${(m.input / 1000).toFixed(0)} bin girdi, ${(m.output / 1000).toFixed(0)} bin çıktı token · %${stats.total ? Math.round((m.cost / stats.total) * 100) : 0}`}
                value={tl(m.cost * k)}
              />
            ))}
          </Group>

          <SectionTitle title={`Özelliğe göre (son ${days} gün)`} />
          <Group>
            {r.by_feature.map((f) => (
              <Row key={f.feature} title={FEATURE_LABEL[f.feature] ?? f.feature} subtitle={`${f.calls} çağrı`} value={tl(f.cost * k)} />
            ))}
          </Group>

          <SectionTitle title="Bu ay en çok kullanan şirketler" />
          <Group>
            {r.by_company.length === 0 ? <Row title="Henüz kayıt yok" /> : null}
            {r.by_company.map((x) => (
              <Row
                key={x.company}
                title={x.company}
                subtitle={x.receipts ? `${x.receipts} fiş · fiş başı ${tl((x.cost / x.receipts) * k)}` : `${x.calls} çağrı`}
                value={tl(x.cost * k)}
              />
            ))}
          </Group>

          <SectionTitle title="Kur ve fiyatlar" />
          <View style={[styles.card, { backgroundColor: c.paper }]}>
            <View style={styles.rateRow}>
              <View style={{ flex: 1 }}>
                <Field label="1 ABD doları (TL)" value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
              </View>
              <Button variant="secondary" title="Kuru kaydet" onPress={saveRate} />
            </View>
            <Text style={[type.small, { color: c.muted }]}>Fiyatlar 1 milyon token içindir, ABD doları. Anthropic fiyat değiştirirse buradan güncelleyin.</Text>
            {r.prices.map((p) =>
              edit?.model === p.model ? (
                <View key={p.model} style={{ gap: space.sm }}>
                  <Text style={[type.bodyStrong, { color: c.ink }]}>{p.model}</Text>
                  <View style={styles.priceGrid}>
                    {(
                      [
                        ['input_per_mtok', 'Girdi'],
                        ['output_per_mtok', 'Çıktı'],
                        ['cache_read_per_mtok', 'Önbellek okuma'],
                        ['cache_write_per_mtok', 'Önbellek yazma'],
                      ] as const
                    ).map(([key, label]) => (
                      <View key={key} style={{ flexBasis: 140, flexGrow: 1 }}>
                        <Field
                          label={label}
                          value={String(edit[key])}
                          keyboardType="decimal-pad"
                          onChangeText={(t) => setEdit({ ...edit, [key]: Number(t.replace(',', '.')) || 0 })}
                        />
                      </View>
                    ))}
                  </View>
                  <View style={styles.rateRow}>
                    <Button variant="secondary" title="Vazgeç" onPress={() => setEdit(null)} />
                    <Button title="Fiyatı kaydet" onPress={savePrice} />
                  </View>
                </View>
              ) : (
                <Pressable key={p.model} onPress={() => setEdit(p)} style={styles.priceRow} accessibilityRole="button">
                  <Text style={[type.body, { color: c.ink, flex: 1 }]}>{p.model}</Text>
                  <Text style={[type.subhead, { color: c.muted }]}>{`$${p.input_per_mtok} girdi · $${p.output_per_mtok} çıktı`}</Text>
                  <Icon name="chevron" size={13} color={c.faint} />
                </Pressable>
              ),
            )}
          </View>
        </>
      ) : null}
    </Page>
  );
}

function Kpi({ label, main, sub }: { label: string; main: string; sub: string }) {
  const c = useColors();
  return (
    <View style={[styles.kpi, { backgroundColor: c.paper }]}>
      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>{label}</Text>
      <Text style={{ color: c.ink, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {main}
      </Text>
      <Text style={[type.caption, { color: c.muted }]} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kpi: { flexGrow: 1, flexBasis: 160, borderRadius: radius.md, padding: space.lg, gap: 2 },
  card: { borderRadius: radius.md, padding: space.lg, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  seg: { flexDirection: 'row', gap: 6 },
  segItem: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, minHeight: 32, justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'stretch', gap: 2, height: 150 },
  barCol: { flex: 1, minWidth: 3 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  tip: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.md, alignItems: 'flex-start' },
  rateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, flexWrap: 'wrap' },
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
});
