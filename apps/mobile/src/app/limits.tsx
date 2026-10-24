import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { LimitBars } from '@/components/limit-bars';
import { Text } from '@/components/text';
import { Empty, Notice, SectionTitle } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { fetchUsage, usageState, type Usage } from '@/lib/limits';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';

// Yönetici ve muhasebe: herkesin, onaylayıcı: ekibinin gider grubu sınır durumu. Aşanlar en üstte.
export default function Limits() {
  const c = useColors();
  const { active, hasRole } = useSession();
  const [rows, setRows] = useState<Usage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchUsage(active.company_id));
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

  const people = useMemo(() => {
    const map = new Map<string, { name: string; rows: Usage[]; worst: number; overCount: number }>();
    rows.forEach((r) => {
      const p = map.get(r.user_id) ?? { name: r.full_name || 'İsimsiz kullanıcı', rows: [], worst: 0, overCount: 0 };
      const s = usageState(r);
      p.rows.push(r);
      p.worst = Math.max(p.worst, s.ratio);
      if (s.over) p.overCount += 1;
      map.set(r.user_id, p);
    });
    return [...map.entries()].sort((a, b) => b[1].worst - a[1].worst);
  }, [rows]);

  const overPeople = people.filter(([, p]) => p.overCount > 0).length;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {error && <Notice tone="bad" text={error} />}

      {rows.length > 0 && (
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Stat value={people.length} label="kişi" />
          <Stat value={overPeople} label="sınırı aşan" tone={overPeople ? 'bad' : 'ok'} />
        </View>
      )}

      {rows.length === 0 && !loading && (
        <Empty
          icon="receipt"
          title="Sınır tanımlı gider grubu yok"
          text="Gider gruplarına kişi başı aylık, 3 aylık, 6 aylık veya yıllık sınır koyduğunuzda herkesin durumu burada görünür."
        />
      )}
      {(hasRole('admin') || hasRole('accountant')) && (
        <Pressable onPress={() => router.push('/categories')}>
          <Text style={{ color: c.pen, fontWeight: '600', textAlign: 'center' }}>Gider grubu sınırlarını düzenle</Text>
        </Pressable>
      )}

      {people.map(([id, p]) => (
        <View key={id} style={{ gap: space.sm }}>
          <SectionTitle
            title={p.name}
            action={
              p.overCount ? (
                <Text style={[type.small, { color: c.red, fontWeight: '700' }]}>{p.overCount} grupta aşım</Text>
              ) : undefined
            }
          />
          <LimitBars rows={p.rows} />
        </View>
      ))}
    </ScrollView>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'bad' | 'ok' }) {
  const c = useColors();
  const color = tone === 'bad' ? c.red : c.ink;
  return (
    <View style={{ flex: 1, backgroundColor: c.paper, borderRadius: radius.lg, padding: space.lg }}>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 28, color }}>{value}</Text>
      <Text style={[type.small, { color: c.muted }]}>{label}</Text>
    </View>
  );
}
