import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Field, Label, Notice, Pill } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { dateText, money } from '@/lib/format';
import { addReceipt, pickReceipt, type Source } from '@/lib/receipts';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { DOC_TYPE_LABEL, STATUS_LABEL, statusTone, type Expense, type Report } from '@/lib/types';

type Action = { id: string; action: string; note: string | null; created_at: string; actor_user_id: string };

const ACTION_LABEL: Record<string, string> = {
  submitted: 'Onaya gönderildi',
  approved: 'Onaylandı',
  returned: 'İade edildi',
  auto_approved: 'Onay adımı olmadığı için onaylandı',
  booked_without_approval: 'Muhasebeci girdiği için onaysız kaydedildi',
};

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { userId, hasRole } = useSession();
  const [report, setReport] = useState<Report | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | 'add' | 'submit' | 'approve' | 'return'>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [r, e, a] = await Promise.all([
      supabase.from('reports').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('expenses')
        .select('*, expense_flags(id, code, severity, message, legal_ref)')
        .eq('report_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('approval_actions').select('*').eq('report_id', id).order('created_at', { ascending: true }),
    ]);
    setReport((r.data as Report) ?? null);
    setExpenses((e.data ?? []) as Expense[]);
    setActions((a.data ?? []) as Action[]);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!report) {
    return (
      <View style={{ padding: space.xl }}>
        <Body muted>{loading ? 'Yükleniyor…' : 'Rapor bulunamadı ya da görme yetkiniz yok.'}</Body>
      </View>
    );
  }

  const isOwner = report.owner_user_id === userId;
  const isCreator = report.created_by === userId;
  const editable =
    (report.status === 'draft' || report.status === 'returned') && (isOwner || (isCreator && hasRole('accountant')));
  const iApprove = report.status === 'pending' && !!userId && report.current_approver_ids.includes(userId);
  const flagCount = expenses.reduce(
    (a, e) => a + (e.expense_flags ?? []).filter((f) => f.severity !== 'info').length,
    0,
  );
  const zeroTotals = expenses.filter((e) => Number(e.total) === 0).length;

  async function add(source: Source) {
    if (!report || !userId) return;
    setError(null);
    try {
      const uri = await pickReceipt(source);
      if (!uri) return;
      setBusy('add');
      const res = await addReceipt({ uri, companyId: report.company_id, reportId: report.id, userId });
      router.push({ pathname: '/expense/[id]', params: { id: res.expenseId, readError: res.readError ?? '' } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  function confirmSubmit() {
    if (zeroTotals > 0) {
      setError(`${zeroTotals} fişin tutarı 0. Önce tutarları kontrol edin.`);
      return;
    }
    Alert.alert('Onaya gönderilsin mi?', `${expenses.length} fiş, toplam ${money(report?.total)}`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Gönder', onPress: submit },
    ]);
  }

  async function submit() {
    setBusy('submit');
    setError(null);
    const { data, error: e } = await supabase.rpc('submit_report', { p_report: id });
    setBusy(null);
    if (e) return setError(errorText(e));
    Alert.alert(data === 'approved' ? 'Rapor onaylandı' : 'Rapor onaya gönderildi');
    load();
  }

  async function approve() {
    setBusy('approve');
    setError(null);
    const { error: e } = await supabase.rpc('approve_report', { p_report: id, p_note: note.trim() || null });
    setBusy(null);
    if (e) return setError(errorText(e));
    setNote('');
    load();
  }

  async function giveBack() {
    if (!note.trim()) return setError('İade ederken nedenini yazın; çalışan neyi düzelteceğini bilsin.');
    setBusy('return');
    setError(null);
    const { error: e } = await supabase.rpc('return_report', { p_report: id, p_note: note.trim() });
    setBusy(null);
    if (e) return setError(errorText(e));
    setNote('');
    load();
  }

  async function remove() {
    Alert.alert('Rapor silinsin mi?', 'Taslak rapor ve içindeki fişler silinir.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const paths = expenses.map((e) => e.image_path).filter((p): p is string => !!p);
          // Önce görseller silinir: rapor silindikten sonra depolama izni kalmaz
          if (paths.length) await supabase.storage.from('receipts').remove(paths);
          const { error: e } = await supabase.from('reports').delete().eq('id', id);
          if (e) return setError(errorText(e));
          router.back();
        },
      },
    ]);
  }

  const lastReturn = [...actions].reverse().find((a) => a.action === 'returned');

  return (
    <>
      <Stack.Screen options={{ title: report.title }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Card>
          <View style={styles.rowBetween}>
            <Pill text={STATUS_LABEL[report.status]} tone={statusTone(report.status)} />
            <Text style={[type.small, { color: c.muted }]}>{expenses.length} fiş</Text>
          </View>
          <Text style={[type.amount, { color: c.text }]}>{money(report.total)}</Text>
          {flagCount > 0 && <Notice tone="warn" text={`${flagCount} vergi uyarısı var. Fişlere dokunup inceleyin.`} />}
        </Card>

        {report.status === 'returned' && lastReturn?.note && (
          <Notice tone="bad" text={`İade nedeni: ${lastReturn.note}`} />
        )}
        {error && <Notice tone="bad" text={error} />}

        {editable && (
          <View style={{ gap: space.sm }}>
            <Button title={busy === 'add' ? 'Fiş okunuyor…' : 'Fiş çek'} onPress={() => add('camera')} loading={busy === 'add'} />
            <Button variant="secondary" title="Galeriden seç" onPress={() => add('library')} disabled={!!busy} />
          </View>
        )}

        <Label>Fişler</Label>
        {expenses.length === 0 && (
          <Card>
            <Body muted>Bu raporda henüz fiş yok. “Fiş çek” ile ekleyin; tutarı, tarihi ve KDV'yi Gidero okur.</Body>
          </Card>
        )}
        {expenses.map((e) => {
          const warn = (e.expense_flags ?? []).filter((f) => f.severity !== 'info');
          const critical = warn.some((f) => f.severity === 'critical');
          return (
            <Link key={e.id} href={{ pathname: '/expense/[id]', params: { id: e.id } }} asChild>
              <Pressable>
                <Card>
                  <View style={styles.rowBetween}>
                    <Text style={[type.body, { color: c.text, flex: 1, fontWeight: '600' }]} numberOfLines={1}>
                      {e.seller_name || DOC_TYPE_LABEL[e.doc_type] || 'Fiş'}
                    </Text>
                    <Text style={[type.body, { color: c.text, fontWeight: '600', fontVariant: ['tabular-nums'] }]}>
                      {money(e.total)}
                    </Text>
                  </View>
                  <View style={styles.rowBetween}>
                    <Text style={[type.small, { color: c.muted }]}>
                      {dateText(e.doc_date)} · {DOC_TYPE_LABEL[e.doc_type] ?? e.doc_type}
                    </Text>
                    {warn.length > 0 ? (
                      <Pill text={`${warn.length} uyarı`} tone={critical ? 'bad' : 'warn'} />
                    ) : Number(e.total) === 0 ? (
                      <Pill text="Tutar yok" tone="bad" />
                    ) : null}
                  </View>
                </Card>
              </Pressable>
            </Link>
          );
        })}

        {editable && expenses.length > 0 && (
          <Button title="Onaya gönder" onPress={confirmSubmit} loading={busy === 'submit'} />
        )}

        {iApprove && (
          <Card>
            <Label>Onay kararınız</Label>
            <Field label="Not" value={note} onChangeText={setNote} placeholder="İade ederken zorunlu" multiline />
            <Button title="Onayla" onPress={approve} loading={busy === 'approve'} disabled={!!busy} />
            <Button variant="danger" title="İade et" onPress={giveBack} loading={busy === 'return'} disabled={!!busy} />
          </Card>
        )}

        {actions.length > 0 && (
          <>
            <Label>Geçmiş</Label>
            <Card>
              {actions.map((a) => (
                <View key={a.id} style={{ gap: 2 }}>
                  <Text style={[type.body, { color: c.text }]}>{ACTION_LABEL[a.action] ?? a.action}</Text>
                  <Text style={[type.small, { color: c.muted }]}>
                    {dateText(a.created_at)}
                    {a.note ? ` · ${a.note}` : ''}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {report.status === 'draft' && (isOwner || isCreator) && (
          <Button variant="ghost" title="Taslak raporu sil" onPress={remove} />
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
});
