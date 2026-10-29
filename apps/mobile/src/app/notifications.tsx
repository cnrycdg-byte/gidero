import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Group, Notice, Row } from '@/components/ui';
import { type, useColors } from '@/constants/theme';
import { dateText } from '@/lib/format';
import { fetchNotifications, markRead, type AppNotification } from '@/lib/notifications';
import { errorText } from '@/lib/supabase';

const ICON = { approval_needed: 'inbox', approved: 'checkCircle', returned: 'undo', ready_for_accounting: 'doc', paid: 'checkCircle', payment_needed: 'receipt' } as const;

export default function NotificationsScreen() {
  const c = useColors();
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchNotifications());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function open(n: AppNotification) {
    if (!n.read_at) {
      await markRead([n.id]);
      setRows((r) => r.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    if (n.kind === 'payment_needed') router.push('/payments');
    else if (n.report_id) router.push({ pathname: '/report/[id]', params: { id: n.report_id } });
  }

  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <Page refreshing={loading} onRefresh={load}>
      {error && <Notice tone="bad" text={error} />}
      {unread > 0 && (
        <Button
          title="Hepsini okundu yap"
          variant="plain"
          onPress={async () => {
            await markRead();
            load();
          }}
        />
      )}
      {rows.length === 0 && !loading ? (
        <Text style={[type.body, { color: c.muted, textAlign: 'center' }]}>
          Henüz bildirim yok. Rapor onaya gittiğinde, onaylandığında ya da iade edildiğinde burada görünür.
        </Text>
      ) : (
        <Group>
          {rows.map((n) => (
            <Row
              key={n.id}
              icon={ICON[n.kind] ?? 'inbox'}
              iconColor={n.read_at ? c.faint : n.kind === 'returned' ? c.red : c.pen}
              iconBg={n.read_at ? c.canvas : n.kind === 'returned' ? c.redSoft : c.penSoft}
              title={n.title}
              subtitle={`${n.body}, ${dateText(n.created_at)}`}
              onPress={() => open(n)}
            />
          ))}
        </Group>
      )}
    </Page>
  );
}
