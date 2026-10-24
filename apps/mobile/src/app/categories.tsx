import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { amountInput, money, parseAmount } from '@/lib/format';
import { PERIOD_LABEL, type LimitPeriod } from '@/lib/limits';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Cat = { id: string; name: string; limit_amount: number | null; limit_period: LimitPeriod | null };

const PERIODS: (LimitPeriod | null)[] = [null, 'month', 'quarter', 'half', 'year'];

// Muhasebeci veya yönetici gider gruplarına kişi başı üst limit ve dönem tanımlar.
export default function Categories() {
  const c = useColors();
  const { active, hasRole } = useSession();
  const [cats, setCats] = useState<Cat[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<LimitPeriod | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasRole('admin') || hasRole('accountant');

  const load = useCallback(async () => {
    if (!active) return;
    const { data } = await supabase
      .from('categories')
      .select('id, name, limit_amount, limit_period')
      .eq('company_id', active.company_id)
      .eq('active', true)
      .order('name');
    setCats((data ?? []) as Cat[]);
  }, [active]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function open(k: Cat) {
    if (!canEdit) return;
    setEditing(editing === k.id ? null : k.id);
    setAmount(k.limit_amount ? amountInput(k.limit_amount) : '');
    setPeriod(k.limit_period ?? 'month');
    setError(null);
  }

  async function save(k: Cat) {
    setError(null);
    const value = amount.trim() ? parseAmount(amount) : null;
    if (period && (value == null || value <= 0)) return setError('Sınır tutarını yazın ya da “Sınırsız”ı seçin.');
    setBusy(true);
    const { error: e } = await supabase
      .from('categories')
      .update(period ? { limit_amount: value, limit_period: period } : { limit_amount: null, limit_period: null })
      .eq('id', k.id);
    setBusy(false);
    if (e) return setError(errorText(e));
    setEditing(null);
    load();
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <Text style={[type.body, { color: c.muted }]}>
        Her gider grubu için kişi başı üst sınır ve dönem belirleyin. Dönemler takvime göredir: 3 aylık sınır Ocak–Mart,
        Nisan–Haziran gibi çeyreklerde sıfırlanır. Sınırı aşan fiş onaylayıcıya uyarıyla gider.
      </Text>
      {!canEdit && <Notice text="Sınırları yalnızca yönetici veya muhasebeci değiştirebilir." />}

      <SectionTitle title="Gider grupları" />
      <Group>
        {cats.map((k) => (
          <View key={k.id}>
            <Row
              title={k.name}
              subtitle={k.limit_amount && k.limit_period ? `${PERIOD_LABEL[k.limit_period]} kişi başı ${money(k.limit_amount)}` : 'Sınırsız'}
              onPress={canEdit ? () => open(k) : undefined}
              chevron={false}
              right={canEdit ? <Text style={{ color: c.pen, fontWeight: '600' }}>{editing === k.id ? 'Kapat' : 'Düzenle'}</Text> : undefined}
            />
            {editing === k.id && (
              <View style={[styles.edit, { borderTopColor: c.paperLine }]}>
                <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Dönem</Text>
                <View style={styles.chips}>
                  {PERIODS.map((p) => {
                    const on = p === period;
                    return (
                      <Pressable key={p ?? 'none'} onPress={() => setPeriod(p)} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
                        <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{p ? PERIOD_LABEL[p] : 'Sınırsız'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {period && (
                  <Field
                    label={`${PERIOD_LABEL[period]} kişi başı sınır (₺)`}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="5.000,00"
                  />
                )}
                {error && <Notice tone="bad" text={error} />}
                <Button title="Kaydet" onPress={() => save(k)} loading={busy} />
              </View>
            )}
          </View>
        ))}
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  edit: { padding: space.lg, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
});
