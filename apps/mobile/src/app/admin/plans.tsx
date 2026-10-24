import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { fetchPlans, type Plan } from '@/lib/billing';
import { amountInput, money, parseAmount } from '@/lib/format';
import { errorText, supabase } from '@/lib/supabase';

type Draft = {
  id: string;
  kind: 'company' | 'bureau';
  name: string;
  description: string;
  price_monthly: string;
  price_yearly_monthly: string;
  min_seats: string;
  max_companies: string;
  users_per_company: string;
  features: string;
  active: boolean;
  sort: string;
};

const EMPTY: Draft = {
  id: '', kind: 'bureau', name: '', description: '', price_monthly: '', price_yearly_monthly: '', min_seats: '1',
  max_companies: '5', users_per_company: '3', features: '', active: true, sort: '100',
};

// Paketler ve fiyatlar: yeni paket ekle (ör. Büro 5), fiyat ve limitleri değiştir, satıştan kaldır
export default function AdminPlans() {
  const c = useColors();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setPlans(await fetchPlans()), []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function open(p: Plan | null) {
    setError(null);
    if (!p) {
      setEditing(editing === 'new' ? null : 'new');
      setD(EMPTY);
      return;
    }
    setEditing(editing === p.id ? null : p.id);
    setD({
      id: p.id,
      kind: p.kind,
      name: p.name,
      description: p.description,
      price_monthly: amountInput(p.price_monthly),
      price_yearly_monthly: amountInput(p.price_yearly_monthly),
      min_seats: String(p.min_seats),
      max_companies: p.max_companies ? String(p.max_companies) : '',
      users_per_company: p.users_per_company ? String(p.users_per_company) : '',
      features: (p.features ?? []).join('\n'),
      active: p.active,
      sort: String(p.sort),
    });
  }

  async function save() {
    setError(null);
    const pm = parseAmount(d.price_monthly);
    const py = parseAmount(d.price_yearly_monthly);
    if (!/^[a-z0-9_]{2,40}$/.test(d.id)) return setError('Paket kodu küçük harf, rakam ve alt çizgiden oluşmalı (ör. buro_5).');
    if (d.name.trim().length < 2) return setError('Paket adını yazın.');
    if (pm == null || py == null) return setError('Aylık ve yıllık fiyatları yazın.');
    const row = {
      id: d.id,
      kind: d.kind,
      name: d.name.trim(),
      description: d.description.trim(),
      unit: d.kind === 'company' ? 'user' : 'account',
      price_monthly: pm,
      price_yearly_monthly: py,
      min_seats: Math.max(1, Number(d.min_seats) || 1),
      max_companies: d.kind === 'bureau' ? Number(d.max_companies) || null : null,
      users_per_company: d.kind === 'bureau' ? Number(d.users_per_company) || null : null,
      features: d.features.split('\n').map((x) => x.trim()).filter(Boolean),
      active: d.active,
      sort: Number(d.sort) || 0,
    };
    setBusy(true);
    const { error: e } = editing === 'new' ? await supabase.from('plans').insert(row) : await supabase.from('plans').update(row).eq('id', d.id);
    setBusy(false);
    if (e) return setError(/duplicate/i.test(e.message) ? 'Bu kodla bir paket zaten var.' : errorText(e));
    setEditing(null);
    load();
  }

  const set = (k: keyof Draft) => (v: string) => setD((x) => ({ ...x, [k]: v }));

  const editor = (
    <View style={[styles.edit, { borderTopColor: c.paperLine }]}>
      {editing === 'new' && (
        <>
          <View style={styles.chips}>
            {(['bureau', 'company'] as const).map((k) => (
              <Pressable key={k} onPress={() => setD({ ...d, kind: k, min_seats: k === 'company' ? '3' : '1' })} style={[styles.chip, { backgroundColor: d.kind === k ? c.pen : c.canvas }]}>
                <Text style={{ color: d.kind === k ? c.onPen : c.ink }}>{k === 'bureau' ? 'Büro paketi (firma sayısı)' : 'Şirket paketi (kullanıcı başı)'}</Text>
              </Pressable>
            ))}
          </View>
          <Field label="Paket kodu" value={d.id} onChangeText={(v) => setD({ ...d, id: v.toLowerCase() })} autoCapitalize="none" placeholder="buro_25" />
        </>
      )}
      <Field label="Paket adı" value={d.name} onChangeText={set('name')} placeholder="Büro 25" />
      <Field label="Kısa açıklama" value={d.description} onChangeText={set('description')} />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field label={d.kind === 'company' ? 'Aylık ödemede kişi/ay (₺)' : 'Aylık ödemede ay (₺)'} value={d.price_monthly} onChangeText={set('price_monthly')} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={d.kind === 'company' ? 'Yıllık ödemede kişi/ay (₺)' : 'Yıllık ödemede ay (₺)'} value={d.price_yearly_monthly} onChangeText={set('price_yearly_monthly')} keyboardType="decimal-pad" />
        </View>
      </View>
      {d.kind === 'bureau' ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Müşteri firma sayısı" value={d.max_companies} onChangeText={set('max_companies')} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Firma başı çalışan" value={d.users_per_company} onChangeText={set('users_per_company')} keyboardType="number-pad" />
          </View>
        </View>
      ) : (
        <Field label="En az kullanıcı" value={d.min_seats} onChangeText={set('min_seats')} keyboardType="number-pad" />
      )}
      <Field label="Özellikler (her satıra bir tane)" value={d.features} onChangeText={set('features')} multiline />
      <Field label="Sıra" value={d.sort} onChangeText={set('sort')} keyboardType="number-pad" hint="Müşteriye küçükten büyüğe sıralanır." />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text style={[type.body, { color: c.ink, flex: 1 }]}>Satışta</Text>
        <Switch value={d.active} onValueChange={(v) => setD({ ...d, active: v })} trackColor={{ true: c.pen }} />
      </View>
      {error && <Notice tone="bad" text={error} />}
      <Button title={editing === 'new' ? 'Paketi ekle' : 'Kaydet'} onPress={save} loading={busy} />
      <Text style={[type.small, { color: c.muted }]}>Fiyatlar KDV hariçtir. Değişiklik yeni siparişlere uygulanır; mevcut abonelikler süreleri bitene kadar etkilenmez.</Text>
    </View>
  );

  const group = (kind: 'company' | 'bureau') => (
    <Group>
      {plans
        .filter((p) => p.kind === kind)
        .map((p) => (
          <View key={p.id}>
            <Row
              title={`${p.name}${p.active ? '' : ' (satışta değil)'}`}
              subtitle={`${money(p.price_yearly_monthly)} yıllıkta, ${money(p.price_monthly)} aylıkta${p.unit === 'user' ? ' (kişi/ay)' : ' (ay)'}${p.max_companies ? `, ${p.max_companies} firma` : ''}`}
              onPress={() => open(p)}
              chevron={false}
              right={<Text style={{ color: c.pen, fontWeight: '600' }}>{editing === p.id ? 'Kapat' : 'Düzenle'}</Text>}
            />
            {editing === p.id && editor}
          </View>
        ))}
    </Group>
  );

  return (
    <Page>
      <View style={{ backgroundColor: c.paper, borderRadius: radius.lg, overflow: 'hidden' }}>
        <Row icon="plus" title={editing === 'new' ? 'Vazgeç' : 'Yeni paket ekle'} onPress={() => open(null)} chevron={false} />
        {editing === 'new' && editor}
      </View>
      <SectionTitle title="Büro paketleri" />
      {group('bureau')}
      <SectionTitle title="Şirket paketleri" />
      {group('company')}
    </Page>
  );
}

const styles = StyleSheet.create({
  edit: { padding: space.lg, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
});
