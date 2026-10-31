// Firma bul: Google Haritalar'dan ya da yapay zekâ web aramasıyla firma listesi çıkarır.
// Sonuçlar önce gösterilir; seçtikleriniz listeye eklenir. Tahmini maliyet arama başlamadan yazılır (CLAUDE.md kural 7).
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Check, Chips } from '@/components/chips';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Notice, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { addLeads, estimateUsd, findLeads, KIND_LABEL, prepareSequence, type Candidate, type LeadKind } from '@/lib/leads';
import { errorText, supabase } from '@/lib/supabase';

type Source = 'maps' | 'web';
const COUNTS = [20, 40, 60] as const;

export default function FindLeads() {
  const c = useColors();
  const [source, setSource] = useState<Source>('maps');
  const [kind, setKind] = useState<LeadKind>('bureau');
  const [what, setWhat] = useState('');
  const [city, setCity] = useState('');
  const [count, setCount] = useState<(typeof COUNTS)[number]>(20);
  const [list, setList] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [cost, setCost] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<number>(50);

  // Kur: yapay zekâ maliyeti ekranındaki ayarla aynı
  useEffect(() => {
    supabase.from('platform_settings').select('value').eq('key', 'usd_try').maybeSingle().then(({ data }) => data && setRate(Number(data.value) || 50));
  }, []);
  const est = source === 'web' ? estimateUsd('web', count) : estimateUsd('maps', count);
  const tl = (usd: number) => `₺${(usd * rate).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function run() {
    if (!city.trim()) return setError('Şehir yazın.');
    if (kind === 'company' && !what.trim()) return setError('Hangi sektörde şirket aradığınızı yazın (örnek: inşaat firması).');
    setBusy(true);
    setError(null);
    setList(null);
    try {
      const r = await findLeads({ source, kind, what: what.trim(), city: city.trim(), count });
      const found = r.candidates ?? [];
      setList(found);
      setCost(r.cost_usd ?? null);
      setPicked(new Set(found.map((x, i) => (x.email && !x.known && !x.opted_out ? i : -1)).filter((i) => i >= 0)));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function add(withSequence: boolean) {
    if (!list) return;
    setAdding(true);
    setError(null);
    try {
      const rows = list.filter((_, i) => picked.has(i)).map(({ known: _k, opted_out: _o, ...r }) => r);
      const r = await addLeads(rows);
      if (withSequence && r.added) {
        // Yeni eklenenler e-postasından bulunur ve taslakları hazırlanır
        const emails = rows.map((x) => x.email).filter(Boolean) as string[];
        const { data } = await supabase.from('leads').select('id').in('email', emails).eq('status', 'new');
        await prepareSequence((data ?? []).map((d) => d.id as string));
        router.replace('/admin/outbox');
      } else {
        router.replace('/admin/leads');
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setAdding(false);
    }
  }

  const withEmail = list?.filter((x) => x.email).length ?? 0;

  return (
    <Page>
      <Text style={[type.title, { color: c.ink }]}>Firma bul</Text>
      <Text style={[type.body, { color: c.muted }]}>
        Aradığınız firmalar önce burada listelenir; seçtiklerinizi müşteri adaylarına eklersiniz. Hiçbir firmaya kendiliğinden e-posta gitmez.
      </Text>

      <SectionTitle title="Nereden" />
      <Chips<Source>
        role="radio"
        items={[{ key: 'maps', label: 'Google Haritalar' }, { key: 'web', label: 'Yapay zekâ web\'de arasın' }]}
        value={source}
        onChange={setSource}
      />
      <Text style={[type.small, { color: c.muted }]}>
        {source === 'maps'
          ? 'Haritalardaki işletme kaydından ad, adres, telefon ve web sitesi gelir; e-posta firmanın kendi sitesinden okunur. Daha ucuz ve daha doğru; önce bunu deneyin.'
          : 'Ucuz yapay zekâ modeli web\'de en çok 4 arama yapar ve e-postası yazılı firmaları toplar. Haritalarda çıkmayan firma türleri için kullanın.'}
      </Text>

      <SectionTitle title="Kimi arıyorsunuz" />
      <Chips<LeadKind> role="radio" items={[{ key: 'bureau', label: KIND_LABEL.bureau }, { key: 'company', label: KIND_LABEL.company }]} value={kind} onChange={setKind} />
      <Field
        label={kind === 'bureau' ? 'Arama sözcüğü (isteğe bağlı)' : 'Sektör'}
        value={what}
        onChangeText={setWhat}
        placeholder={kind === 'bureau' ? 'mali müşavir' : 'inşaat firması, lojistik, ilaç deposu'}
        hint={kind === 'bureau' ? 'Boş bırakırsanız "mali müşavir ve muhasebe bürosu" aranır.' : 'Sahada çalışanı çok olan sektörler (inşaat, lojistik, satış, servis) masrafı en çok olanlardır.'}
      />
      <Field label="Şehir" value={city} onChangeText={setCity} placeholder="İzmir" hint="İlçe de yazabilirsiniz: Bornova İzmir" />
      <Text style={[type.subhead, { color: c.ink }]}>Kaç firma</Text>
      <Chips<string> role="radio" items={COUNTS.map((n) => ({ key: String(n), label: String(n) }))} value={String(count)} onChange={(v) => setCount(Number(v) as (typeof COUNTS)[number])} />

      <View style={[styles.cost, { backgroundColor: c.fill }]}>
        <Text style={[type.subhead, { color: c.ink }]}>{`Tahmini maliyet: ${tl(est)} (${est.toFixed(3)} $)`}</Text>
        <Text style={[type.small, { color: c.muted }]}>
          {source === 'maps'
            ? 'Google her ay ilk 1.000 aramayı ücretsiz sayar; bu kotayı aşmadıkça ödeme çıkmaz.'
            : 'Web araması yapay zekâ maliyeti ekranına "Müşteri bulma" olarak yazılır.'}
        </Text>
      </View>

      {error ? <Notice tone="bad" text={error} /> : null}
      <Button icon="search" title={busy ? 'Aranıyor, 30 saniye kadar sürebilir' : 'Ara'} onPress={run} loading={busy} />

      {list ? (
        <>
          <SectionTitle title={`${list.length} firma bulundu, ${withEmail} tanesinin e-postası var`} />
          {cost != null ? <Text style={[type.small, { color: c.muted }]}>{`Bu aramanın maliyeti: ${tl(cost)}`}</Text> : null}
          {list.length === 0 ? <Notice text="Sonuç çıkmadı. Şehri ya da sözcüğü değiştirip tekrar deneyin." /> : null}
          {list.map((x, i) => {
            const off = x.known || x.opted_out;
            return (
              <View key={i} style={[styles.row, { backgroundColor: c.paper, opacity: off ? 0.55 : 1 }]}>
                <Check
                  on={picked.has(i)}
                  label={`${x.name} seç`}
                  onPress={() => !off && setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.section, { color: c.ink }]} numberOfLines={1}>{x.name}</Text>
                  <Text style={[type.small, { color: c.muted }]} numberOfLines={1}>{[x.district, x.city, x.phone].filter(Boolean).join(' · ') || x.website || ''}</Text>
                  <Text style={[type.small, { color: x.email ? c.ink : c.amber }]} numberOfLines={1}>
                    {x.opted_out ? 'Listeden çıkmış; eklenemez' : x.known ? 'Zaten listenizde' : x.email ?? 'E-posta bulunamadı (sonra elle yazabilirsiniz)'}
                  </Text>
                </View>
              </View>
            );
          })}
          {list.length ? (
            <View style={styles.actions}>
              <Button icon="mail" title={`${picked.size} firmayı ekle ve e-posta taslaklarını hazırla`} onPress={() => add(true)} loading={adding} disabled={!picked.size} />
              <Button variant="secondary" icon="plus" title="Yalnızca listeye ekle" onPress={() => add(false)} loading={adding} disabled={!picked.size} />
            </View>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  cost: { borderRadius: radius.md, padding: space.md, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, padding: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
