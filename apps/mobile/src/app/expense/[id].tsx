import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Button, Field, Notice, Perforation, SectionTitle, Slip } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { amountInput, dateInput, money, parseAmount, parseDate } from '@/lib/format';
import { formatPlate, normalizePlate } from '@/lib/plate';
import { receiptUrl, recheckExpense } from '@/lib/receipts';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { DOC_TYPE_LABEL, type Category, type Expense, type Flag, type Report } from '@/lib/types';

type LineInput = { rate: string; base: string; vat: string };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function ExpenseScreen() {
  const { id, readError } = useLocalSearchParams<{ id: string; readError?: string }>();
  const c = useColors();
  const { userId, hasRole } = useSession();

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
      setCategories((cats.data ?? []) as Category[]);
      if (e.image_path) setImage(await receiptUrl(e.image_path));
    })();
  }, [id]);

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
  const showPlate =
    exp.doc_type === 'akaryakit_okc' || !!exp.plate || ['fuel', 'car_running'].includes(category?.tax_rule ?? '');
  const flags: Flag[] = exp.expense_flags ?? [];
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

  function addAttendee() {
    const name = attendeeDraft.trim();
    if (!name) return;
    if (!attendees.includes(name)) setAttendees([...attendees, name]);
    setAttendeeDraft('');
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
        })
        .eq('id', exp.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('expense_vat_lines').delete().eq('expense_id', exp.id);
      if (e2) throw e2;
      if (vatLines.length) {
        const { error: e3 } = await supabase.from('expense_vat_lines').insert(vatLines);
        if (e3) throw e3;
      }
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
    Alert.alert('Fiş silinsin mi?', 'Bu fiş rapordan çıkarılır.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (exp.image_path) await supabase.storage.from('receipts').remove([exp.image_path]);
          const { error: e } = await supabase.from('expenses').delete().eq('id', exp.id);
          if (e) return setError(errorText(e));
          router.back();
        },
      },
    ]);
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

        <SectionTitle title={`Kimlerle${category?.attendees_required ? ' (zorunlu)' : ''}`} />
        <View style={[styles.box, { backgroundColor: c.paper }]}>
          {attendees.length > 0 && (
            <View style={styles.chips}>
              {attendees.map((p) => (
                <Pressable
                  key={p}
                  disabled={!editable}
                  onPress={() => setAttendees(attendees.filter((x) => x !== p))}
                  style={[styles.chip, { backgroundColor: c.penSoft, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                  <Text style={{ color: c.pen, fontWeight: '600' }}>{p}</Text>
                  {editable && <Icon name="close" size={10} color={c.pen} />}
                </Pressable>
              ))}
            </View>
          )}
          {editable && (
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Kişi ekle"
                  value={attendeeDraft}
                  onChangeText={setAttendeeDraft}
                  onSubmitEditing={addAttendee}
                  returnKeyType="done"
                  placeholder="Ad soyad, firma"
                />
              </View>
              <Button variant="secondary" icon="plus" title="Ekle" onPress={addAttendee} style={{ minHeight: 48, backgroundColor: c.canvas }} />
            </View>
          )}
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
