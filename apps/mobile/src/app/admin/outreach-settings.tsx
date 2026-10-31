// Tanıtım e-postalarının gönderen bilgileri, günlük sınır ve 3 adımlı şablonlar.
// 6563 sayılı Kanun: her iletide gönderenin kimliği ve iletişim bilgisi bulunmalıdır; bu bilgiler e-postanın altına eklenir.
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Chips } from '@/components/chips';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Notice, SectionTitle } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { KIND_LABEL, outreachSettings, saveSetting, type LeadKind, type Sender, type Template } from '@/lib/leads';
import { errorText } from '@/lib/supabase';

const STEP = ['', 'İlk e-posta', 'Hatırlatma', 'Son e-posta'];

export default function OutreachSettings() {
  const c = useColors();
  const [sender, setSender] = useState<Sender | null>(null);
  const [cap, setCap] = useState('40');
  const [templates, setTemplates] = useState<Record<LeadKind, Template[]> | null>(null);
  const [kind, setKind] = useState<LeadKind>('bureau');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    outreachSettings()
      .then((s) => {
        setSender(s.sender);
        setCap(String(s.cap));
        setTemplates(s.templates);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  function setT(i: number, patch: Partial<Template>) {
    setTemplates((t) => (t ? { ...t, [kind]: t[kind].map((x, j) => (j === i ? { ...x, ...patch } : x)) } : t));
  }

  async function save() {
    if (!sender || !templates) return;
    const n = Number(cap);
    if (!Number.isInteger(n) || n < 1 || n > 300) return setError('Günlük sınırı 1 ile 300 arasında yazın.');
    if (!sender.address.trim() || !sender.phone.trim()) return setError('Adres ve telefon zorunludur: yasa, her tanıtım e-postasında gönderenin iletişim bilgisini ister.');
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await saveSetting('outreach_sender', sender);
      await saveSetting('outreach_daily_cap', n);
      await saveSetting('outreach_templates', templates);
      setInfo('Kaydedildi. Yeni hazırlanan taslaklar bu metinlerle oluşur; hazırlanmış taslaklar değişmez.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!sender || !templates) return <Page>{error ? <Notice tone="bad" text={error} /> : <Text style={{ color: c.muted }}>Yükleniyor…</Text>}</Page>;
  const s = (k: keyof Sender) => (v: string) => setSender({ ...sender, [k]: v });

  return (
    <Page>
      <Text style={[type.title, { color: c.ink }]}>Gönderen bilgileri ve şablonlar</Text>

      <SectionTitle title="Gönderen" />
      <Text style={[type.small, { color: c.muted }]}>Bu bilgiler her e-postanın altına yazılır. Yasa gereği adres ve telefon bulunmalıdır.</Text>
      <Field label="Adınız (imza)" value={sender.name} onChangeText={s('name')} />
      <Field label="Şirket unvanı" value={sender.company} onChangeText={s('company')} placeholder="Gidero Yazılım Ltd. Şti." />
      <Field label="Adres" value={sender.address} onChangeText={s('address')} placeholder="Mahalle, cadde, no, ilçe / il" />
      <Field label="Telefon" value={sender.phone} onChangeText={s('phone')} keyboardType="phone-pad" />
      <Field label="Web sitesi" value={sender.website} onChangeText={s('website')} autoCapitalize="none" />
      <Field label="Günlük en çok e-posta" value={cap} onChangeText={setCap} keyboardType="number-pad"
        hint="Yeni bir alan adıyla günde 30-50 e-postayla başlayın; birkaç hafta sonra artırın. Birden çok e-posta istenmeyen kutusuna düşerse adresiniz kara listeye girebilir." />

      <SectionTitle title="Şablonlar" />
      <Chips<LeadKind> role="radio" items={[{ key: 'bureau', label: KIND_LABEL.bureau }, { key: 'company', label: KIND_LABEL.company }]} value={kind} onChange={setKind} />
      <Text style={[type.small, { color: c.muted }]}>{'{firma}, {sehir} ve {gonderen} yazdığınız yerlere firma adı, şehir ve imzanız gelir.'}</Text>
      {templates[kind].map((t, i) => (
        <View key={t.step} style={{ gap: space.sm }}>
          <Text style={[type.section, { color: c.ink }]}>{`${STEP[t.step]}${t.delay_days ? ` (${t.delay_days}. gün)` : ' (hemen)'}`}</Text>
          {t.step > 1 ? (
            <Field label="Kaç gün sonra" value={String(t.delay_days)} onChangeText={(v) => setT(i, { delay_days: Math.max(1, Math.min(60, Number(v.replace(/\D/g, '')) || 1)) })} keyboardType="number-pad" />
          ) : null}
          <Field label="Konu" value={t.subject} onChangeText={(v) => setT(i, { subject: v })} maxLength={200} />
          <Field label="Metin" value={t.body} onChangeText={(v) => setT(i, { body: v })} multiline maxLength={8000} style={{ minHeight: 180 }} />
        </View>
      ))}

      {error ? <Notice tone="bad" text={error} /> : null}
      {info ? <Notice tone="ok" text={info} /> : null}
      <Button icon="check" title="Kaydet" onPress={save} loading={busy} />
    </Page>
  );
}
