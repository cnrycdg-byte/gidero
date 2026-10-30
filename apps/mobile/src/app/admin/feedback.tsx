// Yönetim paneli: kullanıcıların uygulama içinden gönderdiği geri bildirimler.
// Yeniler üstte; okundu ya da tamamlandı işaretlenir, kullanıcıya görünen bir yanıt notu yazılır.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Empty, Field, Notice } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { KIND_LABEL, STATUS_LABEL, adminFeedback, setFeedback, type AdminFeedback, type FeedbackStatus } from '@/lib/feedback';
import { errorText } from '@/lib/supabase';

type Filter = 'new' | 'seen' | 'done' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'new', label: 'Yeni' },
  { key: 'seen', label: 'Okundu' },
  { key: 'done', label: 'Tamamlandı' },
  { key: 'all', label: 'Hepsi' },
];

function when(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminFeedbackScreen() {
  const c = useColors();
  const [filter, setFilter] = useState<Filter>('new');
  const [rows, setRows] = useState<AdminFeedback[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await adminFeedback(filter === 'all' ? undefined : filter));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function update(f: AdminFeedback, status: FeedbackStatus) {
    setBusy(true);
    setError(null);
    try {
      await setFeedback(f.id, status, open === f.id ? note : f.admin_note);
      setOpen(null);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function toggle(f: AdminFeedback) {
    if (open === f.id) return setOpen(null);
    setOpen(f.id);
    setNote(f.admin_note ?? '');
    // Açılan yeni geri bildirim okundu sayılır
    if (f.status === 'new') setFeedback(f.id, 'seen', f.admin_note).then(load).catch(() => {});
  }

  const kindColor = (k: AdminFeedback['kind']) => (k === 'bug' ? c.red : k === 'praise' ? c.green : k === 'question' ? c.blue : c.pen);

  return (
    <Page refreshing={loading} onRefresh={load}>
      <Text style={[type.title, { color: c.ink }]}>Geri bildirimler</Text>
      <Text style={[type.body, { color: c.muted }]}>Kullanıcıların uygulamadan gönderdikleri. Yazdığınız yanıt notu, gönderen kişiye kendi geri bildirim ekranında görünür.</Text>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
            style={({ pressed }) => [styles.filter, { backgroundColor: filter === f.key ? c.pen : c.fill, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ color: filter === f.key ? c.onPen : c.ink, fontWeight: '600', fontSize: 14 }}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Notice tone="bad" text={error} /> : null}
      {!loading && rows.length === 0 ? (
        <Empty icon="feedback" title={filter === 'new' ? 'Yeni geri bildirim yok' : 'Bu listede geri bildirim yok'} text="Kullanıcılar Hesabım > Geri bildirim gönder ekranından yazdığında burada görünür." />
      ) : null}

      {rows.map((f) => (
        <View key={f.id} style={[styles.card, { backgroundColor: c.paper }]}>
          <Pressable onPress={() => toggle(f)} accessibilityRole="button" style={{ gap: space.xs }}>
            <View style={styles.head}>
              <View style={[styles.kind, { backgroundColor: c.fill }]}>
                <Text style={{ color: kindColor(f.kind), fontWeight: '700', fontSize: 13 }}>{KIND_LABEL[f.kind]}</Text>
              </View>
              <Text style={[type.small, { color: c.muted, flex: 1 }]} numberOfLines={1}>
                {[f.user_name || f.user_email, f.company_name].filter(Boolean).join(' · ')}
              </Text>
              <Text style={[type.small, { color: f.status === 'new' ? c.amber : c.muted, fontWeight: '600' }]}>{STATUS_LABEL[f.status]}</Text>
            </View>
            <Text style={[type.body, { color: c.ink }]} numberOfLines={open === f.id ? undefined : 3}>{f.message}</Text>
            <Text style={[type.caption, { color: c.muted }]}>
              {[when(f.created_at), f.screen ? `Ekran: ${f.screen}` : null, f.app_info].filter(Boolean).join(' · ')}
            </Text>
            {f.admin_note && open !== f.id ? <Text style={[type.small, { color: c.pen }]}>{`Yanıtınız: ${f.admin_note}`}</Text> : null}
          </Pressable>
          {open === f.id ? (
            <View style={{ gap: space.sm, marginTop: space.sm }}>
              {f.user_email ? <Text style={[type.small, { color: c.muted }]}>{`E-posta: ${f.user_email}`}</Text> : null}
              <Field label="Yanıt notu (kullanıcı görür)" value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="Örnek: Teşekkürler, bu özelliği önümüzdeki sürüme ekliyoruz." />
              <View style={styles.actions}>
                <Button variant="secondary" title="Okundu olarak kaydet" onPress={() => update(f, 'seen')} loading={busy} />
                <Button icon="check" title="Tamamlandı" onPress={() => update(f, 'done')} loading={busy} />
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  filter: { minHeight: 36, borderRadius: radius.pill, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.md, padding: space.lg, gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kind: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
