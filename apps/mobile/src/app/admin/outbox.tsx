// Gönderim kutusu: hazırlanan tanıtım e-postaları. Hiçbiri kendiliğinden gitmez; okuyup seçtiklerinizi siz gönderirsiniz.
// Takip e-postaları (3. ve 7. gün) zamanı gelince "Onay bekleyen" listesine düşer. Yanıt veren ya da listeden çıkan
// firmanın kalan e-postaları otomatik atlanır.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Check, Chips } from '@/components/chips';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Empty, Field, Notice } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { editMessage, listMessages, outreachSettings, sendMessages, type OutMessage } from '@/lib/leads';
import { errorText } from '@/lib/supabase';

type Tab = 'due' | 'later' | 'sent' | 'other';
const STEP = ['', 'İlk e-posta', 'Hatırlatma', 'Son e-posta'];
const when = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });

export default function Outbox() {
  const c = useColors();
  const [rows, setRows] = useState<OutMessage[]>([]);
  const [cap, setCap] = useState(40);
  const [tab, setTab] = useState<Tab>('due');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([listMessages(), outreachSettings()]);
      setRows(m);
      setCap(s.cap);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const now = Date.now();
  const groups = useMemo(() => {
    const g: Record<Tab, OutMessage[]> = { due: [], later: [], sent: [], other: [] };
    for (const m of rows) {
      if (m.status === 'draft') g[new Date(m.due_at).getTime() <= now ? 'due' : 'later'].push(m);
      else if (m.status === 'sent') g.sent.unshift(m);
      else g.other.unshift(m);
    }
    return g;
  }, [rows, now]);
  const sentToday = rows.filter((m) => m.sent_at && new Date(m.sent_at).toDateString() === new Date().toDateString()).length;
  const shown = groups[tab];

  function send() {
    const ids = [...picked];
    confirm(
      `${ids.length} e-posta gönderilsin mi?`,
      'Seçtiğiniz e-postalar şimdi alıcılara gider. Her e-postanın altında gönderen bilgileriniz ve listeden çıkma bağlantısı bulunur.',
      'Gönder',
      async () => {
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
          const r = await sendMessages(ids);
          setPicked(new Set());
          setInfo(
            [`${r.sent} e-posta gönderildi.`, r.skipped ? `${r.skipped} tanesi atlandı (listeden çıkmış ya da yanıt vermiş).` : '',
              r.failed ? `${r.failed} tanesi gönderilemedi; "Gönderilemeyen" sekmesinde nedenini görün.` : '',
              `Bugün ${r.left_today} e-posta daha gönderebilirsiniz.`].filter(Boolean).join(' '),
          );
          await load();
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      },
      false,
    );
  }

  return (
    <Page refreshing={loading} onRefresh={load}>
      <Text style={[type.title, { color: c.ink }]}>Gönderim kutusu</Text>
      <Text style={[type.body, { color: c.muted }]}>
        Taslakları okuyun, gerekirse düzeltin, sonra seçip gönderin. Takip e-postaları zamanı gelince bu listeye düşer.
      </Text>
      <View style={styles.actions}>
        <Button variant="secondary" icon="settings" title="Gönderen bilgileri ve şablonlar" onPress={() => router.push('/admin/outreach-settings')} />
        <Button variant="secondary" icon="people" title="Müşteri adayları" onPress={() => router.push('/admin/leads')} />
      </View>
      <Text style={[type.small, { color: c.muted }]}>{`Bugün ${sentToday} / ${cap} e-posta gönderildi. Günlük sınır, adresinizin istenmeyen e-posta sayılmaması içindir.`}</Text>

      <Chips<Tab>
        items={[
          { key: 'due', label: 'Onay bekleyen', count: groups.due.length },
          { key: 'later', label: 'Planlanan', count: groups.later.length },
          { key: 'sent', label: 'Gönderilen', count: groups.sent.length },
          { key: 'other', label: 'Gönderilemeyen ve atlanan', count: groups.other.length },
        ]}
        value={tab}
        onChange={(t) => { setTab(t); setPicked(new Set()); setOpen(null); }}
      />

      {error ? <Notice tone="bad" text={error} /> : null}
      {info ? <Notice tone="ok" text={info} /> : null}

      {tab === 'due' && shown.length ? (
        <View style={[styles.bar, { backgroundColor: c.penSoft }]}>
          <Check
            on={shown.every((m) => picked.has(m.id))}
            label="Hepsini seç"
            onPress={() => setPicked(shown.every((m) => picked.has(m.id)) ? new Set() : new Set(shown.map((m) => m.id)))}
          />
          <Text style={[type.subhead, { color: c.ink, flex: 1 }]}>{picked.size ? `${picked.size} e-posta seçildi` : 'Göndermek istediklerinizi seçin'}</Text>
          <Button icon="send" title="Seçilenleri gönder" onPress={send} loading={busy} disabled={!picked.size} />
        </View>
      ) : null}

      {!loading && shown.length === 0 ? (
        <Empty
          icon="mail"
          title={tab === 'due' ? 'Onay bekleyen e-posta yok' : 'Bu listede e-posta yok'}
          text={tab === 'due' ? 'Müşteri adaylarından firma seçip "E-posta dizisini hazırla" deyin; taslaklar buraya düşer.' : 'Gönderdikçe ve planladıkça burada görünür.'}
        />
      ) : null}

      {shown.map((m) => (
        <View key={m.id} style={[styles.card, { backgroundColor: c.paper }]}>
          <View style={styles.head}>
            {tab === 'due' ? <Check on={picked.has(m.id)} onPress={() => setPicked((p) => { const n = new Set(p); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} label={`${m.lead?.name} seç`} /> : null}
            <Pressable style={{ flex: 1, gap: 2 }} onPress={() => setOpen(open === m.id ? null : m.id)} accessibilityRole="button">
              <Text style={[type.small, { color: c.muted }]} numberOfLines={1}>
                {`${STEP[m.step]} · ${m.lead?.name ?? ''} · ${m.lead?.email ?? 'e-posta yok'}`}
              </Text>
              <Text style={[type.section, { color: c.ink }]} numberOfLines={open === m.id ? undefined : 1}>{m.subject}</Text>
              <Text style={[type.caption, { color: m.status === 'failed' ? c.red : c.muted }]}>
                {m.status === 'sent' && m.sent_at ? `Gönderildi: ${when(m.sent_at)}`
                  : m.status === 'failed' ? `Gönderilemedi: ${m.error ?? ''}`
                  : m.status === 'skipped' ? 'Atlandı'
                  : tab === 'later' ? `Gönderime hazır olacağı gün: ${when(m.due_at)}` : 'Gönderime hazır'}
              </Text>
            </Pressable>
          </View>
          {open === m.id ? <Draft m={m} editable={m.status === 'draft'} onChanged={() => { setOpen(null); load(); }} /> : null}
        </View>
      ))}
    </Page>
  );
}

function Draft({ m, editable, onChanged }: { m: OutMessage; editable: boolean; onChanged: () => void }) {
  const c = useColors();
  const [subject, setSubject] = useState(m.subject);
  const [body, setBody] = useState(m.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(skip: boolean) {
    setBusy(true);
    setError(null);
    try {
      await editMessage(m.id, subject, body, skip);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!editable) return <Text style={[type.body, { color: c.ink, marginTop: space.sm }]} selectable>{m.body}</Text>;
  return (
    <View style={{ gap: space.sm, marginTop: space.md }}>
      <Field label="Konu" value={subject} onChangeText={setSubject} maxLength={200} />
      <Field label="Metin" value={body} onChangeText={setBody} multiline maxLength={8000} style={{ minHeight: 200 }} />
      <Text style={[type.small, { color: c.muted }]}>Altına gönderen bilgileriniz ve listeden çıkma bağlantısı kendiliğinden eklenir.</Text>
      {error ? <Notice tone="bad" text={error} /> : null}
      <View style={styles.actions}>
        <Button icon="check" title="Değişikliği kaydet" onPress={() => save(false)} loading={busy} disabled={subject === m.subject && body === m.body} />
        <Button variant="secondary" icon="close" title="Bu e-postayı gönderme" onPress={() => save(true)} loading={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, flexWrap: 'wrap' },
  card: { borderRadius: radius.md, padding: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
