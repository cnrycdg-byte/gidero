// Müşteri adayları: bulunan, Excel'den yapıştırılan ya da elle eklenen firmalar ve durumları.
// Firma seçilip "E-posta dizisini hazırla" denince 3 adımlı taslaklar Gönderim kutusuna düşer; hiçbiri onaysız gitmez.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Check, Chips } from '@/components/chips';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Empty, Field, Notice, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import {
  addLeads, KIND_LABEL, listLeads, prepareSequence, SOURCE_LABEL, STATUS_LABEL, updateLead, type Lead, type LeadKind, type LeadStatus,
} from '@/lib/leads';
import { parsePasted } from '@/lib/leads/paste';
import { errorText } from '@/lib/supabase';

type Filter = 'all' | LeadStatus;
const ORDER: LeadStatus[] = ['new', 'contacted', 'replied', 'interested', 'customer', 'lost', 'unsubscribed'];

export default function LeadsScreen() {
  const c = useColors();
  const [rows, setRows] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<Filter>('new');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<'none' | 'add' | 'paste'>('none');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listLeads());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length };
    for (const r of rows) m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, [rows]);

  const shown = useMemo(() => {
    const s = q.trim().toLocaleLowerCase('tr-TR');
    return rows.filter(
      (r) => (filter === 'all' || r.status === filter) &&
        (!s || [r.name, r.city, r.email, r.district].some((v) => v?.toLocaleLowerCase('tr-TR').includes(s))),
    );
  }, [rows, filter, q]);
  const ready = shown.filter((r) => r.email && (r.status === 'new' || r.status === 'contacted'));

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function prepare() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const n = await prepareSequence([...picked]);
      setPicked(new Set());
      setInfo(n ? `${n} firma için e-posta taslakları hazırlandı. Gönderim kutusunda okuyup onaylayın; onaylamadan hiçbir e-posta gitmez.` : 'Seçilen firmaların e-postası yok ya da daha önce dizisi hazırlanmış.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page refreshing={loading} onRefresh={load}>
      <Text style={[type.title, { color: c.ink }]}>Müşteri adayları</Text>
      <Text style={[type.body, { color: c.muted }]}>
        Bulduğunuz firmalar burada. Firmaları seçip e-posta dizisini hazırlayın; taslaklar Gönderim kutusuna düşer ve siz onaylayınca gider.
      </Text>

      <View style={styles.actions}>
        <Button icon="search" title="Firma bul" onPress={() => router.push('/admin/leads/find')} />
        <Button variant="secondary" icon="plus" title="Elle ekle" onPress={() => setMode(mode === 'add' ? 'none' : 'add')} />
        <Button variant="secondary" icon="doc" title="Excel'den yapıştır" onPress={() => setMode(mode === 'paste' ? 'none' : 'paste')} />
      </View>
      {mode === 'add' ? <AddOne onDone={(m) => { setMode('none'); setInfo(m); load(); }} /> : null}
      {mode === 'paste' ? <PasteMany onDone={(m) => { setMode('none'); setInfo(m); load(); }} /> : null}

      <Chips<Filter>
        items={[{ key: 'all', label: 'Hepsi', count: counts.all ?? 0 }, ...ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s], count: counts[s] ?? 0 }))]}
        value={filter}
        onChange={(f) => { setFilter(f); setPicked(new Set()); }}
      />
      <Field label="Ara" value={q} onChangeText={setQ} placeholder="Firma, şehir ya da e-posta" />

      {error ? <Notice tone="bad" text={error} /> : null}
      {info ? <Notice tone="ok" text={info} /> : null}

      {ready.length ? (
        <View style={[styles.bar, { backgroundColor: c.penSoft }]}>
          <Check
            on={ready.every((r) => picked.has(r.id))}
            label="E-postası olanların hepsini seç"
            onPress={() => setPicked(ready.every((r) => picked.has(r.id)) ? new Set() : new Set(ready.map((r) => r.id)))}
          />
          <Text style={[type.subhead, { color: c.ink, flex: 1 }]}>
            {picked.size ? `${picked.size} firma seçildi` : `E-postası olan ${ready.length} firma`}
          </Text>
          <Button icon="mail" title="E-posta dizisini hazırla" onPress={prepare} loading={busy} disabled={!picked.size} />
        </View>
      ) : null}

      {!loading && shown.length === 0 ? (
        <Empty icon="search" title={rows.length ? 'Bu listede firma yok' : 'Henüz firma eklemediniz'} text="Firma bul ile Google Haritalar'dan ya da web'den firma arayın, ya da Excel listenizi yapıştırın." />
      ) : null}

      {shown.map((r) => (
        <View key={r.id} style={[styles.card, { backgroundColor: c.paper }]}>
          <View style={styles.head}>
            {r.email && (r.status === 'new' || r.status === 'contacted') ? <Check on={picked.has(r.id)} onPress={() => toggle(r.id)} label={`${r.name} seç`} /> : <View style={{ width: 24 }} />}
            <Pressable style={{ flex: 1, gap: 2 }} onPress={() => setOpen(open === r.id ? null : r.id)} accessibilityRole="button">
              <Text style={[type.section, { color: c.ink }]} numberOfLines={1}>{r.name}</Text>
              <Text style={[type.small, { color: c.muted }]} numberOfLines={1}>
                {[r.district, r.city].filter(Boolean).join(', ') || 'Şehir yok'} · {KIND_LABEL[r.kind]}{r.sector ? ` (${r.sector})` : ''} · {SOURCE_LABEL[r.source]}
              </Text>
              <Text style={[type.small, { color: r.email ? c.ink : c.amber }]} numberOfLines={1}>{r.email ?? 'E-posta bulunamadı; açıp elle yazabilirsiniz'}</Text>
            </Pressable>
            <StatusPill s={r.status} />
          </View>
          {open === r.id ? <Editor lead={r} onSaved={() => { setOpen(null); load(); }} /> : null}
        </View>
      ))}
    </Page>
  );
}

