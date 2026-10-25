import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Group, Notice, Row } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { chatMessages, chatSessions, setChatHandled, type ChatMessage, type ChatSession } from '@/lib/admin';
import { errorText } from '@/lib/supabase';

type Filter = 'all' | 'waiting' | 'contact';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'waiting', label: 'Dönüş bekleyen' },
  { key: 'contact', label: 'İletişim bırakan' },
  { key: 'all', label: 'Hepsi' },
];

function when(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Tanıtım sitesindeki sohbet asistanına kim ne sordu, ne yanıt verildi
export default function AdminChats() {
  const c = useColors();
  const [rows, setRows] = useState<ChatSession[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [filter, setFilter] = useState<Filter>('waiting');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await chatSessions());
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

  async function toggle(id: string) {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    setMsgs([]);
    try {
      setMsgs(await chatMessages(id));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function markHandled(s: ChatSession) {
    try {
      await setChatHandled(s.id, !s.handled);
      setRows((r) => r.map((x) => (x.id === s.id ? { ...x, handled: !s.handled } : x)));
    } catch (e) {
      setError(errorText(e));
    }
  }

  const list = rows.filter((r) =>
    filter === 'waiting' ? r.needs_human && !r.handled : filter === 'contact' ? !!r.contact : true,
  );
  const waiting = rows.filter((r) => r.needs_human && !r.handled).length;

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      {error && <Notice tone="bad" text={error} />}
      <Text style={[type.body, { color: c.muted }]}>
        {`Son 200 sohbet. ${waiting ? `${waiting} sohbet sizden dönüş bekliyor.` : 'Dönüş bekleyen sohbet yok.'}`}
      </Text>
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, { backgroundColor: on ? c.pen : c.paper }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Group>
        {list.map((s) => (
          <View key={s.id}>
            <Row
              icon={s.needs_human && !s.handled ? 'warning' : 'send'}
              iconColor={s.needs_human && !s.handled ? c.amber : c.pen}
              iconBg={s.needs_human && !s.handled ? c.amberSoft : c.penSoft}
              title={s.contact ?? 'İletişim bilgisi yok'}
              subtitle={`${when(s.last_at)}, ${s.message_count} mesaj${s.handled ? ', ilgilenildi' : ''}`}
              onPress={() => toggle(s.id)}
            />
            {open === s.id && (
              <View style={[styles.thread, { borderColor: c.paperLine }]}>
                {msgs.map((m) => (
                  <View
                    key={m.id}
                    style={[
                      styles.bubble,
                      m.role === 'visitor'
                        ? { alignSelf: 'flex-start', backgroundColor: c.canvas }
                        : { alignSelf: 'flex-end', backgroundColor: c.penSoft },
                    ]}>
                    <Text style={[type.small, { color: c.muted }]}>{`${m.role === 'visitor' ? 'Ziyaretçi' : 'Gidero yanıtı'}, ${when(m.created_at)}`}</Text>
                    <Text style={[type.body, { color: c.ink }]}>{m.content}</Text>
                  </View>
                ))}
                <Button
                  title={s.handled ? 'Dönüş bekliyor olarak işaretle' : 'İlgilenildi olarak işaretle'}
                  variant="secondary"
                  onPress={() => markHandled(s)}
                />
              </View>
            )}
          </View>
        ))}
      </Group>
      {list.length === 0 && !loading && <Text style={[type.body, { color: c.muted, textAlign: 'center' }]}>Bu filtrede sohbet yok.</Text>}
    </Page>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  thread: { padding: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  bubble: { maxWidth: '88%', borderRadius: radius.md, padding: space.md, gap: 2 },
});
