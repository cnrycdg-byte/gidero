import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';

import { Empty, Group, Row } from '@/components/ui';
import { space } from '@/constants/theme';
import { dateText, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Report } from '@/lib/types';

type Item = Report & { owner_name?: string };

export default function Approvals() {
  const { userId, active } = useSession();
  const [rows, setRows] = useState<Item[]>([]);
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
    const list = (data ?? []) as Item[];
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
      {rows.length === 0 && !loading ? (
        <Empty icon="checkCircle" title="Bekleyen onay yok" text="Ekibinizden yeni rapor geldiğinde burada görünür." />
      ) : (
        <Group>
          {rows.map((r) => (
            <Row
              key={r.id}
              icon="inbox"
              title={r.title}
              subtitle={`${r.owner_name}, ${dateText(r.submitted_at)}`}
              value={money(r.total)}
              onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })}
            />
          ))}
        </Group>
      )}
    </ScrollView>
  );
}
