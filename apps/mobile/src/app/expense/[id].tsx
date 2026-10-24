import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Field, Label, Notice, Pill } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { amountInput, dateInput, money, parseAmount, parseDate } from '@/lib/format';
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
        <Body muted>Yükleniyor…</Body>
      </View>
    );
  }

  const editable =
    !!report &&
    (report.status === 'draft' || report.status === 'returned') &&
    (report.owner_user_id === userId || (report.created_by === userId && hasRole('accountant')));

  const category = categories.find((k) => k.id === categoryId);
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

  const readDiffers = exp.read_total != null && parseAmount(total) != null && Math.abs(Number(exp.read_total) - (parseAmount(total) ?? 0)) > 0.01;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 3 }}>
        {image && (
          <Image source={{ uri: image }} style={[styles.image, { backgroundColor: c.card }]} contentFit="contain" />
        )}

        {readError ? <Notice tone="warn" text={readError} /> : null}
        {exp.read_source && !readError ? (
          <Notice
            text={
              exp.read_source === 'qr'
                ? 'Bilgiler faturadaki karekoddan okundu.'
                : 'Bilgiler fotoğraftan okundu. Tutarı ve tarihi fişle karşılaştırıp kaydedin.'
            }
          />
        ) : null}

        {flags.length > 0 && (
          <Card>
            <Label>Vergi kontrolü</Label>
            {flags.map((f) => (
              <View key={f.id} style={{ gap: 4 }}>
                <Pill
                  text={f.severity === 'critical' ? 'Önemli' : f.severity === 'warning' ? 'Uyarı' : 'Bilgi'}
                  tone={f.severity === 'critical' ? 'bad' : f.severity === 'warning' ? 'warn' : 'info'}
                />
                <Text style={[type.body, { color: c.text, lineHeight: 22 }]}>{f.message}</Text>
                {f.legal_ref ? <Text style={[type.small, { color: c.muted }]}>{f.legal_ref}</Text> : null}
              </View>
            ))}
          </Card>
        )}

        <Card>
          <Label>{DOC_TYPE_LABEL[exp.doc_type] ?? 'Belge'}</Label>
          <Field
            label="Toplam tutar (₺)"
            value={total}
            onChangeText={setTotal}
            keyboardType="decimal-pad"
            editable={editable}
            placeholder="0,00"
            style={{ fontSize: 24, fontWeight: '700' }}
            hint={readDiffers ? `Fişten okunan tutar: ${money(exp.read_total)}` : undefined}
          />
          <Field label="Tarih" value={date} onChangeText={setDate} editable={editable} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" />
          <Field label="Fiş / fatura numarası" value={docNo} onChangeText={setDocNo} editable={editable} autoCapitalize="characters" />
          <Field label="Satıcı" value={seller} onChangeText={setSeller} editable={editable} />
          {exp.seller_vkn ? <Text style={[type.small, { color: c.muted }]}>Satıcı vergi no: {exp.seller_vkn}</Text> : null}
        </Card>

        <Card>
          <Label>KDV</Label>
          {lines.length === 0 && <Body muted>KDV satırı yok.</Body>}
          {lines.map((l, i) => (
            <View key={i} style={styles.lineRow}>
              <View style={{ width: 70 }}>
                <Field label="Oran %" value={l.rate} onChangeText={(v) => setLine(i, 'rate', v)} keyboardType="number-pad" editable={editable} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Matrah" value={l.base} onChangeText={(v) => setLine(i, 'base', v)} keyboardType="decimal-pad" editable={editable} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="KDV" value={l.vat} onChangeText={(v) => setLine(i, 'vat', v)} keyboardType="decimal-pad" editable={editable} />
              </View>
              {editable && (
                <Pressable onPress={() => setLines(lines.filter((_, j) => j !== i))} hitSlop={10} style={{ paddingBottom: 14 }}>
                  <Text style={{ color: c.danger, fontSize: 20 }}>×</Text>
                </Pressable>
              )}
            </View>
          ))}
          {editable && (
            <Button
              variant="ghost"
              title="KDV satırı ekle"
              onPress={() =>
                setLines([...lines, { rate: String(category?.default_vat_rate ?? 20), base: '', vat: '' }])
              }
            />
          )}
        </Card>

        <Card>
          <Label>Kategori</Label>
          <View style={styles.chips}>
            {categories.map((k) => {
              const on = k.id === categoryId;
              return (
                <Pressable
                  key={k.id}
                  disabled={!editable}
                  onPress={() => setCategoryId(on ? null : k.id)}
                  style={[
                    styles.chip,
                    { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.card },
                  ]}>
                  <Text style={{ color: on ? c.primary : c.text, fontWeight: on ? '600' : '400' }}>{k.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <Field
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
            editable={editable}
            multiline
            placeholder="Örnek: ABC firmasıyla sipariş görüşmesi"
          />
          <Label>Masrafı kimlerle yaptınız{category?.attendees_required ? ' (zorunlu)' : ''}</Label>
          <View style={styles.chips}>
            {attendees.map((p) => (
              <Pressable
                key={p}
                disabled={!editable}
                onPress={() => setAttendees(attendees.filter((x) => x !== p))}
                style={[styles.chip, { borderColor: c.border, backgroundColor: c.card }]}>
                <Text style={{ color: c.text }}>{p}{editable ? '  ×' : ''}</Text>
              </Pressable>
            ))}
          </View>
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
              <Button variant="secondary" title="Ekle" onPress={addAttendee} style={{ minHeight: 46 }} />
            </View>
          )}
        </Card>

        {error && <Notice tone="bad" text={error} />}
        {editable ? (
          <>
            <Button title="Kaydet" onPress={save} loading={busy} />
            <Button variant="ghost" title="Fişi sil" onPress={remove} />
          </>
        ) : (
          <Notice text="Bu rapor onaya gönderildiği için fiş değiştirilemez." />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 320, borderRadius: radius.lg },
  lineRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
});
