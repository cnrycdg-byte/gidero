import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Button, Field, Notice } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Kind = 'company' | 'bureau';

export default function Onboarding() {
  const c = useColors();
  const { reloadMemberships, platformAdmin } = useSession();
  const [kind, setKind] = useState<Kind>('company');
  const [name, setName] = useState('');
  const [vkn, setVkn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const { error: e } =
        kind === 'company'
          ? await supabase.rpc('create_company', { p_legal_name: name, p_tax_number: vkn })
          : await supabase.rpc('create_bureau', { p_name: name, p_tax_number: vkn });
      if (e) throw e;
      await reloadMemberships();
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
      {error && <Notice tone="bad" text={error} />}
      <Button size="large" title={kind === 'company' ? 'Şirketi kur ve denemeye başla' : 'Büroyu kur ve denemeye başla'} onPress={create} loading={busy} />
      <Notice
        text={
          kind === 'company'
            ? 'Şirketi kuran kişi yönetici ve muhasebeci olur. Çalışanlarınızı sonra Ekip ekranından eklersiniz.'
            : 'Denemede 3 müşteri firma ekleyebilirsiniz. Sonra ihtiyacınıza göre 5, 10, 50 veya 150 firmalık paket seçersiniz.'
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  option: { borderRadius: radius.lg, borderWidth: 2, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  optionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
