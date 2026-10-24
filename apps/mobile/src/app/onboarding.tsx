import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Body, Button, Field, Notice } from '@/components/ui';
import { space } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

export default function Onboarding() {
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
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <Body muted>
        Masrafları hangi şirket adına toplayacağınızı yazın. Vergi numarası, faturaların şirket adına kesilip
        kesilmediğini kontrol etmek için kullanılır.
      </Body>
      <Field label="Şirket unvanı" value={name} onChangeText={setName} placeholder="Örnek Ticaret Ltd. Şti." />
      <Field
        label="Vergi numarası"
        value={vkn}
        onChangeText={setVkn}
        keyboardType="number-pad"
        maxLength={11}
        hint="Şahıs şirketiyseniz 11 haneli TC kimlik numarası."
      />
      {error && <Notice tone="bad" text={error} />}
      <View style={{ marginTop: space.sm }}>
        <Button title="Şirketi kur" onPress={create} loading={busy} />
      </View>
      <Notice text="Şirketi kuran kişi yönetici ve muhasebeci olur. Çalışanlarınızı sonra Ekip ekranından eklersiniz." />
    </ScrollView>
  );
}
