import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Empty, Field, Notice } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { copyText, formatIban } from '@/lib/bank';
import { confirm } from '@/lib/confirm';
import { dateText, money } from '@/lib/format';
import { sendPending } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Pay = {
  report_id: string;
  title: string;
  owner_user_id: string;
  owner_name: string;
  total: number;
  pay_amount: number;
  iban: string | null;
  bank_name: string | null;
  account_holder: string | null;
  requested_at: string;
  paid_at: string | null;
  paid_note: string | null;
};

/** Ödeme yetkilisi: muhasebenin aktardığı raporlar; IBAN tek tıkla kopyalanır, ödeyince "Ödeme yapıldı" */
export default function Payments() {
  const c = useColors();
  const { active, userId, hasRole } = useSession();
  const [tab, setTab] = useState<'open' | 'paid'>('open');
  const [rows, setRows] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    const { data, error: e } = await supabase.rpc('payment_queue', { p_company: active.company_id, p_paid: tab === 'paid' });
    setLoading(false);
    if (e) return setError(errorText(e));
    setError(null);
    setRows(((data ?? []) as Pay[]).map((r) => ({ ...r, total: Number(r.total), pay_amount: Number(r.pay_amount) })));
  }, [active, tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!hasRole('payer') && !hasRole('accountant')) {
    return (
      <Page>
        <Notice text="Bu ekran ödeme yetkilisi ve muhasebeci içindir." />
      </Page>
    );
  }

  async function copy(key: string, text: string) {
    await copyText(text);
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
  }

  function pay(r: Pay) {
    if (!active) return;
    confirm(
      'Ödeme yapıldı mı?',
      `${r.owner_name} kişisine ${money(r.pay_amount)} ödendi olarak işaretlenecek. Çalışana bildirim gider, rapor arşive kalkar.`,
      'Ödeme yapıldı',
      async () => {
        setBusy(r.report_id);
        setError(null);
        const { error: e } = await supabase.rpc('mark_paid', {
          p_company: active.company_id,
          p_report_ids: [r.report_id],
          p_note: notes[r.report_id]?.trim() || null,
        });
        setBusy(null);
        if (e) return setError(errorText(e));
        sendPending();
        setInfo(`${r.owner_name} ödemesi kaydedildi; rapor arşive kalktı ve kişiye bildirim gitti.`);
        load();
      },
      false,
    );
  }

  const sum = rows.reduce((a, r) => a + r.pay_amount, 0);

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      <Stack.Screen options={{ title: 'Ödemeler' }} />
      <View style={styles.tabs}>
        {(
          [
            ['open', 'Ödeme bekleyenler'],
            ['paid', 'Arşiv (ödendi)'],
          ] as const
        ).map(([k, label]) => (
          <Pressable key={k} onPress={() => { setTab(k); setInfo(null); }} style={[styles.tab, { backgroundColor: tab === k ? c.pen : c.paper }]}>
            <Text style={{ color: tab === k ? c.onPen : c.ink, fontWeight: '600' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'open' && rows.length > 0 && (
        <Text style={[type.body, { color: c.muted }]}>{`${rows.length} rapor, toplam ${money(sum)} ödenecek.`}</Text>
      )}
      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}
      {!loading && rows.length === 0 && (
        <Empty
          icon="checkCircle"
          title={tab === 'open' ? 'Ödeme bekleyen rapor yok' : 'Arşiv boş'}
          text={tab === 'open' ? 'Muhasebe bir raporu "Ödeme sorumlusuna aktar" dediğinde burada görünür.' : 'Ödediğiniz raporlar burada saklanır.'}
        />
      )}

      <View style={styles.grid}>
        {rows.map((r) => {
          const own = r.owner_user_id === userId;
          return (
            <View key={r.report_id} style={[styles.card, { backgroundColor: c.paper }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyStrong, { color: c.ink }]}>{r.owner_name}</Text>
                  <Pressable onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.report_id } })}>
                    <Text style={[type.small, { color: c.pen, fontWeight: '600' }]}>{`${r.title}: raporu aç`}</Text>
                  </Pressable>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 24, color: c.ink }}>{money(r.pay_amount)}</Text>
                  <Text style={[type.small, { color: c.muted }]}>
                    {r.pay_amount !== r.total ? `Rapor toplamı ${money(r.total)}` : 'Kişiye ödenecek'}
                  </Text>
                </View>
              </View>

              <CopyLine label="IBAN" value={r.iban ? formatIban(r.iban) : null} raw={r.iban} copied={copied === `${r.report_id}:iban`} onCopy={(v) => copy(`${r.report_id}:iban`, v)} missing="IBAN kayıtlı değil. Kişiden Hesabım ekranına eklemesini isteyin." />
              <CopyLine label="Hesap sahibi" value={r.account_holder || r.owner_name} raw={r.account_holder || r.owner_name} copied={copied === `${r.report_id}:holder`} onCopy={(v) => copy(`${r.report_id}:holder`, v)} />
              {r.bank_name ? <CopyLine label="Banka" value={r.bank_name} raw={r.bank_name} copied={copied === `${r.report_id}:bank`} onCopy={(v) => copy(`${r.report_id}:bank`, v)} /> : null}
              <CopyLine
                label="Tutar"
                value={money(r.pay_amount)}
                raw={r.pay_amount.toFixed(2).replace('.', ',')}
                copied={copied === `${r.report_id}:amt`}
                onCopy={(v) => copy(`${r.report_id}:amt`, v)}
              />
              <CopyLine
                label="Açıklama"
                value={`Masraf ödemesi: ${r.title}`}
                raw={`Masraf ödemesi: ${r.title}`}
                copied={copied === `${r.report_id}:desc`}
                onCopy={(v) => copy(`${r.report_id}:desc`, v)}
              />

              {tab === 'open' ? (
                <>
                  <Field
                    label="Ödeme notu (isteğe bağlı)"
                    value={notes[r.report_id] ?? ''}
                    onChangeText={(v) => setNotes((n) => ({ ...n, [r.report_id]: v }))}
                    placeholder="Örnek: 29.10 havale"
                  />
                  {own ? (
                    <Notice tone="warn" text="Bu sizin masrafınız; ödendi işaretini başka bir yetkili koymalı." />
                  ) : (
                    <Button icon="check" title="Ödeme yapıldı" onPress={() => pay(r)} loading={busy === r.report_id} />
                  )}
                  <Text style={[type.small, { color: c.faint }]}>{`Muhasebe aktardı: ${dateText(r.requested_at)}`}</Text>
                </>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCircle" size={14} color={c.pen} />
                  <Text style={[type.small, { color: c.pen, fontWeight: '600' }]}>
                    {`Ödendi ${dateText(r.paid_at)}${r.paid_note ? `: ${r.paid_note}` : ''}`}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </Page>
  );
}

function CopyLine({
  label,
  value,
  raw,
  copied,
  onCopy,
  missing,
}: {
  label: string;
  value: string | null;
  raw: string | null;
  copied: boolean;
  onCopy: (v: string) => void;
  missing?: string;
}) {
  const c = useColors();
  if (!value || !raw) {
    return (
      <View style={[styles.line, { backgroundColor: c.amberSoft }]}>
        <Text style={[type.small, { color: c.amber, flex: 1 }]}>{missing ?? `${label} yok`}</Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onCopy(raw)}
      accessibilityRole="button"
      accessibilityLabel={`${label} kopyala`}
      style={({ pressed }) => [styles.line, { backgroundColor: pressed ? c.paperLine : c.canvas }]}>
      <View style={{ flex: 1 }}>
        <Text style={[type.small, { color: c.muted }]}>{label}</Text>
        <Text style={[type.bodyStrong, { color: c.ink, fontVariant: ['tabular-nums'] }]} selectable>
          {value}
        </Text>
      </View>
      <Text style={{ color: copied ? c.pen : c.muted, fontWeight: '700', fontSize: 13 }}>{copied ? 'Kopyalandı' : 'Kopyala'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  tab: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  card: { flexGrow: 1, flexBasis: 340, maxWidth: 560, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10 },
});
