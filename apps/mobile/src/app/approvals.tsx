import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Body, Card } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { dateText, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Report } from '@/lib/types';

type Row = Report & { owner_name?: string };

export default function Approvals() {
  const c = useColors();
  const { userId, active } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !active) return;
    setLoading(true);
    const { data } = await supabase
      .from('reports')
      .select('*')
      .eq('company_id', active.company_id)
      .eq('status', 'pending')
      .contains('current_approver_ids', [userId])
      .order('submitted_at', { ascending: true });
    const list = (data ?? []) as Row[];
    const owners = [...new Set(list.map((r) => r.owner_user_id))];
    if (owners.length) {
      const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', owners);
      const names = new Map((people ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
      list.forEach((r) => (r.owner_name = names.get(r.owner_user_id) || 'Çalışan'));
    }
    setRows(list);
    setLoading(false);
  }, [userId, active]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {rows.length === 0 && !loading && <Body muted>Onayınızı bekleyen rapor yok.</Body>}
      {rows.map((r) => (
        <Link key={r.id} href={{ pathname: '/report/[id]', params: { id: r.id } }} asChild>
          <Pressable>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                <Text style={[type.heading, { color: c.text, flex: 1 }]} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={[type.heading, { color: c.text, fontVariant: ['tabular-nums'] }]}>{money(r.total)}</Text>
              </View>
              <Text style={[type.small, { color: c.muted }]}>
                {r.owner_name} · {dateText(r.submitted_at)}
              </Text>
            </Card>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
