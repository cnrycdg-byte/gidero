import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { dateText, money } from '@/lib/format';
import { sendPending } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Tab = 'check' | 'pay' | 'archive';
const TABS: { key: Tab; label: string; statuses: string[] }[] = [
  { key: 'check', label: 'Kontrol bekleyen', statuses: ['approved', 'booked'] },
  { key: 'pay', label: 'Ödeme bekleyen', statuses: ['exported'] },
  { key: 'archive', label: 'Arşiv (ödendi)', statuses: ['paid'] },
];
type R = { id: string; title: string; total: number; owner_user_id: string; approved_at: string | null; paid_at: string | null; paid_note: string | null; payment_requested_at: string | null; owner: string; alcohol: number };

// Muhasebe masası: onaylanan formlar düşer → kontrol ve Excel/Luca aktarımı → ödendi → arşiv
export default function AccountingDesk() {
  const c = useColors();
  const { active, hasRole, userId } = useSession();
  const [tab, setTab] = useState<Tab>('check');
  const [rows, setRows] = useState<R[]>([]);
  const [counts, setCounts] = useState<Record<Tab, number>>({ check: 0, pay: 0, archive: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const bureau = !!active?.bureau_account_id;
  // Şirkette ödeme yetkilisi varsa muhasebe raporu ona aktarır
  const [hasPayer, setHasPayer] = useState(false);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      const statuses = TABS.find((t) => t.key === tab)!.statuses;
      const { data, error: e } = await supabase
        .from('reports')
        .select('id, title, total, owner_user_id, approved_at, paid_at, paid_note, payment_requested_at')
        .eq('company_id', active.company_id)
        .in('status', statuses)
        .order(tab === 'archive' ? 'paid_at' : 'approved_at', { ascending: tab !== 'archive' })
        .limit(200);
      if (e) throw e;
      const owners = [...new Set((data ?? []).map((r) => r.owner_user_id))];
      const { data: ps } = owners.length ? await supabase.from('profiles').select('id, full_name').in('id', owners) : { data: [] };
      const names = new Map(((ps ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
      // Alkol kararı bekleyen fişler (karar verilmeden aktarılamaz, ödenemez)
      const ids = (data ?? []).map((r) => r.id);
      const { data: alc } =
        ids.length && tab !== 'archive'
          ? await supabase.from('expenses').select('report_id').in('report_id', ids).eq('alcohol_present', true).is('alcohol_decision', null)
          : { data: [] };
      const pending = new Map<string, number>();
      for (const a of (alc ?? []) as { report_id: string }[]) pending.set(a.report_id, (pending.get(a.report_id) ?? 0) + 1);
      setRows(
        (data ?? []).map((r) => ({ ...r, total: Number(r.total), owner: names.get(r.owner_user_id) || 'Çalışan', alcohol: pending.get(r.id) ?? 0 })) as R[],
      );
      setSelected(new Set());
      const all = await Promise.all(
        TABS.map((t) =>
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('company_id', active.company_id).in('status', t.statuses),
        ),
      );
      setCounts({ check: all[0].count ?? 0, pay: all[1].count ?? 0, archive: all[2].count ?? 0 });
      const { count: payers } = await supabase
        .from('memberships')
        .select('user_id', { count: 'exact', head: true })
        .eq('company_id', active.company_id)
        .eq('status', 'active')
        .contains('roles', ['payer']);
      setHasPayer((payers ?? 0) > 0);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [active, tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!hasRole('accountant')) {
    return (
      <Page>
        <Notice text="Muhasebe masası muhasebeci rolündeki kişiler içindir." />
      </Page>
    );
  }

  const chosen = rows.filter((r) => selected.has(r.id));
  const own = chosen.some((r) => r.owner_user_id === userId) && !bureau;

  async function markPaid() {
    if (!active || !chosen.length) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('mark_paid', {
      p_company: active.company_id,
      p_report_ids: chosen.map((r) => r.id),
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (e) return setError(errorText(e));
    sendPending();
    setInfo(`${data} form ödendi olarak işaretlendi ve arşive kaldırıldı. Çalışanlara bildirim gitti.`);
    setNote('');
    load();
  }

  async function sendToPayer() {
    if (!active) return;
    const list = chosen.filter((r) => !r.payment_requested_at);
    if (!list.length) return setError('Seçtiğiniz raporlar zaten ödeme sorumlusunda.');
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('request_payment', { p_company: active.company_id, p_report_ids: list.map((r) => r.id) });
    setBusy(false);
    if (e) return setError(errorText(e));
    sendPending();
    setInfo(`${data} rapor ödeme sorumlusuna aktarıldı. Ödeme yapılınca arşive kalkar, çalışana bildirim gider.`);
    setSelected(new Set());
    load();
  }

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => { setTab(t.key); setInfo(null); }} style={[styles.tab, { backgroundColor: on ? c.pen : c.paper }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: '600' }}>{`${t.label} (${counts[t.key]})`}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}

      {tab === 'check' && (
        <View style={[styles.box, { backgroundColor: c.paper }]}>
          <Text style={[type.body, { color: c.ink }]}>
            Onayları tamamlanan formlar burada. Forma dokunup fişleri kontrol edin; sonra döküm ekranından Excel ya da Luca dosyasını alıp "Aktarıldı" deyin. Aktarılan formlar "Ödeme bekleyen"e geçer.
          </Text>
          <Button icon="inbox" title="Döküm al ve aktar" onPress={() => router.push('/export')} disabled={!rows.length} />
          {hasPayer && (
            <View style={styles.row}>
              <Button
                variant="secondary"
                title={chosen.length ? `Finans: ödeme sorumlusuna aktar (${chosen.length})` : 'Ödemeye aktarmak için form seçin'}
                disabled={!chosen.length}
                loading={busy}
                onPress={sendToPayer}
              />
              <Button variant="plain" title="Hepsini seç" onPress={() => setSelected(new Set(rows.filter((r) => !r.payment_requested_at).map((r) => r.id)))} disabled={!rows.length} />
            </View>
          )}
        </View>
      )}
      {tab === 'pay' && (
        <View style={[styles.box, { backgroundColor: c.paper }]}>
          <Text style={[type.body, { color: c.ink }]}>
            Ödemesini yaptığınız (ya da finansa aktardığınız ve ödenen) formları seçip "Ödendi" deyin; form arşive kalkar, çalışana bildirim gider.
          </Text>
          <Field label="Ödeme notu (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Örnek: 28.10 havale, maaşla birlikte" />
          {own && <Notice tone="warn" text="Seçtikleriniz arasında kendi masrafınız var; onu başka bir muhasebeci ya da yönetici işaretlemeli." />}
          <View style={styles.row}>
            <Button
              title={chosen.length ? `${chosen.length} formu ödendi işaretle (${money(chosen.reduce((a, r) => a + r.total, 0))})` : 'Form seçin'}
              disabled={!chosen.length || own}
              loading={busy}
              onPress={() => confirm('Ödendi işaretlensin mi?', `${chosen.length} form arşive kalkar.`, 'Ödendi', markPaid, false)}
            />
            {hasPayer && (
              <Button variant="secondary" title="Finans: ödeme sorumlusuna aktar" disabled={!chosen.length} loading={busy} onPress={sendToPayer} />
            )}
            <Button variant="plain" title="Hepsini seç" onPress={() => setSelected(new Set(rows.map((r) => r.id)))} disabled={!rows.length} />
          </View>
        </View>
      )}

      <Group>
        {rows.map((r) => {
          const on = selected.has(r.id);
          return (
            <Row
              key={r.id}
              icon={tab === 'archive' ? 'checkCircle' : 'receipt'}
              title={`${r.owner}: ${r.title}`}
              subtitle={
                tab === 'archive'
                  ? `Ödendi ${dateText(r.paid_at)}${r.paid_note ? `, ${r.paid_note}` : ''}`
                  : `Onay ${dateText(r.approved_at)}${r.alcohol ? `, ${r.alcohol} fişte alkol kararı bekliyor` : ''}${r.payment_requested_at ? `, ödeme sorumlusunda (${dateText(r.payment_requested_at)})` : ''}`
              }
              value={money(r.total)}
              right={
                tab === 'pay' || (tab === 'check' && hasPayer && !r.payment_requested_at) ? (
                  <Pressable onPress={() => toggle(r.id)} hitSlop={10} style={[styles.check, { borderColor: on ? c.pen : c.faint, backgroundColor: on ? c.pen : 'transparent' }]}>
                    {on && <Icon name="check" size={13} color={c.onPen} />}
                  </Pressable>
                ) : undefined
              }
              onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })}
            />
          );
        })}
      </Group>
      {!rows.length && !loading && (
        <Text style={[type.body, { color: c.muted, textAlign: 'center' }]}>
          {tab === 'check' ? 'Kontrol bekleyen form yok.' : tab === 'pay' ? 'Ödeme bekleyen form yok.' : 'Arşivde form yok.'}
        </Text>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tab: { borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
