import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Button, Field, Notice, Perforation, SectionTitle, Slip } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { amountInput, dateInput, money, parseAmount, parseDate } from '@/lib/format';
import { AttendeePicker } from '@/components/attendee-picker';
import { rememberContacts } from '@/lib/contacts';
import { PERIOD_LABEL, fetchUsage, rangeText, usageState, type Usage } from '@/lib/limits';
import { formatPlate, normalizePlate } from '@/lib/plate';
import { receiptUrl, recheckExpense } from '@/lib/receipts';
import { confirm } from '@/lib/confirm';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { PAYMENT_OPTIONS, type PaymentMethod } from '@/lib/payment';
import { DOC_TYPE_LABEL, type Category, type Expense, type Flag, type Report } from '@/lib/types';

type LineInput = { rate: string; base: string; vat: string };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function ExpenseScreen() {
  const { id, readError } = useLocalSearchParams<{ id: string; readError?: string }>();
  const c = useColors();
  const { userId, hasRole, active } = useSession();
  const [reloadKey, setReloadKey] = useState(0);

  const [exp, setExp] = useState<Expense | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [image, setImage] = useState<string | null>(null);

  const [total, setTotal] = useState('');
  const [date, setDate] = useState('');
  const [docNo, setDocNo] = useState('');
  const [seller, setSeller] = useState('');
  const [plate, setPlate] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attendeeDraft, setAttendeeDraft] = useState('');
  const [lines, setLines] = useState<LineInput[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>('personal');

  const [usage, setUsage] = useState<Usage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('expenses')
        .select('*, expense_vat_lines(id, rate, base, vat), expense_flags(id, code, severity, message, legal_ref)')
        .eq('id', id)
        .maybeSingle();
      if (!data) return;
      const e = data as Expense;
      setExp(e);
      setTotal(Number(e.total) > 0 ? amountInput(e.total) : '');
      setDate(dateInput(e.doc_date));
      setDocNo(e.doc_no ?? '');
      setSeller(e.seller_name ?? '');
      setPlate(formatPlate(e.plate));
      setCategoryId(e.category_id);
      setDescription(e.description ?? '');
      setAttendees(e.attendees ?? []);
      setPayment(e.payment_method ?? 'personal');
      setLines(
        (e.expense_vat_lines ?? []).map((l) => ({
          rate: String(Number(l.rate)),
          base: amountInput(l.base),
          vat: amountInput(l.vat),
        })),
      );
      const [r, cats] = await Promise.all([
        supabase.from('reports').select('*').eq('id', e.report_id).maybeSingle(),
        supabase
          .from('categories')
          .select('id, name, tax_rule, attendees_required, default_vat_rate')
          .eq('company_id', e.company_id)
          .eq('active', true)
          .order('name'),
      ]);
      setReport((r.data as Report) ?? null);
      if (r.data) {
        fetchUsage(e.company_id, (r.data as Report).owner_user_id)
          .then(setUsage)
          .catch(() => setUsage([]));
      }
      setCategories((cats.data ?? []) as Category[]);
      if (e.image_path) setImage(await receiptUrl(e.image_path));
    })();
  }, [id, reloadKey]);

  if (!exp) {
    return (
      <View style={{ padding: space.xl }}>
        <ActivityIndicator color={c.pen} />
      </View>
    );
  }

  const editable =
    !!report &&
    (report.status === 'draft' || report.status === 'returned') &&
    (report.owner_user_id === userId || (report.created_by === userId && hasRole('accountant')));

  const category = categories.find((k) => k.id === categoryId);
  const lim = usage.find((u) => u.category_id === categoryId);
  const limitInfo = (() => {
    if (!lim) return null;
    const current = parseAmount(total) ?? 0;
    const already = Number(exp.total) > 0 && exp.category_id === categoryId ? Number(exp.total) : 0;
    const after = lim.used - already + current;
    const st = usageState({ used: after, limit_amount: lim.limit_amount });
    const head = `${lim.category_name}: ${PERIOD_LABEL[lim.limit_period].toLocaleLowerCase('tr-TR')} sınır ${money(lim.limit_amount)} (${rangeText(lim.period_start, lim.period_end)}).`;
    return {
      over: st.over,
      near: st.near,
      text: st.over
        ? `${head} Bu fişle ${money(after)} olur, ${money(after - lim.limit_amount)} aşılır.`
        : `${head} Bu fişle ${money(after)} kullanılmış olur, ${money(lim.limit_amount - after)} kalır.`,
    };
  })();
  const showPlate =
    exp.doc_type === 'akaryakit_okc' || !!exp.plate || ['fuel', 'car_running'].includes(category?.tax_rule ?? '');
  const flags: Flag[] = (exp.expense_flags ?? []).filter((f) => f.code !== 'alcohol' && f.code !== 'alcohol_decided');
  const order = { critical: 0, warning: 1, info: 2 } as const;
  flags.sort((a, b) => order[a.severity] - order[b.severity]);

  function setLine(i: number, key: keyof LineInput, value: string) {
    setLines((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, [key]: value } : l));
      // Oran ve matrah girildiyse KDV'yi hesapla
      if (key !== 'vat') {
        const rate = Number(next[i].rate.replace(',', '.'));
        const base = parseAmount(next[i].base);
        if (Number.isFinite(rate) && base != null) next[i] = { ...next[i], vat: amountInput(round2((base * rate) / 100)) };
      }
      return next;
    });
  }

  async function save() {
    if (!exp) return;
    setError(null);
    const t = parseAmount(total);
    if (t == null || t <= 0) return setError('Fişin toplam tutarını yazın.');
    const d = date.trim() ? parseDate(date) : null;
    if (date.trim() && !d) return setError('Tarihi GG.AA.YYYY biçiminde yazın (örnek: 20.10.2026).');
    const vatLines = [];
    for (const l of lines) {
      const rate = Number(l.rate.replace(',', '.'));
      const base = parseAmount(l.base);
      const vat = parseAmount(l.vat);
      if (!Number.isFinite(rate) || base == null || vat == null) {
        return setError('KDV satırlarında oran, matrah ve KDV tutarını doldurun ya da satırı silin.');
      }
      vatLines.push({ expense_id: exp.id, company_id: exp.company_id, rate, base, vat });
    }
    const people = attendeeDraft.trim() && !attendees.includes(attendeeDraft.trim())
      ? [...attendees, attendeeDraft.trim()]
      : attendees;
    if (plate.trim() && !normalizePlate(plate)) return setError('Plakayı 35 ABC 123 biçiminde yazın.');
    if (category?.attendees_required && people.length === 0) {
      return setError(`${category.name} için masrafı kimlerle yaptığınızı yazın.`);
    }

    setBusy(true);
    try {
      const { error: e1 } = await supabase
        .from('expenses')
        .update({
          total: t,
          doc_date: d,
          doc_no: docNo.trim() || null,
          seller_name: seller.trim() || null,
          plate: plate.trim() ? normalizePlate(plate) ?? plate.trim().toUpperCase() : null,
          category_id: categoryId,
          description: description.trim(),
          attendees: people,
          payment_method: payment,
        })
        .eq('id', exp.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('expense_vat_lines').delete().eq('expense_id', exp.id);
      if (e2) throw e2;
      if (vatLines.length) {
        const { error: e3 } = await supabase.from('expense_vat_lines').insert(vatLines);
        if (e3) throw e3;
      }
      await rememberContacts(exp.company_id, people).catch(() => {});
      await recheckExpense(exp.id);
      router.back();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!exp) return;
    confirm('Fiş silinsin mi?', 'Bu fiş rapordan çıkarılır.', 'Sil', async () => {
      if (exp.image_path) await supabase.storage.from('receipts').remove([exp.image_path]);
      const { error: e } = await supabase.from('expenses').delete().eq('id', exp.id);
      if (e) return setError(errorText(e));
      router.back();
    });
  }

  const readDiffers =
    exp.read_total != null && parseAmount(total) != null && Math.abs(Number(exp.read_total) - (parseAmount(total) ?? 0)) > 0.01;
  const sevLook = (sev: Flag['severity']) =>
    sev === 'critical'
      ? { fg: c.red, bg: c.redSoft, label: 'Önemli' }
      : sev === 'warning'
        ? { fg: c.amber, bg: c.amberSoft, label: 'Uyarı' }
        : { fg: c.pen, bg: c.penSoft, label: 'Bilgi' };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 140 }}>
        {image && (
          <View style={[styles.imageWrap, { backgroundColor: c.paper }]}>
            <Image source={{ uri: image }} style={styles.image} contentFit="contain" transition={150} />
          </View>
        )}

        {readError ? <Notice tone="warn" text={readError} /> : null}
        {exp.read_source && !readError ? (
          <Notice
            tone="ok"
            text={
              exp.read_source === 'qr'
                ? 'Bilgiler faturadaki karekoddan okundu.'
                : 'Bilgiler fotoğraftan okundu. Tutarı ve tarihi fişle karşılaştırın.'
            }
          />
        ) : null}

        {exp.alcohol_present ? (
          <AlcoholCard
            expense={exp}
            canDecide={
              hasRole('accountant') &&
              !!report &&
              !['exported', 'paid'].includes(report.status) &&
              (report.owner_user_id !== userId || !!active?.bureau_account_id)
            }
            onDecided={() => setReloadKey((k) => k + 1)}
          />
        ) : null}

        {flags.length > 0 && (
          <View style={{ gap: space.sm }}>
            <SectionTitle title="Vergi kontrolü" />
            {flags.map((f) => {
              const look = sevLook(f.severity);
              return (
                <View key={f.id} style={[styles.flag, { backgroundColor: c.paper, borderLeftColor: look.fg }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name={f.severity === 'info' ? 'doc' : 'warning'} size={13} color={look.fg} />
                    <Text style={[type.small, { color: look.fg, fontWeight: '700' }]}>{look.label}</Text>
                  </View>
                  <Text style={[type.body, { color: c.ink }]}>{f.message}</Text>
                  {f.legal_ref ? <Text style={[type.small, { color: c.muted }]}>{f.legal_ref}</Text> : null}
                </View>
              );
            })}
          </View>
        )}

        <Slip>
          <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>{DOC_TYPE_LABEL[exp.doc_type] ?? 'Belge'}</Text>
          <View style={{ gap: space.md, marginTop: space.sm }}>
            <Field
              label="Toplam tutar (₺)"
              value={total}
              onChangeText={setTotal}
              keyboardType="decimal-pad"
              editable={editable}
              placeholder="0,00"
              style={{ fontSize: 30, fontFamily: fonts.displayHeavy, fontVariant: ['tabular-nums'] }}
              hint={readDiffers ? `Fişten okunan tutar: ${money(exp.read_total)}` : undefined}
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Field label="Tarih" value={date} onChangeText={setDate} editable={editable} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1.2 }}>
                <Field label="Fiş / fatura no" value={docNo} onChangeText={setDocNo} editable={editable} autoCapitalize="characters" />
              </View>
            </View>
            <Field label="Satıcı" value={seller} onChangeText={setSeller} editable={editable} />
            {showPlate && (
              <Field
                label="Araç plakası"
                value={plate}
                onChangeText={setPlate}
                editable={editable}
                autoCapitalize="characters"
                placeholder="35 ABC 123"
                hint={plate.trim() && !normalizePlate(plate) ? 'Plaka 35 ABC 123 biçiminde olmalı.' : 'Akaryakıt fişlerinde kişi kartınızdaki araçla karşılaştırılır.'}
              />
            )}
            {exp.seller_vkn ? <Text style={[type.small, { color: c.muted }]}>Satıcı vergi no: {exp.seller_vkn}</Text> : null}
          </View>

          <Perforation />

          <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>KDV</Text>
          {lines.length === 0 && <Text style={[type.small, { color: c.faint }]}>KDV satırı yok.</Text>}
          {lines.map((l, i) => (
            <View key={i} style={styles.lineRow}>
              <View style={{ width: 64 }}>
                <Field label="Oran %" value={l.rate} onChangeText={(v) => setLine(i, 'rate', v)} keyboardType="number-pad" editable={editable} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Matrah" value={l.base} onChangeText={(v) => setLine(i, 'base', v)} keyboardType="decimal-pad" editable={editable} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="KDV tutarı" value={l.vat} onChangeText={(v) => setLine(i, 'vat', v)} keyboardType="decimal-pad" editable={editable} />
              </View>
              {editable && (
                <Pressable onPress={() => setLines(lines.filter((_, j) => j !== i))} hitSlop={10} style={{ paddingBottom: 14 }} accessibilityLabel="KDV satırını sil">
                  <Icon name="close" size={14} color={c.muted} />
                </Pressable>
              )}
            </View>
          ))}
          {editable && (
            <Pressable
              onPress={() => setLines([...lines, { rate: String(category?.default_vat_rate ?? 20), base: '', vat: '' }])}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.sm }}>
              <Icon name="plus" size={14} color={c.pen} />
              <Text style={{ color: c.pen, fontWeight: '600' }}>KDV satırı ekle</Text>
            </Pressable>
          )}
        </Slip>

        <SectionTitle title="Kategori" />
        <View style={styles.chips}>
          {categories.map((k) => {
            const on = k.id === categoryId;
            return (
              <Pressable
                key={k.id}
                disabled={!editable}
                onPress={() => setCategoryId(on ? null : k.id)}
                style={[styles.chip, { backgroundColor: on ? c.pen : c.paper }]}>
                <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{k.name}</Text>
              </Pressable>
            );
          })}
        </View>

        {limitInfo && (
          <Notice
            tone={limitInfo.over ? 'bad' : limitInfo.near ? 'warn' : 'info'}
            text={limitInfo.text}
          />
        )}

        <SectionTitle title="Kim ödedi?" />
        <View style={styles.chips}>
          {PAYMENT_OPTIONS.map((o) => {
            const on = o.key === payment;
            return (
              <Pressable
                key={o.key}
                disabled={!editable}
                onPress={() => setPayment(o.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[styles.chip, { backgroundColor: on ? c.pen : c.paper }]}>
                <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[type.small, { color: c.muted, marginTop: -space.sm }]}>{PAYMENT_OPTIONS.find((o) => o.key === payment)?.hint}</Text>

        <SectionTitle title={`Kimlerle yapıldı${category?.attendees_required ? ' (zorunlu)' : ''}`} />
        <View style={[styles.box, { backgroundColor: c.paper }]}>
          <AttendeePicker
            companyId={exp.company_id}
            value={attendees}
            onChange={setAttendees}
            onDraft={setAttendeeDraft}
            editable={editable}
          />
          <Field
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
            editable={editable}
            multiline
            placeholder="Örnek: ABC firmasıyla sipariş görüşmesi"
          />
        </View>

        {error && <Notice tone="bad" text={error} />}
        {editable ? (
          <Button variant="plain" icon="trash" title="Fişi sil" onPress={remove} />
        ) : (
          <Notice text="Rapor onaya gönderildiği için fiş değiştirilemez." />
        )}
      </ScrollView>

      {editable && (
        <SafeAreaView edges={['bottom']} style={[styles.bar, { backgroundColor: c.canvas, borderTopColor: c.paperLine }]}>
          <Button icon="check" title="Kaydet" onPress={save} loading={busy} style={{ flex: 1 }} />
        </SafeAreaView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  imageWrap: { borderRadius: radius.lg, overflow: 'hidden' },
  image: { width: '100%', height: 300 },
  flag: { borderRadius: radius.md, borderLeftWidth: 3, padding: space.md, gap: 4 },
  lineRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end', marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

/** Fişte alkollü içki: tutar, kalemler ve muhasebe kararı (onayla: gider yazılır; reddet: ödenmez) */
function AlcoholCard({ expense, canDecide, onDecided }: { expense: Expense; canDecide: boolean; onDecided: () => void }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(expense.alcohol_amount ?? 0);
  const decision = expense.alcohol_decision ?? null;
  const tone = decision === 'accepted' ? c.pen : decision === 'rejected' ? c.red : c.amber;
  const status =
    decision === 'accepted'
      ? 'Muhasebe onayladı: gider yazılır.'
      : decision === 'rejected'
        ? `Muhasebe reddetti: ${money(amount)} ödenmez ve gider yazılmaz.`
        : 'Muhasebe kararı bekleniyor. Karar verilmeden rapor aktarılamaz.';

  async function decide(d: 'accepted' | 'rejected') {
    if (d === 'rejected') {
      return confirm('Alkolü reddet', `${money(amount)} gider yazılmayacak ve çalışana ödenmeyecek. Devam edilsin mi?`, 'Reddet', () => send(d));
    }
    send(d);
  }

  async function send(d: 'accepted' | 'rejected') {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('decide_alcohol', { p_expense: expense.id, p_decision: d });
    setBusy(false);
    if (e) return setError(errorText(e));
    onDecided();
  }

  return (
    <View style={[styles.flag, { backgroundColor: c.paper, borderLeftColor: tone, gap: space.sm }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="warning" size={13} color={tone} />
        <Text style={[type.small, { color: tone, fontWeight: '700' }]}>Alkollü içki</Text>
        <Text style={[type.bodyStrong, { color: c.ink, marginLeft: 'auto' }]}>{amount > 0 ? money(amount) : 'Tutar okunamadı'}</Text>
      </View>
      {expense.alcohol_items?.length ? (
        <Text style={[type.body, { color: c.ink }]}>{expense.alcohol_items.join(', ')}</Text>
      ) : null}
      <Text style={[type.small, { color: c.muted }]}>{status}</Text>
      {error ? <Notice tone="bad" text={error} /> : null}
      {canDecide ? (
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Button title={decision === 'accepted' ? 'Onaylandı' : 'Onayla'} onPress={() => decide('accepted')} disabled={busy || decision === 'accepted'} />
          <Button title={decision === 'rejected' ? 'Reddedildi' : 'Reddet'} variant="danger" onPress={() => decide('rejected')} disabled={busy || decision === 'rejected'} />
        </View>
      ) : null}
    </View>
  );
}