function StatusPill({ s }: { s: LeadStatus }) {
  const c = useColors();
  const fg = s === 'new' ? c.blue : s === 'customer' || s === 'interested' ? c.green : s === 'replied' ? c.pen : s === 'unsubscribed' || s === 'lost' ? c.muted : c.amber;
  return (
    <View style={[styles.pill, { backgroundColor: c.fill }]}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 12 }}>{STATUS_LABEL[s]}</Text>
    </View>
  );
}

function Editor({ lead, onSaved }: { lead: Lead; onSaved: () => void }) {
  const c = useColors();
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [email, setEmail] = useState(lead.email ?? '');
  const [contact, setContact] = useState(lead.contact_name ?? '');
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateLead(lead.id, { status, email: email.trim() || null, contact: contact.trim() || null, notes: notes.trim() || null });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.sm, marginTop: space.md }}>
      {[lead.phone, lead.website, lead.address].filter(Boolean).map((v) => (
        <Text key={v} style={[type.small, { color: c.muted }]} selectable>{v}</Text>
      ))}
      <Text style={[type.subhead, { color: c.ink }]}>Durum</Text>
      <Chips<LeadStatus> role="radio" items={ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s] }))} value={status} onChange={setStatus} />
      {status === 'replied' || status === 'interested' || status === 'customer' || status === 'lost' ? (
        <Text style={[type.small, { color: c.muted }]}>Bu durumda kalan takip e-postaları gönderilmez.</Text>
      ) : null}
      {status === 'unsubscribed' ? (
        <Text style={[type.small, { color: c.muted }]}>Adres kalıcı ret listesine yazılır; bu adrese bir daha e-posta gönderilemez.</Text>
      ) : null}
      <Field label="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="info@firma.com.tr" />
      <Field label="Görüştüğünüz kişi" value={contact} onChangeText={setContact} placeholder="Ad Soyad, unvan" />
      <Field label="Not" value={notes} onChangeText={setNotes} multiline maxLength={4000} placeholder="Örnek: Salı 14.00'te aranacak, 30 müşterisi var." />
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button icon="check" title="Kaydet" onPress={save} loading={busy} />
    </View>
  );
}

function KindPick({ value, onChange }: { value: LeadKind; onChange: (k: LeadKind) => void }) {
  return <Chips<LeadKind> role="radio" items={[{ key: 'bureau', label: KIND_LABEL.bureau }, { key: 'company', label: KIND_LABEL.company }]} value={value} onChange={onChange} />;
}

function AddOne({ onDone }: { onDone: (msg: string) => void }) {
  const c = useColors();
  const [kind, setKind] = useState<LeadKind>('bureau');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (name.trim().length < 2) return setError('Firma adını yazın.');
    setBusy(true);
    setError(null);
    try {
      const r = await addLeads([{ name, email: email || null, city: city || null, phone: phone || null, kind, source: 'manual' }]);
      onDone(r.added ? `${name} listeye eklendi.` : 'Bu firma ya da e-posta zaten listede veya listeden çıkmış.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={[styles.card, { backgroundColor: c.paper, gap: space.sm }]}>
      <SectionTitle title="Firma ekle" />
      <KindPick value={kind} onChange={setKind} />
      <Field label="Firma adı" value={name} onChangeText={setName} placeholder="Demir Mali Müşavirlik" />
      <Field label="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Şehir" value={city} onChangeText={setCity} />
      <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button icon="plus" title="Listeye ekle" onPress={save} loading={busy} />
    </View>
  );
}

function PasteMany({ onDone }: { onDone: (msg: string) => void }) {
  const c = useColors();
  const [kind, setKind] = useState<LeadKind>('bureau');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => parsePasted(text, kind), [text, kind]);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await addLeads(rows);
      onDone(`${r.added} firma eklendi${r.skipped ? `, ${r.skipped} satır atlandı (listede var, listeden çıkmış ya da adresi hatalı)` : ''}.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={[styles.card, { backgroundColor: c.paper, gap: space.sm }]}>
      <SectionTitle title="Excel'den yapıştır" />
      <Text style={[type.small, { color: c.muted }]}>
        Excel'de sütunları seçip kopyalayın ve buraya yapıştırın. İlk satırda Firma, E-posta, Şehir, Telefon başlıkları varsa sütunlar adından tanınır; yoksa sıra firma adı, e-posta, şehir, telefon olmalı.
      </Text>
      <KindPick value={kind} onChange={setKind} />
      <Field label="Liste" value={text} onChangeText={setText} multiline placeholder={'Firma\tE-posta\tŞehir\nDemir SMMM\tinfo@demirsmmm.com\tİzmir'} style={{ minHeight: 140 }} />
      {rows.length ? <Text style={[type.small, { color: c.ink }]}>{`${rows.length} firma okundu, ${rows.filter((r) => r.email).length} tanesinin e-postası var.`}</Text> : null}
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button icon="plus" title={`${rows.length || ''} firmayı ekle`.trim()} onPress={save} loading={busy} disabled={!rows.length} />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, flexWrap: 'wrap' },
  card: { borderRadius: radius.md, padding: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pill: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
});
