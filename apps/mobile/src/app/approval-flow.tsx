import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Notice } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { amountInput, money, parseAmount } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Kind = 'manager' | 'skip_level' | 'role:admin' | 'role:accountant' | 'role:approver' | 'user' | 'cost_center_owner';
type Draft = { kind: Kind; user: string | null; min: string; name: string };
type Person = { user_id: string; full_name: string };

const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: 'manager', label: 'Çalışanın yöneticisi', hint: 'Ekip ekranında çalışana bağlanan kişi onaylar.' },
  { key: 'skip_level', label: 'Yöneticinin yöneticisi', hint: 'Bir üst kademe onaylar.' },
  { key: 'role:admin', label: 'Şirket yöneticisi', hint: 'Şirket yöneticilerinden biri onaylar.' },
  { key: 'role:accountant', label: 'Muhasebeci', hint: 'Şirket muhasebecisi ya da atanmış büro muhasebecisi onaylar.' },
  { key: 'role:approver', label: 'Onaylayıcılar', hint: '"Onaylayıcı" rolündeki herkes onaylayabilir.' },
  { key: 'user', label: 'Belirli bir kişi', hint: 'Seçtiğiniz kişi onaylar (ör. finans müdürü).' },
];
const LABEL: Record<Kind, string> = {
  ...Object.fromEntries(KINDS.map((k) => [k.key, k.label])),
  cost_center_owner: 'Masraf merkezi sorumlusu',
} as Record<Kind, string>;

type StepRow = { approver_type: string; approver_role: string | null; approver_user_id: string | null; min_total: number | null; name: string };

function toDraft(s: StepRow): Draft {
  const kind = (s.approver_type === 'role' ? `role:${s.approver_role}` : s.approver_type) as Kind;
  return { kind, user: s.approver_user_id, min: s.min_total != null ? amountInput(Number(s.min_total)) : '', name: s.name };
}

