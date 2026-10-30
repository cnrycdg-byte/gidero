// Geri bildirim: öneri, hata, soru ya da beğeni yazılır; Gidero ekibi yönetim panelinde okur.
// Alt kısımda kişinin önceki geri bildirimleri ve ekibin yanıt notu görünür.
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, SectionTitle } from '@/components/ui';
import { hit, radius, space, type, useColors } from '@/constants/theme';
import { dateText } from '@/lib/format';
import { KIND_LABEL, STATUS_LABEL, myFeedback, submitFeedback, type FeedbackKind, type MyFeedback } from '@/lib/feedback';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';

const KINDS: { key: FeedbackKind; hint: string }[] = [
  { key: 'idea', hint: 'Neyin olmasını isterdiniz? Hangi işinizi kolaylaştırır?' },
  { key: 'bug', hint: 'Ne yaptınız, ne oldu, ne bekliyordunuz? Hangi ekranda olduğunu yazın.' },
  { key: 'question', hint: 'Sorunuzu yazın; yanıtımızı bu ekranda görürsünüz.' },
  { key: 'praise', hint: 'Neyi beğendiğinizi yazın, aynı yönde devam edelim.' },
];

export default function Feedback() {
  const c = useColors();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { active } = useSession();
  const [kind, setKind] = useState<FeedbackKind>('idea');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [past, setPast] = useState<MyFeedback[]>([]);

  const load = useCallback(() => {
    myFeedback().then(setPast).catch(() => setPast([]));
  }, []);
  useFocusEffect(load);

  async function send() {
    setError(null);
    if (message.trim().length < 3) return setError('Geri bildiriminizi birkaç kelimeyle yazın.');
    setBusy(true);
    try {
      await submitFeedback({ kind, message, companyId: active?.company_id ?? null, screen: from ?? null });
      setMessage('');
      setSent(true);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Stack.Screen options={{ title: 'Geri bildirim', headerRight: () => (router.canGoBack() ? <Button variant="plain" title="Kapat" onPress={() => router.back()} /> : null) }} />
      <Text style={[type.body, { color: c.muted }]}>
        Gidero'yu birlikte geliştiriyoruz. Yazdığınız her şeyi ekibimiz okur; yanıtımız aşağıda görünür.
      </Text>

      {/* Tür seçimi: dört eşit seçenek, seçili olan accent dolgulu (HIG Buttons: stil ile ayırt etme) */}
      <View style={styles.kinds} accessibilityRole="radiogroup">
        {KINDS.map((k) => {
          const on = kind === k.key;
          return (
            <Pressable
              key={k.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setKind(k.key)}
              style={({ pressed }) => [styles.kind, { backgroundColor: on ? c.pen : c.fill, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: '600', fontSize: 15 }}>{KIND_LABEL[k.key]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Field
        label="Mesajınız"
        value={message}
        onChangeText={(t) => {
          setMessage(t);
          setSent(false);
        }}
        multiline
        maxLength={2000}
        placeholder={KINDS.find((k) => k.key === kind)?.hint}
      />
      {error ? <Notice tone="bad" text={error} /> : null}
      {sent ? <Notice tone="ok" text="Teşekkürler, geri bildiriminiz bize ulaştı." /> : null}
      <Button icon="send" title="Gönder" onPress={send} loading={busy} />

      {past.length > 0 && (
        <>
          <SectionTitle title="Gönderdikleriniz" />
          <Group>
            {past.map((f) => (
              <View key={f.id} style={styles.item}>
                <View style={styles.itemHead}>
                  <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>{`${KIND_LABEL[f.kind]} · ${dateText(f.created_at)}`}</Text>
                  <Text style={[type.small, { color: f.status === 'done' ? c.green : f.status === 'seen' ? c.pen : c.muted, fontWeight: '600' }]}>{STATUS_LABEL[f.status]}</Text>
                </View>
                <Text style={[type.body, { color: c.ink }]}>{f.message}</Text>
                {f.admin_note ? (
                  <View style={[styles.reply, { backgroundColor: c.penSoft }]}>
                    <Text style={[type.small, { color: c.pen, fontWeight: '600' }]}>Gidero ekibi</Text>
                    <Text style={[type.subhead, { color: c.ink }]}>{f.admin_note}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </Group>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kind: { minHeight: hit, borderRadius: radius.pill, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  item: { padding: space.lg, gap: space.xs },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between' },
  reply: { marginTop: space.sm, borderRadius: radius.md, padding: space.md, gap: 2 },
});
