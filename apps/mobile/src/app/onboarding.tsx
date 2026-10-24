import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Field, Notice } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

export default function Onboarding() {
  const c = useColors();
  const { reloadMemberships } = useSession();
  const [name, setName] = useState('');
  const [vkn, setVkn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const { error: e } = await supabase.rpc('create_company', { p_legal_name: name, p_tax_number: vkn });
      if (e) throw e;
      await reloadMemberships();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <Text style={[type.body, { color: c.muted }]}>
        Masrafları hangi şirket adına toplayacağınızı yazın. Vergi numarası, faturaların şirketiniz adına kesilip
        kesilmediğini kontrol etmek için kullanılır.
      </Text>
      <View style={{ backgroundColor: c.paper, borderRadius: 14, padding: space.lg, gap: space.md }}>
        <Field label="Şirket unvanı" value={name} onChangeText={setName} placeholder="Örnek Ticaret Ltd. Şti." />
        <Field
          label="Vergi numarası"
          value={vkn}
          onChangeText={setVkn}
          keyboardType="number-pad"
          maxLength={11}
          hint="Şahıs şirketiyseniz 11 haneli TC kimlik numarası."
        />
      </View>
      {error && <Notice tone="bad" text={error} />}
      <Button size="large" title="Şirketi kur" onPress={create} loading={busy} />
      <Notice text="Şirketi kuran kişi yönetici ve muhasebeci olur. Çalışanlarınızı sonra Ekip ekranından eklersiniz." />
    </ScrollView>
  );
}
