import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Group, Notice, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { expandFiles, matchExisting, processItem, type Item, type Person } from '@/lib/bulk/upload.ts';
import { currentPeriod, money } from '@/lib/format';
import { sendPending } from '@/lib/notifications';
import { PAYMENT_OPTIONS, type PaymentMethod } from '@/lib/payment';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

const KIND_LABEL = { image: 'Fotoğraf', pdf: 'PDF', invoice: 'e-Fatura' } as const;
const STATUS_LABEL: Record<Item['status'], string> = {
  ready: 'Yüklenmeyi bekliyor',
  working: 'Yükleniyor…',
  done: 'Tamam',
  matched: 'Kayıtlı fişle eşleşti',
  skipped: 'Atlandı',
  error: 'Sorun var',
};

// Muhasebeci, WhatsApp'tan ya da e-postadan gelen fişleri ve e-Fatura XML'lerini bilgisayardan tek seferde yükler.
export default function BulkUpload() {
  const c = useColors();
  const { active, userId, hasRole } = useSession();
  const [people, setPeople] = useState<Person[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [bulkPerson, setBulkPerson] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null); // kişi seçilen kalem
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>('personal');
  const touched = useRef(new Set<string>());
  const isAccountant = hasRole('accountant');

  const loadPeople = useCallback(async () => {
    if (!active) return;
    const { data } = await supabase.from('memberships').select('user_id, vehicle_plates').eq('company_id', active.company_id).eq('status', 'active');
    const ids = (data ?? []).map((m: any) => m.user_id);
    const { data: prof } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    const names = new Map((prof ?? []).map((p: any) => [p.id, p.full_name || 'İsimsiz kullanıcı']));
    setPeople(
      (data ?? [])
        .map((m: any) => ({ user_id: m.user_id, full_name: names.get(m.user_id) ?? 'İsimsiz kullanıcı', vehicle_plates: m.vehicle_plates ?? [] }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')),
    );
  }, [active]);

  useFocusEffect(
    useCallback(() => {
      loadPeople();
    }, [loadPeople]),
  );

  const nameOf = (uid: string | null) => people.find((p) => p.user_id === uid)?.full_name ?? null;

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!active || !files.length) return;
      setError(null);
      setInfo(null);
      try {
        const res = await expandFiles(files, people);
        await matchExisting(active.company_id, res.items, people);
        setItems((cur) => [...cur, ...res.items]);
        setIgnored((cur) => [...cur, ...res.ignored]);
      } catch (e) {
        setError(`Dosyalar açılamadı: ${errorText(e)}`);
      }
    },
    [active, people],
  );

  // Sürükle bırak (yalnızca bilgisayarda)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = () => setDragging(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [addFiles]);

  function choose() {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,application/pdf,.pdf,.xml,text/xml,.zip,application/zip,.txt';
    input.onchange = () => addFiles(Array.from(input.files ?? []));
    input.click();
  }

  const update = (k: string, patch: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === k ? { ...i, ...patch } : i)));

  function applyBulk(uid: string) {
    setBulkPerson(uid);
    setItems((cur) => cur.map((i) => (i.status === 'ready' && !i.assignee ? { ...i, assignee: uid, reason: 'Toplu seçimle atandı' } : i)));
  }

  const queue = items.filter((i) => i.status === 'ready' || i.status === 'matched');
  const missing = queue.filter((i) => i.status === 'ready' && !i.assignee).length;

  async function run() {
    if (!active || !userId) return;
    setRunning(true);
    setError(null);
    const todo = items.filter((i) => (i.status === 'ready' && i.assignee) || i.status === 'matched');
    const ctx = { companyId: active.company_id, me: userId, period: currentPeriod().period, payment };
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const it = todo[next++];
        update(it.key, { status: 'working' });
        try {
          const res = await processItem(it, ctx);
          update(it.key, res);
          if (it.assignee && it.assignee !== userId) touched.current.add(it.assignee);
        } catch (e) {
          update(it.key, { status: 'error', message: errorText(e) });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setRunning(false);
    setInfo('Yükleme bitti. Okunan fişleri raporlarda kontrol edin; başkası adına girdiğiniz raporları aşağıdan kayda alın.');
  }

  async function bookReports() {
    if (!active || !userId) return;
    setError(null);
    const { data } = await supabase
      .from('reports')
      .select('id')
      .eq('company_id', active.company_id)
      .eq('created_by', userId)
      .neq('owner_user_id', userId)
      .in('status', ['draft', 'returned']);
    let ok = 0;
    for (const r of data ?? []) {
      const { error: e } = await supabase.rpc('submit_report', { p_report: r.id });
      if (!e) ok++;
    }
    sendPending();
    setInfo(`${ok} rapor onay beklemeden kayda alındı ve muhasebe aktarımında görünüyor.`);
  }

  const counts = useMemo(() => {
    const by = { image: 0, pdf: 0, invoice: 0 };
    items.forEach((i) => by[i.kind]++);
    return by;
  }, [items]);

  if (!isAccountant) {
    return (
      <Page>
        <Notice tone="info" text="Toplu yüklemeyi muhasebeci rolündeki kişiler yapar. Ekip ekranından kendinize muhasebeci rolü verebilirsiniz." />
      </Page>
    );
  }

  return (
    <Page wide>
      <Text style={[type.body, { color: c.muted }]}>
        WhatsApp sohbetini "Sohbeti dışa aktar, medya dahil" ile ZIP olarak kaydedin ya da fişleri bir klasöre indirin; hepsini buraya bırakın.
        Fotoğraflar ve PDF'ler okunur, e-Fatura XML'leri doğrudan kaydedilir.
      </Text>
      {Platform.OS !== 'web' && <Notice tone="info" text="Toplu yükleme bilgisayar içindir. Gidero'yu bilgisayarınızın tarayıcısında açın." />}
      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}

      <Pressable
        onPress={choose}
        style={[styles.drop, { borderColor: dragging ? c.pen : c.paperLine, backgroundColor: dragging ? c.penSoft : c.paper }]}>
        <Icon name="inbox" size={28} color={c.pen} />
        <Text style={[type.bodyStrong, { color: c.ink }]}>Dosyaları buraya bırakın ya da seçin</Text>
        <Text style={[type.small, { color: c.muted, textAlign: 'center' }]}>JPG, PNG, PDF, e-Fatura XML ve WhatsApp ZIP</Text>
      </Pressable>

      {items.length > 0 && (
        <>
          <SectionTitle title={`${items.length} dosya: ${counts.image} fotoğraf, ${counts.pdf} PDF, ${counts.invoice} e-Fatura`} />
          {missing > 0 && (
            <View style={{ gap: space.sm }}>
              <Text style={[type.body, { color: c.ink }]}>{`${missing} dosyanın kime ait olduğu bilinmiyor. Hepsini bir kişiye atayın ya da tek tek seçin:`}</Text>
              <View style={styles.chips}>
                {people.map((p) => {
                  const on = bulkPerson === p.user_id;
                  return (
                    <Pressable key={p.user_id} onPress={() => applyBulk(p.user_id)} style={[styles.chip, { backgroundColor: on ? c.pen : c.paper }]}>
                      <Text style={{ color: on ? c.onPen : c.ink }}>{p.full_name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <Group>
            {items.map((it) => {
              const who = nameOf(it.assignee);
              const tone = it.status === 'error' ? c.red : it.status === 'done' || it.status === 'matched' ? c.pen : it.assignee ? c.muted : c.stamp;
              return (
                <View key={it.key} style={[styles.item, { borderColor: c.paperLine }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyStrong, { color: c.ink }]} numberOfLines={1}>
                      {it.invoice ? `${it.invoice.seller_name ?? 'Fatura'}${it.invoice.total != null ? `, ${money(it.invoice.total)}` : ''}` : it.name}
                    </Text>
                    <Text style={[type.small, { color: c.muted }]} numberOfLines={2}>
                      {[KIND_LABEL[it.kind], it.invoice?.doc_date, it.reason].filter(Boolean).join(', ')}
                    </Text>
                    <Text style={[type.small, { color: tone, fontWeight: '600' }]}>{it.message ?? STATUS_LABEL[it.status]}</Text>
                  </View>
                  {(it.status === 'ready' || it.status === 'error') && (
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Pressable onPress={() => setPicking(picking === it.key ? null : it.key)} style={[styles.person, { backgroundColor: who ? c.penSoft : c.stampSoft }]}>
                        <Text style={{ color: who ? c.pen : c.stamp, fontWeight: '600' }}>{who ?? 'Kişi seçin'}</Text>
                      </Pressable>
                      <Pressable onPress={() => update(it.key, { status: 'skipped' })}>
                        <Text style={[type.small, { color: c.muted }]}>Atla</Text>
                      </Pressable>
                    </View>
                  )}
                  {picking === it.key && (
                    <View style={[styles.chips, { width: '100%' }]}>
                      {people.map((p) => (
                        <Pressable
                          key={p.user_id}
                          onPress={() => {
                            update(it.key, { assignee: p.user_id, reason: 'Elle seçildi', status: it.status === 'error' && it.invoice ? 'ready' : it.status === 'error' ? 'ready' : it.status, message: undefined });
                            setPicking(null);
                          }}
                          style={[styles.chip, { backgroundColor: c.canvas }]}>
                          <Text style={{ color: c.ink }}>{p.full_name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </Group>
          <Text style={[type.bodyStrong, { color: c.ink }]}>Bu dosyaları kim ödedi?</Text>
          <View style={styles.chips}>
            {PAYMENT_OPTIONS.map((o) => {
              const on = o.key === payment;
              return (
                <Pressable key={o.key} onPress={() => setPayment(o.key)} style={[styles.chip, { backgroundColor: on ? c.pen : c.paper }]}>
                  <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[type.small, { color: c.muted }]}>Farklı ödenen fiş varsa yükledikten sonra fişin içinden değiştirebilirsiniz.</Text>
          {ignored.length > 0 && <Text style={[type.small, { color: c.muted }]}>{`Tanınmayan dosyalar atlandı: ${ignored.slice(0, 5).join(', ')}${ignored.length > 5 ? '…' : ''}`}</Text>}
          <View style={styles.buttons}>
            <Button
              title={running ? 'Yükleniyor…' : `${queue.filter((i) => i.assignee || i.status === 'matched').length} dosyayı yükle`}
              onPress={run}
              loading={running}
              disabled={running || queue.every((i) => !i.assignee && i.status !== 'matched')}
            />
            <Button title="Listeyi temizle" variant="plain" onPress={() => { setItems([]); setIgnored([]); setInfo(null); }} disabled={running} />
          </View>
          {touched.current.size > 0 && !running && (
            <View style={[styles.card, { backgroundColor: c.paper }]}>
              <Text style={[type.body, { color: c.ink }]}>
                Başkası adına girdiğiniz fişler, siz kayda alana kadar taslak raporda bekler. Kontrol ettikten sonra onay beklemeden kayda alabilirsiniz.
              </Text>
              <View style={styles.buttons}>
                <Button title="Raporları kayda al" onPress={bookReports} />
                <Button title="Muhasebe aktarımına git" variant="secondary" onPress={() => router.push('/export')} />
              </View>
            </View>
          )}
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  drop: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.xxl, alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  item: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
  person: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
});