// Şirket yöneticisi: rapor gönderilince sırayla kimlerin onaylayacağını kurar
export default function ApprovalFlow() {
  const c = useColors();
  const { active, hasRole } = useSession();
  const [steps, setSteps] = useState<Draft[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      const { data: flows, error: e1 } = await supabase
        .from('approval_flows')
        .select('id, priority, created_at')
        .eq('company_id', active.company_id)
        .eq('active', true)
        .order('priority', { ascending: false })
        .order('created_at')
        .limit(1);
      if (e1) throw e1;
      let list: StepRow[] = [];
      if (flows?.[0]) {
        const { data, error: e2 } = await supabase
          .from('approval_steps')
          .select('approver_type, approver_role, approver_user_id, min_total, name')
          .eq('flow_id', flows[0].id)
          .order('position');
        if (e2) throw e2;
        list = (data ?? []) as StepRow[];
      }
      setSteps(list.map(toDraft));
      const { data: ms } = await supabase.from('memberships').select('user_id').eq('company_id', active.company_id).eq('status', 'active');
      const ids = (ms ?? []).map((m: { user_id: string }) => m.user_id);
      const { data: ps } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
      setPeople(((ps ?? []) as { id: string; full_name: string }[]).map((p) => ({ user_id: p.id, full_name: p.full_name || 'İsimsiz kullanıcı' })));
      setDirty(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [active]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const update = (i: number, d: Partial<Draft>) => {
    setSteps(steps.map((s, j) => (j === i ? { ...s, ...d } : s)));
    setDirty(true);
    setInfo(null);
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
    setDirty(true);
  };

  async function save() {
    if (!active) return;
    setError(null);
    setInfo(null);
    const payload = [];
    for (const [i, s] of steps.entries()) {
      const min = s.min.trim() ? parseAmount(s.min) : null;
      if (s.min.trim() && (min == null || min < 0)) return setError(`${i + 1}. adım: tutarı rakamla yazın ya da boş bırakın.`);
      if (s.kind === 'user' && !s.user) return setError(`${i + 1}. adım: onaylayacak kişiyi seçin.`);
      const [t, role] = s.kind.split(':');
      payload.push({
        approver_type: t,
        approver_role: role ?? null,
        approver_user_id: s.kind === 'user' ? s.user : null,
        min_total: min,
        name: s.name.trim() || LABEL[s.kind],
      });
    }
    setBusy(true);
    const { error: e } = await supabase.rpc('set_approval_steps', { p_company: active.company_id, p_steps: payload });
    setBusy(false);
    if (e) return setError(errorText(e));
    setInfo('Onay şeması kaydedildi. Bundan sonra gönderilen raporlar bu sırayla onaylanır.');
    load();
  }

  if (!hasRole('admin')) {
    return (
      <Page>
        <Notice text="Onay şemasını yalnızca şirket yöneticisi değiştirebilir." />
      </Page>
    );
  }

  const nameOf = (id: string | null) => people.find((p) => p.user_id === id)?.full_name ?? 'kişi seçilmedi';
  const summary = steps.length
    ? steps
        .map((s, i) => `${i + 1}) ${s.kind === 'user' ? nameOf(s.user) : LABEL[s.kind]}${s.min.trim() ? ` (${money(parseAmount(s.min) ?? 0)} üstüyse)` : ''}`)
        .join(', ')
    : null;

  return (
    <Page refreshing={loading} onRefresh={load}>
      <Text style={[type.body, { color: c.muted }]}>
        Çalışan raporu gönderince adımlar sırayla işler. Son adım da onaylayınca rapor muhasebeye düşer. Kimse kendi raporunu onaylayamaz; o adımda bir üst kademe ya da şirket yöneticisi onaylar.
      </Text>

      <View style={[styles.summary, { backgroundColor: c.deep }]}>
        <Text style={[type.small, { color: c.onDeepMuted, fontWeight: '600' }]}>RAPOR GÖNDERİLİNCE</Text>
        <Text style={[type.bodyStrong, { color: c.onDeep }]}>
          {summary ? `${summary}, sonra muhasebe.` : 'Onay istenmez; rapor doğrudan muhasebeye düşer.'}
        </Text>
      </View>

      {steps.map((s, i) => (
        <View key={i} style={[styles.card, { backgroundColor: c.paper }]}>
          <View style={styles.head}>
            <Text style={[type.bodyStrong, { color: c.ink, flex: 1 }]}>{`${i + 1}. adım`}</Text>
            <Small title="Yukarı" onPress={() => move(i, -1)} disabled={i === 0} />
            <Small title="Aşağı" onPress={() => move(i, 1)} disabled={i === steps.length - 1} />
            <Small title="Sil" danger onPress={() => { setSteps(steps.filter((_, j) => j !== i)); setDirty(true); }} />
          </View>
          <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Kim onaylayacak?</Text>
          <View style={styles.chips}>
            {(s.kind === 'cost_center_owner' ? [...KINDS, { key: 'cost_center_owner' as Kind, label: LABEL.cost_center_owner, hint: '' }] : KINDS).map((k) => {
              const on = s.kind === k.key;
              return (
                <Pressable key={k.key} onPress={() => update(i, { kind: k.key, name: '' })} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
                  <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{k.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[type.small, { color: c.muted }]}>{KINDS.find((k) => k.key === s.kind)?.hint ?? ''}</Text>
          {s.kind === 'user' && (
            <View style={styles.chips}>
              {people.map((p) => {
                const on = s.user === p.user_id;
                return (
                  <Pressable key={p.user_id} onPress={() => update(i, { user: p.user_id })} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
                    <Text style={{ color: on ? c.onPen : c.ink }}>{p.full_name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Field
            label="Yalnızca rapor bu tutarı geçerse (isteğe bağlı)"
            value={s.min}
            onChangeText={(v) => update(i, { min: v })}
            keyboardType="decimal-pad"
            placeholder="Boş: her raporda"
          />
        </View>
      ))}

      {steps.length < 6 && (
        <Button
          variant="secondary"
          icon="plus"
          title={steps.length ? 'Adım ekle' : 'İlk onay adımını ekle'}
          onPress={() => {
            setSteps([...steps, { kind: steps.length ? 'role:admin' : 'manager', user: null, min: '', name: '' }]);
            setDirty(true);
          }}
        />
      )}
      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}
      <Button title="Onay şemasını kaydet" onPress={save} loading={busy} disabled={!dirty} />
      <Text style={[type.small, { color: c.muted }]}>Daha önce gönderilmiş raporlar eski şemayla devam eder. Değişiklikler kayıt altında tutulur.</Text>
    </Page>
  );
}

function Small({ title, onPress, disabled, danger }: { title: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={[styles.small, { backgroundColor: danger ? c.redSoft : c.canvas, opacity: disabled ? 0.35 : 1 }]}>
      <Text style={{ color: danger ? c.red : c.ink, fontSize: 13, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: radius.lg, padding: space.lg, gap: 4 },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  small: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
});
