import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { QueueProgress } from '@/components/queue-progress';
import { ReportSummary } from '@/components/report-summary';
import { ApprovalTimeline, type TimelineAction } from '@/components/approval-timeline';
import { PrintPanel } from '@/components/print-panel';
import { Button, Empty, Field, Group, Notice, Perforation, Row, SectionTitle, Slip, Stamp } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { dateText, money } from '@/lib/format';
import { useQueue } from '@/lib/queue';
import { pickFromLibrary } from '@/lib/receipts';
import { confirm } from '@/lib/confirm';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { PAYMENT_LABEL, paymentSummary, rejectedAlcohol } from '@/lib/payment';
import { sendPending } from '@/lib/notifications';
import { DOC_TYPE_LABEL, type Expense, type Report } from '@/lib/types';

type Action = TimelineAction;

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
  const { userId, hasRole, active } = useSession();
  const queue = useQueue();
  const [report, setReport] = useState<Report | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | 'submit' | 'approve' | 'return'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [approvers, setApprovers] = useState<string[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  // Görünüm: onaylayıcı ve muhasebe için özet (bütün fişlerin ayrıntısı tek ekranda), sahibi için fiş listesi
  const [view, setView] = useState<'summary' | 'list' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, e, a] = await Promise.all([
      supabase.from('reports').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('expenses')
        .select('*, categories(name), expense_vat_lines(rate, base, vat), expense_flags(id, code, severity, message, legal_ref)')
        .eq('report_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('approval_actions').select('id, action, note, created_at, actor_user_id, step_position').eq('report_id', id).order('created_at'),
    ]);
    const rep = (r.data as Report) ?? null;
    setReport(rep);
    setExpenses((e.data ?? []) as Expense[]);
    // Onaylayacak kişiler: gönderilmiş raporda o anki zincir, taslakta önizleme
    const snap = ((rep as unknown as { flow_snapshot?: { name?: string }[] } | null)?.flow_snapshot ?? []) as { name?: string }[];
    if (rep && snap.length && !['draft', 'returned'].includes(rep.status)) {
      setApprovers(snap.map((x) => x.name ?? 'Onaylayıcı'));
    } else if (rep && rep.owner_user_id === rep.created_by) {
      const { data: ap } = await supabase.rpc('my_approvers', { p_company: rep.company_id });
      setApprovers((((ap ?? []) as { name?: string }[]) || []).map((x) => x.name ?? 'Onaylayıcı'));
    } else setApprovers([]);
    const acts = (a.data ?? []) as Action[];
    setActions(acts);
    // Akış şemasındaki kişilerin adları: rapor sahibi, işlem yapanlar, onayı bekleyenler
    if (rep) {
      const ids = [...new Set([rep.owner_user_id, ...acts.map((x) => x.actor_user_id), ...(rep.current_approver_ids ?? [])])];
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setNames(new Map(((ps ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])));
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    load();
  }, [queue.version, load]);

  if (!report) {
    return (
      <View style={{ padding: space.xl }}>
        {loading ? <ActivityIndicator color={c.pen} /> : <Notice tone="bad" text="Rapor bulunamadı ya da görme yetkiniz yok." />}
      </View>
    );
  }

  const isOwner = report.owner_user_id === userId;
  // Onay akışı: rapor sahibi için üstte, onaylayıcı ve muhasebe için fiş özetinin altında
  const timeline = (
    <>
      <SectionTitle title="Onay akışı" />
      <ApprovalTimeline report={report} actions={actions} names={names} preview={approvers} />
    </>
  );
  const mode = view ?? (isOwner && (report.status === 'draft' || report.status === 'returned') ? 'list' : 'summary');
  const isCreator = report.created_by === userId;
  const editable =
    (report.status === 'draft' || report.status === 'returned') && (isOwner || (isCreator && hasRole('accountant')));
  const iApprove = report.status === 'pending' && !!userId && report.current_approver_ids.includes(userId);
  const pending = queue.items.filter((i) => i.reportId === id);
  const reading = pending.filter((i) => i.status === 'waiting' || i.status === 'uploading' || i.status === 'reading');
  const failed = pending.filter((i) => i.status === 'failed');
  const knownIds = new Set(expenses.map((e) => e.id));
  const stillReading = new Set(reading.map((i) => i.expenseId).filter(Boolean) as string[]);
  const warnCount = expenses.reduce((a, e) => a + (e.expense_flags ?? []).filter((f) => f.severity !== 'info').length, 0);
  const pay = paymentSummary(expenses);
  const alcoholCut = rejectedAlcohol(expenses);
  const alcoholPending = expenses.filter((e) => e.alcohol_present && !e.alcohol_decision).length;
  const zeroTotals = expenses.filter((e) => Number(e.total) === 0 && !stillReading.has(e.id)).length;
  const lastReturn = [...actions].reverse().find((a) => a.action === 'returned');
  // Fiş kontrolü: çalışan her fişi açıp doğru olduğunu onaylar (büro firmalarında muhasebeci kayda alırken kontrol eder)
  const needsCheck = !active?.bureau_account_id;
  const unchecked = needsCheck ? expenses.filter((e) => !e.checked_at && !stillReading.has(e.id)) : [];
  const checkedCount = expenses.filter((e) => !!e.checked_at).length;
  const proxyReport = report.owner_user_id !== userId || !!active?.bureau_account_id;

  async function toggleCheck(e: Expense) {
    setError(null);
    if (!e.checked_at && Number(e.total) <= 0) return setError('Fişin tutarı yok. Fişe dokunup tutarı yazın, sonra doğru olarak işaretleyin.');
    const { error: err } = await supabase.rpc('check_expense', { p_expense: e.id, p_checked: !e.checked_at });
    if (err) return setError(errorText(err));
    setExpenses((list) => list.map((x) => (x.id === e.id ? { ...x, checked_at: e.checked_at ? null : new Date().toISOString() } : x)));
  }

  async function addFromGallery() {
    if (!report || !userId) return;
    const uris = await pickFromLibrary();
    uris.forEach((uri) => queue.enqueue({ reportId: report.id, companyId: report.company_id, userId, uri }));
  }

  function confirmSubmit() {
    if (reading.length) return setError('Fişlerin okunması bitsin, sonra gönderin.');
    if (zeroTotals > 0) return setError(`${zeroTotals} fişin tutarı yok. Fişe dokunup tutarı yazın.`);
    if (unchecked.length) {
      return setError(`${unchecked.length} fiş kontrol bekliyor. Fişi açıp bilgileri kontrol edin; doğruysa "Doğru" deyin, yanlışsa düzeltip kaydedin.`);
    }
    const proxy = !!report && (report.owner_user_id !== userId || !!active?.bureau_account_id);
    confirm(proxy ? 'Rapor kayda alınsın mı?' : 'Onaya gönderilsin mi?', `${expenses.length} fiş, toplam ${money(report?.total)}`, proxy ? 'Kayda al' : 'Gönder', submit, false);
  }

  async function submit() {
    setBusy('submit');
    setError(null);
    const { data, error: e } = await supabase.rpc('submit_report', { p_report: id });
    setBusy(null);
    if (e) return setError(errorText(e));
    sendPending();
    setNotice(data === 'approved' ? 'Rapor onaylandı ve muhasebeye düştü.' : 'Rapor onaya gönderildi.');
    load();
  }

  async function approve() {
    setBusy('approve');
    setError(null);
    const { error: e } = await supabase.rpc('approve_report', { p_report: id, p_note: note.trim() || null });
    setBusy(null);
    if (e) return setError(errorText(e));
    sendPending();
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
    sendPending();
    setNote('');
    load();
  }

  function remove() {
    confirm('Rapor silinsin mi?', 'Taslak rapor ve içindeki fişler silinir.', 'Sil', async () => {
      const paths = expenses.map((e) => e.image_path).filter((p): p is string => !!p);
      if (paths.length) await supabase.storage.from('receipts').remove(paths);
      const { error: e } = await supabase.from('reports').delete().eq('id', id);
      if (e) return setError(errorText(e));
      router.back();
    });
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Slip>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md }}>
            <Text style={[type.title, { color: c.ink, flex: 1 }]}>{report.title}</Text>
            <Stamp status={report.status} />
          </View>
          <Text style={[type.small, { color: c.muted, marginTop: 2 }]}>{`Oluşturma: ${dateText(report.created_at)}`}</Text>
          {!proxyReport || approvers.length ? (
            <Text style={[type.small, { color: approvers.length ? c.muted : c.red, marginTop: 2 }]}>
              {approvers.length
                ? `Onaylayacak: ${approvers.join(' → ')}`
                : 'Onaylayacak kimse tanımlı değil. Yöneticinizden onay zincirinde sizi birinin altına bağlamasını isteyin.'}
            </Text>
          ) : null}
          <Text style={[type.display, { color: c.ink, marginTop: space.sm }]} adjustsFontSizeToFit numberOfLines={1}>
            {money(report.total)}
          </Text>
          {pay.personal !== Number(report.total) && Number(report.total) > 0 && (
            <View style={{ gap: 2, marginTop: space.xs }}>
              <Text style={[type.small, { color: c.ink, fontWeight: '600' }]}>{`Size ödenecek: ${money(pay.personal)}`}</Text>
              {(['company_card', 'cash_advance', 'cash'] as const)
                .filter((k) => pay[k] > 0)
                .map((k) => (
                  <Text key={k} style={[type.small, { color: c.muted }]}>{`${PAYMENT_LABEL[k]}: ${money(pay[k])}`}</Text>
                ))}
              {alcoholCut > 0 && (
                <Text style={[type.small, { color: c.red }]}>{`Reddedilen alkol (ödenmez): ${money(alcoholCut)}`}</Text>
              )}
            </View>
          )}
          {alcoholPending > 0 && (
            <Text style={[type.small, { color: c.amber, fontWeight: '600', marginTop: space.xs }]}>
              {`${alcoholPending} fişte alkollü içki var; muhasebe fişi açıp onaylamalı ya da reddetmeli.`}
            </Text>
          )}
          <Perforation />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type.small, { color: c.muted }]}>
              {expenses.length} fiş{reading.length ? `, ${reading.length} okunuyor` : ''}
              {needsCheck && expenses.length ? `, ${checkedCount}/${expenses.length} kontrol edildi` : ''}
            </Text>
            {warnCount > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="warning" size={12} color={c.amber} />
                <Text style={[type.small, { color: c.amber, fontWeight: '600' }]}>{warnCount} vergi uyarısı</Text>
              </View>
            ) : (
              <Text style={[type.small, { color: c.muted }]}>{dateText(report.created_at)}</Text>
            )}
          </View>
        </Slip>

        {isOwner && timeline}

        {report.status === 'returned' && lastReturn?.note && <Notice tone="bad" text={`İade nedeni: ${lastReturn.note}`} />}
        {error && <Notice tone="bad" text={error} />}
        {notice && <Notice tone="ok" text={notice} />}

        <SectionTitle
          title="Fişler"
          action={
            !editable && expenses.length ? (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {(['summary', 'list'] as const).map((v) => {
                  const on = mode === v;
                  return (
                    <Pressable key={v} onPress={() => setView(v)} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: on ? c.pen : c.paper }}>
                      <Text style={{ color: on ? c.onPen : c.ink, fontWeight: '600', fontSize: 13 }}>{v === 'summary' ? 'Özet' : 'Liste'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : editable ? (
              <Text onPress={addFromGallery} style={{ color: c.pen, fontWeight: '600', fontSize: 15 }}>
                Galeriden ekle
              </Text>
            ) : undefined
          }
        />

        <QueueProgress reportId={id} />

        {mode === 'summary' && expenses.length > 0 ? (
          <ReportSummary expenses={expenses} onOpen={(eid) => router.push({ pathname: '/expense/[id]', params: { id: eid } })} />
        ) : expenses.length === 0 && failed.length === 0 ? (
          reading.length ? null : <Empty icon="camera" title="Bu raporda fiş yok" text="“Fiş çek”e dokunun; fişleri arka arkaya çekebilirsiniz." />
        ) : (
          <Group>
            {failed.map((p) => (
              <Row
                key={p.key}
                icon="error"
                iconColor={c.red}
                iconBg={c.redSoft}
                title="Fiş yüklenemedi"
                subtitle={`${p.error ?? ''} Tekrar denemek için dokunun.`}
                onPress={() => queue.retry(p.key)}
                chevron={false}
              />
            ))}
            {expenses.map((e) => {
              const warns = (e.expense_flags ?? []).filter((f) => f.severity !== 'info');
              const critical = warns.some((f) => f.severity === 'critical');
              const isReading = stillReading.has(e.id);
              const noTotal = Number(e.total) === 0 && !isReading;
              return (
                <Row
                  key={e.id}
                  icon={isReading ? 'clock' : warns.length || noTotal ? 'warning' : 'receipt'}
                  iconColor={isReading ? c.muted : critical || noTotal ? c.red : warns.length ? c.amber : c.pen}
                  iconBg={isReading ? c.canvas : critical || noTotal ? c.redSoft : warns.length ? c.amberSoft : c.penSoft}
                  title={isReading ? 'Fiş okunuyor…' : e.seller_name || DOC_TYPE_LABEL[e.doc_type] || 'Fiş'}
                  subtitle={
                    isReading
                      ? 'Tutar, tarih ve KDV dolduruluyor'
                      : noTotal
                        ? 'Tutar okunamadı, dokunup yazın'
                        : [
                            dateText(e.doc_date),
                            e.photo_parts && e.photo_parts > 1 ? `fotoğraftaki ${e.photo_part}/${e.photo_parts}. fiş` : null,
                            e.doc_type === 'bilgi_fisi' ? (e.einvoice_confirmed_at ? 'bilgi fişi, e-Arşiv onaylı' : 'bilgi fişi, e-Arşiv onayı bekliyor') : null,
                            e.payment_method && e.payment_method !== 'personal' ? PAYMENT_LABEL[e.payment_method] : null,
                            e.alcohol_present
                              ? e.alcohol_decision === 'accepted'
                                ? 'Alkol: normal gider'
                                : e.alcohol_decision === 'kkeg'
                                  ? 'Alkol: KKEG'
                                  : e.alcohol_decision === 'rejected'
                                  ? `Alkol reddedildi (${money(Number(e.alcohol_amount ?? 0))})`
                                  : 'Alkol: muhasebe kararı bekliyor'
                              : null,
                            warns.filter((f) => f.code !== 'alcohol' && f.code !== 'info_slip').length ? `${warns.filter((f) => f.code !== 'alcohol' && f.code !== 'info_slip').length} uyarı` : null,
                            needsCheck && !e.checked_at && editable ? 'kontrol bekliyor' : null,
                          ]
                            .filter(Boolean)
                            .join(', ')
                  }
                  value={isReading ? undefined : noTotal ? '—' : money(e.total)}
                  right={
                    isReading ? (
                      <ActivityIndicator color={c.muted} />
                    ) : needsCheck && (editable || e.checked_at) ? (
                      <CheckToggle on={!!e.checked_at} disabled={!editable} onPress={() => toggleCheck(e)} />
                    ) : undefined
                  }
                  onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}
                />
              );
            })}
          </Group>
        )}

        {!isOwner && timeline}

        {iApprove && (
          <View style={{ gap: space.md }}>
            <SectionTitle title="Kararınız" />
            <Field label="Not" value={note} onChangeText={setNote} placeholder="İade ederken zorunlu" multiline />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button variant="danger" icon="undo" title="İade et" onPress={giveBack} loading={busy === 'return'} disabled={!!busy} style={{ flex: 1 }} />
              <Button icon="check" title="Onayla" onPress={approve} loading={busy === 'approve'} disabled={!!busy} style={{ flex: 1 }} />
            </View>
          </View>
        )}

        {actions.some((a) => a.action === 'returned') && (
          <>
            <SectionTitle title="Tüm hareketler" />
            <Group>
              {actions.map((a) => (
                <Row
                  key={a.id}
                  title={`${ACTION_LABEL[a.action] ?? a.action}${names.get(a.actor_user_id) ? `: ${names.get(a.actor_user_id)}` : ''}`}
                  subtitle={a.note ? `${dateText(a.created_at)}: ${a.note}` : dateText(a.created_at)}
                />
              ))}
            </Group>
          </>
        )}

        {expenses.length > 0 && <PrintPanel reportId={report.id} receiptCount={expenses.length} />}

        {report.status === 'draft' && (isOwner || isCreator) && (
          <Button variant="plain" title="Taslak raporu sil" onPress={remove} />
        )}
      </ScrollView>

      {editable && (
        <SafeAreaView edges={['bottom']} style={[styles.bar, { backgroundColor: c.canvas, borderTopColor: c.paperLine }]}>
          <Button
            icon="camera"
            title="Fiş çek"
            variant={expenses.length ? 'secondary' : 'primary'}
            onPress={() => router.push({ pathname: '/camera', params: { reportId: report.id, companyId: report.company_id, from: 'report' } })}
            style={{ flex: 1 }}
          />
          {expenses.length > 0 &&
            (unchecked.length ? (
              <Button
                icon="check"
                title={`Fişleri kontrol et (${unchecked.length})`}
                onPress={() => router.push({ pathname: '/expense/[id]', params: { id: unchecked[0].id, review: '1' } })}
                style={{ flex: 1.3 }}
              />
            ) : (
              <Button icon="send" title={isOwner && !active?.bureau_account_id ? 'Onaya gönder' : 'Kayda al'} onPress={confirmSubmit} loading={busy === 'submit'} style={{ flex: 1.3 }} />
            ))}
        </SafeAreaView>
      )}
    </View>
  );
}

/** Fişin yanındaki kontrol düğmesi: boş daire "kontrol bekliyor", dolu tik "doğru" */
function CheckToggle({ on, disabled, onPress }: { on: boolean; disabled?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={on ? 'Doğru olarak işaretli; geri almak için dokunun' : 'Doğru olarak işaretle'}
      style={[styles.check, { borderColor: on ? c.pen : c.faint, backgroundColor: on ? c.pen : 'transparent' }]}>
      {on && <Icon name="check" size={13} color={c.onPen} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
