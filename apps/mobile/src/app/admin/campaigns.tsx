import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import type { Campaign } from '@/lib/admin';
import { fetchPlans, type Plan } from '@/lib/billing';
import { dateInput, dateText, money, parseAmount, parseDate } from '@/lib/format';
import { errorText, supabase } from '@/lib/supabase';

type Draft = {
  code: string;
  name: string;
  discount_type: Campaign['discount_type'];
  discount_value: string;
  extra_months: string;
  plan_ids: string[];
  periods: string[];
  first_order_only: boolean;
  starts: string;
  ends: string;
  max_uses: string;
  active: boolean;
};

const EMPTY: Draft = {
  code: '', name: '', discount_type: 'percent', discount_value: '20', extra_months: '0', plan_ids: [], periods: ['year'],
  first_order_only: true, starts: '', ends: '', max_uses: '', active: true,
};

// Kampanyalar: indirim kodu (yüzde / tutar), hediye ay, paket ve dönem kısıtı, tarih ve kullanım sınırı
export default function AdminCampaigns() {
  const c = useColors();
  const [rows, setRows] = useState<Campaign[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, ps] = await Promise.all([supabase.from('campaigns').select('*').order('created_at', { ascending: false }), fetchPlans()]);
    setRows((data ?? []) as Campaign[]);
    setPlans(ps);
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function open(k: Campaign | null) {
    setError(null);
    if (!k) {
      setEditing(editing === 'new' ? null : 'new');
      setD(EMPTY);
      return;
    }
    setEditing(editing === k.id ? null : k.id);
    setD({
      code: k.code,
      name: k.name,
      discount_type: k.discount_type,
      discount_value: String(Number(k.discount_value)).replace('.', ','),
      extra_months: String(k.extra_months),
      plan_ids: k.plan_ids ?? [],
      periods: k.billing_periods ?? [],
      first_order_only: k.first_order_only,
      starts: dateInput(k.starts_at),
      ends: dateInput(k.ends_at),
      max_uses: k.max_uses ? String(k.max_uses) : '',
      active: k.active,
    });
  }

  async function save() {
    setError(null);
    const code = d.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return setError('Kod 3-30 karakter; harf, rakam, - veya _ olmalı (ör. BURO2026).');
    if (d.name.trim().length < 2) return setError('Kampanyaya bir ad verin.');
    const value = d.discount_type === 'none' ? 0 : parseAmount(d.discount_value);
    if (value == null) return setError('İndirim değerini yazın.');
    if (d.discount_type === 'percent' && value > 100) return setError('Yüzde indirim 100’ü geçemez.');
    const starts = d.starts.trim() ? parseDate(d.starts) : null;
    const ends = d.ends.trim() ? parseDate(d.ends) : null;
    if ((d.starts.trim() && !starts) || (d.ends.trim() && !ends)) return setError('Tarihleri GG.AA.YYYY biçiminde yazın.');
    const row = {
      code,
      name: d.name.trim(),
      discount_type: d.discount_type,
      discount_value: value,
      extra_months: Math.max(0, Number(d.extra_months) || 0),
      plan_ids: d.plan_ids,
      billing_periods: d.periods,
      first_order_only: d.first_order_only,
      starts_at: starts ? `${starts}T00:00:00+03:00` : null,
      ends_at: ends ? `${ends}T23:59:59+03:00` : null,
      max_uses: d.max_uses ? Number(d.max_uses) : null,
      active: d.active,
    };
    setBusy(true);
    const { error: e } = editing === 'new' ? await supabase.from('campaigns').insert(row) : await supabase.from('campaigns').update(row).eq('id', editing!);
    setBusy(false);
    if (e) return setError(/duplicate/i.test(e.message) ? 'Bu kod zaten kullanılıyor.' : errorText(e));
    setEditing(null);
    load();
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const chip = (on: boolean, label: string, onPress: () => void, key?: string) => (
    <Pressable key={key ?? label} onPress={onPress} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
      <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );

  const editor = (
    <View style={[styles.edit, { borderTopColor: c.paperLine }]}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Kod" value={d.code} onChangeText={(v) => setD({ ...d, code: v.toUpperCase() })} autoCapitalize="characters" placeholder="BURO2026" />
        </View>
        <View style={{ flex: 1.4 }}>
          <Field label="Kampanya adı" value={d.name} onChangeText={(v) => setD({ ...d, name: v })} placeholder="Büro lansman" />
        </View>
      </View>
      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>İndirim</Text>
      <View style={styles.chips}>
        {chip(d.discount_type === 'percent', 'Yüzde', () => setD({ ...d, discount_type: 'percent' }))}
        {chip(d.discount_type === 'amount', 'Tutar (₺)', () => setD({ ...d, discount_type: 'amount' }))}
        {chip(d.discount_type === 'none', 'İndirim yok', () => setD({ ...d, discount_type: 'none' }))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {d.discount_type !== 'none' && (
          <View style={{ flex: 1 }}>
            <Field label={d.discount_type === 'percent' ? 'İndirim %' : 'İndirim ₺'} value={d.discount_value} onChangeText={(v) => setD({ ...d, discount_value: v })} keyboardType="decimal-pad" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Field label="Hediye ay" value={d.extra_months} onChangeText={(v) => setD({ ...d, extra_months: v.replace(/\D/g, '') })} keyboardType="number-pad" hint="Ör. 12 al 14 kullan için 2" />
        </View>
      </View>
      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Geçerli paketler (seçilmezse hepsi)</Text>
      <View style={styles.chips}>{plans.map((p) => chip(d.plan_ids.includes(p.id), p.name, () => setD({ ...d, plan_ids: toggle(d.plan_ids, p.id) }), p.id))}</View>
      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Geçerli ödeme dönemi (seçilmezse ikisi)</Text>
      <View style={styles.chips}>
        {chip(d.periods.includes('year'), 'Yıllık', () => setD({ ...d, periods: toggle(d.periods, 'year') }))}
        {chip(d.periods.includes('month'), 'Aylık', () => setD({ ...d, periods: toggle(d.periods, 'month') }))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Başlangıç" value={d.starts} onChangeText={(v) => setD({ ...d, starts: v })} placeholder="GG.AA.YYYY" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Bitiş" value={d.ends} onChangeText={(v) => setD({ ...d, ends: v })} placeholder="GG.AA.YYYY" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="En çok kullanım" value={d.max_uses} onChangeText={(v) => setD({ ...d, max_uses: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="Sınırsız" />
        </View>
      </View>
      <View style={styles.switchRow}>
        <Text style={[type.body, { color: c.ink, flex: 1 }]}>Yalnızca ilk siparişte</Text>
        <Switch value={d.first_order_only} onValueChange={(v) => setD({ ...d, first_order_only: v })} trackColor={{ true: c.pen }} />
      </View>
      <View style={styles.switchRow}>
        <Text style={[type.body, { color: c.ink, flex: 1 }]}>Aktif</Text>
        <Switch value={d.active} onValueChange={(v) => setD({ ...d, active: v })} trackColor={{ true: c.pen }} />
      </View>
      {error && <Notice tone="bad" text={error} />}
      <Button title={editing === 'new' ? 'Kampanyayı oluştur' : 'Kaydet'} onPress={save} loading={busy} />
    </View>
  );

  const describe = (k: Campaign) => {
    const parts = [
      k.discount_type === 'percent' ? `%${Number(k.discount_value)} indirim` : k.discount_type === 'amount' ? `${money(k.discount_value)} indirim` : null,
      k.extra_months ? `+${k.extra_months} ay hediye` : null,
      k.ends_at ? `${dateText(k.ends_at)} tarihine kadar` : null,
      `${k.used_count}${k.max_uses ? `/${k.max_uses}` : ''} kullanım`,
      k.active ? null : 'kapalı',
    ];
    return parts.filter(Boolean).join(', ');
  };

  return (
    <Page>
      <View style={{ backgroundColor: c.paper, borderRadius: radius.lg, overflow: 'hidden' }}>
        <Row icon="plus" title={editing === 'new' ? 'Vazgeç' : 'Yeni kampanya'} onPress={() => open(null)} chevron={false} />
        {editing === 'new' && editor}
      </View>
      <SectionTitle title={`Kampanyalar (${rows.length})`} />
      {rows.length === 0 ? (
        <Text style={[type.body, { color: c.muted }]}>Henüz kampanya yok. Müşteri, kodu Abonelik ekranında yazar.</Text>
      ) : (
        <Group>
          {rows.map((k) => (
            <View key={k.id}>
              <Row
                title={`${k.code}: ${k.name}`}
                subtitle={describe(k)}
                onPress={() => open(k)}
                chevron={false}
                right={<Text style={{ color: c.pen, fontWeight: '600' }}>{editing === k.id ? 'Kapat' : 'Düzenle'}</Text>}
              />
              {editing === k.id && editor}
            </View>
          ))}
        </Group>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  edit: { padding: space.lg, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
