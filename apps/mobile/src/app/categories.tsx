import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { amountInput, money, parseAmount } from '@/lib/format';
import { PERIOD_LABEL, type LimitPeriod } from '@/lib/limits';
import { confirm } from '@/lib/confirm';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Cat = {
  id: string;
  name: string;
  expense_account: string;
  default_vat_rate: number | null;
  tax_rule: string;
  attendees_required: boolean;
  limit_amount: number | null;
  limit_period: LimitPeriod | null;
  kkeg_ratio: number | null;
  active: boolean;
};

const PERIODS: (LimitPeriod | null)[] = [null, 'month', 'quarter', 'half', 'year'];
const VAT_RATES = [20, 10, 1, 0];

// Vergi motorunun bu gruba nasıl bakacağı (fiş kontrolündeki kurallar buna göre çalışır)
const TAX_RULES: { key: string; label: string; hint: string }[] = [
  { key: 'standard', label: 'Genel gider', hint: 'Özel kural yok' },
  { key: 'meal', label: 'Yemek', hint: 'Kimlerle yenildiği istenir' },
  { key: 'representation', label: 'Temsil ve ağırlama', hint: 'Misafir bilgisi istenir' },
  { key: 'accommodation', label: 'Konaklama', hint: 'Konaklama vergisi kontrol edilir' },
  { key: 'fuel', label: 'Akaryakıt', hint: 'Plaka okunur ve kartla karşılaştırılır' },
  { key: 'car_running', label: 'Araç gideri', hint: 'Binek araç gider kısıtı uygulanır' },
  { key: 'car_rent', label: 'Araç kirası', hint: 'Aylık kira sınırı kontrol edilir' },
  { key: 'travel', label: 'Ulaşım ve seyahat', hint: 'Bilet, taksi, otopark' },
  { key: 'per_diem', label: 'Harcırah', hint: 'Gündelik sınırı kontrol edilir' },
  { key: 'mileage', label: 'Kilometre ödemesi', hint: 'Bordroya aktarılır' },
  { key: 'kkeg', label: 'Kabul edilmeyen gider', hint: 'Vergiden düşülmez, kayda alınır' },
];
const RULE_LABEL = Object.fromEntries(TAX_RULES.map((r) => [r.key, r.label]));

type Draft = {
  name: string;
  account: string;
  vat: number | null;
  rule: string;
  attendees: boolean;
  period: LimitPeriod | null;
  amount: string;
  kkeg: string;
};

const EMPTY: Draft = { name: '', account: '770.', vat: 20, rule: 'standard', attendees: false, period: null, amount: '', kkeg: '' };

