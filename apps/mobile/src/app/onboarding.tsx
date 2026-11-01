import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Button, Field, Notice } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { addPerson } from '@/lib/people';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Kind = 'company' | 'bureau';
type Who = { mode: 'me' | 'other'; name: string; email: string };
const ME: Who = { mode: 'me', name: '', email: '' };

export default function Onboarding() {
  const c = useColors();
  const { reloadMemberships, platformAdmin, userId } = useSession();
  // Süreç ancak muhasebeci ve ödeme yetkilisiyle tamamlanır: kurulumda ikisi de belirlenir
  const [acc, setAcc] = useState<Who>(ME);
  const [pay, setPay] = useState<Who>(ME);
  const [kind, setKind] = useState<Kind>('company');
  const [name, setName] = useState('');
  const [vkn, setVkn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (kind === 'company') {
      for (const [w, label] of [[acc, 'muhasebecinin'], [pay, 'ödeme yetkilisinin']] as const) {
        if (w.mode === 'other' && w.name.trim().length < 2) return setError(`Ödemeleri ve kayıtları doğru kişiye yönlendirmek için ${label} adını soyadını yazın.`);
        if (w.mode === 'other' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w.email.trim())) return setError(`${label.charAt(0).toLocaleUpperCase('tr-TR') + label.slice(1)} e-postasını yazın; giriş bu e-postayla yapılır.`);
      }
    }
    setBusy(true);
    try {
      const { data: created, error: e } =
        kind === 'company'
          ? await supabase.rpc('create_company', { p_legal_name: name, p_tax_number: vkn })
          : await supabase.rpc('create_bureau', { p_name: name, p_tax_number: vkn });
      if (e) throw e;
      let addedOthers = false;
      if (kind === 'company') {
        // Kurucu önce iki görevi de üstlenir; başkası seçildiyse o kişi eklenir, kurucu görevi bırakır
        const company = created as string;
        const others: { who: Who; roles: ('accountant' | 'payer')[] }[] = [];
        const same = acc.mode === 'other' && pay.mode === 'other' && acc.email.trim().toLowerCase() === pay.email.trim().toLowerCase();
        if (same) others.push({ who: acc, roles: ['accountant', 'payer'] });
        else {
          if (acc.mode === 'other') others.push({ who: acc, roles: ['accountant'] });
          if (pay.mode === 'other') others.push({ who: pay, roles: ['payer'] });
        }
        for (const o of others) {
          await addPerson({
            companyId: company,
            fullName: o.who.name.trim(),
            title: o.roles.includes('accountant') ? 'Muhasebe' : 'Finans',
            email: o.who.email.trim(),
            roles: ['employee', ...o.roles],
            managerId: userId,
          });
          for (const r of o.roles) await supabase.rpc('drop_my_role', { p_company: company, p_role: r });
          addedOthers = true;
        }
      }
      await reloadMemberships();
      // Eklenen kişilere giriş bağlantısı Ekip ekranından gönderilir
      if (addedOthers) router.replace('/team');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const option = (k: Kind, icon: IconName, title: string, text: string) => {
    const on = kind === k;
    return (
      <Pressable
        onPress={() => setKind(k)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        style={[styles.option, { backgroundColor: c.paper, borderColor: on ? c.pen : 'transparent' }]}>
        <View style={[styles.optionIcon, { backgroundColor: on ? c.pen : c.penSoft }]}>
          <Icon name={icon} size={20} color={on ? c.onPen : c.pen} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink }}>{title}</Text>
          <Text style={[type.small, { color: c.muted }]}>{text}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
      {platformAdmin && (
        <Button title="Gidero Yönetim Paneline git" onPress={() => router.push('/admin')} />
      )}
      {platformAdmin && (
        <Button variant="secondary" title="Test sürüşü" onPress={() => router.push('/test')} />
      )}
      <Text style={[type.body, { color: c.muted }]}>Gidero'yu nasıl kullanacaksınız? 14 gün ücretsiz deneyin, kart bilgisi gerekmez.</Text>

      <View style={{ gap: space.sm }}>
        {option('company', 'team', 'Şirketim için', 'Çalışanlarım masraf girsin, ben onaylayayım, muhasebemiz kaydetsin.')}
        {option('bureau', 'doc', 'Muhasebe bürosuyum', 'Müşteri firmalarımın fişlerini toplayıp muhasebeleştireyim.')}
      </View>

      <View style={{ backgroundColor: c.paper, borderRadius: radius.lg, padding: space.lg, gap: space.md }}>
        <Field
          label={kind === 'company' ? 'Şirket unvanı' : 'Büronun unvanı'}
          value={name}
          onChangeText={setName}
          placeholder={kind === 'company' ? 'Örnek Ticaret Ltd. Şti.' : 'Örnek Mali Müşavirlik'}
        />
        <Field
          label="Vergi numarası"
          value={vkn}
          onChangeText={setVkn}
          keyboardType="number-pad"
          maxLength={11}
          hint="Şahıs işletmesiyseniz 11 haneli TC kimlik numarası."
        />
      </View>
      {kind === 'company' && (
        <View style={{ backgroundColor: c.paper, borderRadius: radius.lg, padding: space.lg, gap: space.md }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink }}>Masrafları kim kontrol edip ödeyecek?</Text>
          <Text style={[type.small, { color: c.muted }]}>
            Onaylanan bir masrafın tamamlanması için muhasebecinin kontrol etmesi ve ödeme yetkilisinin ödemesi gerekir. İkisi de aynı kişi olabilir; sonra Ekip ekranından değiştirebilirsiniz.
          </Text>
          <WhoPick title="Muhasebeci" hint="Onaylanan raporları kontrol eder, muhasebe programına aktarır." who={acc} onChange={setAcc} />
          <WhoPick title="Ödeme yetkilisi" hint={'Masrafı çalışanın hesabına öder ve "Ödendi" der.'} who={pay} onChange={setPay} />
        </View>
      )}
      {error && <Notice tone="bad" text={error} />}
      <Button size="large" title={kind === 'company' ? 'Şirketi kur ve denemeye başla' : 'Büroyu kur ve denemeye başla'} onPress={create} loading={busy} />
      <Notice
        text={
          kind === 'company'
            ? 'Şirketi kuran kişi yönetici olur. Çalışanlarınızı sonra Ekip ekranından eklersiniz.'
            : 'Denemede 3 müşteri firma ekleyebilirsiniz. Sonra ihtiyacınıza göre 5, 10, 50 veya 150 firmalık paket seçersiniz.'
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  whoChip: { minHeight: 40, borderRadius: radius.pill, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  option: { borderRadius: radius.lg, borderWidth: 2, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  optionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

function WhoPick({ title, hint, who, onChange }: { title: string; hint: string; who: Who; onChange: (w: Who) => void }) {
  const c = useColors();
  const chip = (on: boolean) => [styles.whoChip, { backgroundColor: on ? c.pen : c.fill }];
  const chipText = (on: boolean) => ({ color: on ? c.onPen : c.ink, fontWeight: '600' as const });
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[type.body, { color: c.ink, fontWeight: '600' }]}>{title}</Text>
      <Text style={[type.small, { color: c.muted }]}>{hint}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Pressable accessibilityRole="radio" accessibilityState={{ selected: who.mode === 'me' }} onPress={() => onChange({ ...who, mode: 'me' })} style={chip(who.mode === 'me')}>
          <Text style={chipText(who.mode === 'me')}>Ben</Text>
        </Pressable>
        <Pressable accessibilityRole="radio" accessibilityState={{ selected: who.mode === 'other' }} onPress={() => onChange({ ...who, mode: 'other' })} style={chip(who.mode === 'other')}>
          <Text style={chipText(who.mode === 'other')}>Başka biri</Text>
        </Pressable>
      </View>
      {who.mode === 'other' && (
        <>
          <Field label="Ad soyad" value={who.name} onChangeText={(v) => onChange({ ...who, name: v })} placeholder="Örnek: Selin Er" />
          <Field label="E-posta" value={who.email} onChangeText={(v) => onChange({ ...who, email: v })} autoCapitalize="none" keyboardType="email-address" hint="Kişiyi siz açarsınız; giriş bağlantısını Ekip ekranından gönderirsiniz." />
        </>
      )}
    </View>
  );
}