// Muhasebeci veya yönetici gider gruplarını ekler, düzenler ve kişi başı dönemsel sınır koyar.
export default function Categories() {
  const c = useColors();
  const { active, hasRole } = useSession();
  const [cats, setCats] = useState<Cat[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasRole('admin') || hasRole('accountant');

  const load = useCallback(async () => {
    if (!active) return;
    const { data } = await supabase
      .from('categories')
      .select('id, name, expense_account, default_vat_rate, tax_rule, attendees_required, limit_amount, limit_period, kkeg_ratio, active')
      .eq('company_id', active.company_id)
      .order('name');
    setCats((data ?? []) as Cat[]);
  }, [active]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  function open(k: Cat | null) {
    if (!canEdit) return;
    setError(null);
    if (!k) {
      setEditing(editing === 'new' ? null : 'new');
      setDraft(EMPTY);
      return;
    }
    setEditing(editing === k.id ? null : k.id);
    setDraft({
      name: k.name,
      account: k.expense_account,
      vat: k.default_vat_rate == null ? null : Number(k.default_vat_rate),
      rule: k.tax_rule,
      attendees: k.attendees_required,
      period: k.limit_period,
      amount: k.limit_amount ? amountInput(k.limit_amount) : '',
      kkeg: k.kkeg_ratio == null ? '' : String(Number(k.kkeg_ratio)),
    });
  }

  async function save(id: string | 'new') {
    if (!active) return;
    setError(null);
    const name = draft.name.trim();
    if (name.length < 2) return setError('Gider grubuna bir ad verin.');
    if (!/^\d{3}(\.\d{1,3}){0,3}$/.test(draft.account.trim())) {
      return setError('Muhasebe hesap kodunu 770.01 biçiminde yazın.');
    }
    const amount = draft.period ? parseAmount(draft.amount) : null;
    if (draft.period && (amount == null || amount <= 0)) return setError('Sınır tutarını yazın ya da “Sınırsız”ı seçin.');
    const kkeg = draft.kkeg.trim() === '' ? null : Number(draft.kkeg.replace(',', '.'));
    if (kkeg != null && !(kkeg >= 0 && kkeg <= 100)) return setError('Kabul edilmeyen payı 0 ile 100 arasında yazın.');

    const row = {
      name,
      expense_account: draft.account.trim(),
      default_vat_rate: draft.vat,
      tax_rule: draft.rule,
      attendees_required: draft.attendees || draft.rule === 'meal' || draft.rule === 'representation',
      limit_amount: draft.period ? amount : null,
      limit_period: draft.period,
      kkeg_ratio: kkeg,
    };
    setBusy(true);
    const { error: e } =
      id === 'new'
        ? await supabase.from('categories').insert({ ...row, company_id: active.company_id })
        : await supabase.from('categories').update(row).eq('id', id);
    setBusy(false);
    if (e) {
      return setError(/duplicate|unique/i.test(e.message) ? 'Bu adla bir gider grubu zaten var.' : errorText(e));
    }
    setEditing(null);
    load();
  }

  function toggleActive(k: Cat) {
    const go = async () => {
      const { error: e } = await supabase.from('categories').update({ active: !k.active }).eq('id', k.id);
      if (e) return setError(errorText(e));
      setEditing(null);
      load();
    };
    if (!k.active) return go();
    confirm(
      `${k.name} kullanımdan kaldırılsın mı?`,
      'Yeni fişlerde seçilemez. Eski fişler ve raporlar etkilenmez; istediğinizde geri açabilirsiniz.',
      'Kaldır',
      go,
    );
  }

  const editor = (id: string | 'new', k?: Cat) => (
    <View style={[styles.edit, { borderTopColor: c.paperLine }]}>
      <Field label="Gider grubunun adı" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Örnek: Kargo ve kurye" />
      <Field
        label="Muhasebe hesap kodu"
        value={draft.account}
        onChangeText={(v) => set({ account: v })}
        keyboardType="numbers-and-punctuation"
        placeholder="770.08"
        hint="Muhasebe programına aktarımda bu hesaba yazılır (ör. 770 genel yönetim, 760 pazarlama)."
      />

      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Vergi kontrolü</Text>
      <View style={styles.chips}>
        {TAX_RULES.map((r) => {
          const on = r.key === draft.rule;
          return (
            <Pressable key={r.key} onPress={() => set({ rule: r.key })} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[type.small, { color: c.muted, marginTop: -space.xs }]}>{TAX_RULES.find((r) => r.key === draft.rule)?.hint}</Text>
      {(draft.rule === 'fuel' || draft.rule === 'car_running' || draft.rule === 'car_rent' || draft.kkeg !== '') && (
        <Field
          label="Kanunen kabul edilmeyen pay (%)"
          value={draft.kkeg}
          onChangeText={(v) => set({ kkeg: v.replace(/[^0-9,.]/g, '') })}
          placeholder="Binek araç için 30, değilse boş bırakın"
          keyboardType="decimal-pad"
        />
      )}

      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Varsayılan KDV oranı</Text>
      <View style={styles.chips}>
        {VAT_RATES.map((v) => {
          const on = v === draft.vat;
          return (
            <Pressable key={v} onPress={() => set({ vat: v })} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>%{v}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { color: c.ink }]}>Kimlerle yapıldığı zorunlu</Text>
          <Text style={[type.small, { color: c.muted }]}>Çalışan masrafı kimlerle yaptığını yazmadan kaydedemez.</Text>
        </View>
        <Switch
          value={draft.attendees || draft.rule === 'meal' || draft.rule === 'representation'}
          disabled={draft.rule === 'meal' || draft.rule === 'representation'}
          onValueChange={(v) => set({ attendees: v })}
          trackColor={{ true: c.pen }}
        />
      </View>

      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Kişi başı sınır</Text>
      <View style={styles.chips}>
        {PERIODS.map((p) => {
          const on = p === draft.period;
          return (
            <Pressable key={p ?? 'none'} onPress={() => set({ period: p })} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{p ? PERIOD_LABEL[p] : 'Sınırsız'}</Text>
            </Pressable>
          );
        })}
      </View>
      {draft.period && (
        <Field
          label={`${PERIOD_LABEL[draft.period]} kişi başı sınır (₺)`}
          value={draft.amount}
          onChangeText={(v) => set({ amount: v })}
          keyboardType="decimal-pad"
          placeholder="5.000,00"
        />
      )}

      {error && <Notice tone="bad" text={error} />}
      <Button title={id === 'new' ? 'Gider grubunu ekle' : 'Kaydet'} icon={id === 'new' ? 'plus' : 'check'} onPress={() => save(id)} loading={busy} />
      {k && (
        <Button
          variant="plain"
          title={k.active ? 'Kullanımdan kaldır' : 'Yeniden kullanıma aç'}
          onPress={() => toggleActive(k)}
        />
      )}
    </View>
  );

  const activeCats = cats.filter((k) => k.active);
  const passive = cats.filter((k) => !k.active);

  const row = (k: Cat) => (
    <View key={k.id}>
      <Row
        title={k.name}
        subtitle={[
          RULE_LABEL[k.tax_rule] ?? k.tax_rule,
          k.expense_account,
          k.limit_amount && k.limit_period ? `${PERIOD_LABEL[k.limit_period]} ${money(k.limit_amount)}` : 'Sınırsız',
        ].join(', ')}
        onPress={canEdit ? () => open(k) : undefined}
        chevron={false}
        right={canEdit ? <Text style={{ color: c.pen, fontWeight: '600' }}>{editing === k.id ? 'Kapat' : 'Düzenle'}</Text> : undefined}
      />
      {editing === k.id && editor(k.id, k)}
    </View>
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled">
      <Text style={[type.body, { color: c.muted }]}>
        Çalışanlar fişlerini bu gruplardan birine koyar. Her grubun muhasebe hesabını, vergi kontrolünü ve kişi başı
        sınırını buradan belirleyin.
      </Text>
      {!canEdit && <Notice text="Gider gruplarını yalnızca yönetici veya muhasebeci değiştirebilir." />}

      {canEdit && (
        <View style={[styles.newBox, { backgroundColor: c.paper }]}>
          <Pressable onPress={() => open(null)} style={styles.newHead}>
            <View style={[styles.plus, { backgroundColor: c.pen }]}>
              <Icon name={editing === 'new' ? 'close' : 'plus'} size={16} color={c.onPen} />
            </View>
            <Text style={[type.bodyStrong, { color: c.pen }]}>{editing === 'new' ? 'Vazgeç' : 'Yeni gider grubu ekle'}</Text>
          </Pressable>
          {editing === 'new' && editor('new')}
        </View>
      )}

      <SectionTitle title={`Gider grupları (${activeCats.length})`} />
      <Group>{activeCats.map(row)}</Group>

      {passive.length > 0 && (
        <>
          <SectionTitle title="Kullanımdan kaldırılanlar" />
          <Group>{passive.map(row)}</Group>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  edit: { padding: space.lg, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  newBox: { borderRadius: radius.lg, overflow: 'hidden' },
  newHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  plus: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
