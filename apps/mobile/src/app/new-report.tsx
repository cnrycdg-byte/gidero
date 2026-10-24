import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { Button, Field, Notice } from '@/components/ui';
import { space } from '@/constants/theme';
import { currentPeriod } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

export default function NewReport() {
  const { userId, active } = useSession();
  const def = currentPeriod();
  const [title, setTitle] = useState(def.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!userId || !active) return;
    if (title.trim().length < 2) return setError('Rapora bir başlık verin.');
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('reports')
      .insert({
        company_id: active.company_id,
        owner_user_id: userId,
        created_by: userId,
        title: title.trim(),
        period: def.period,
      })
      .select('id')
      .single();
    setBusy(false);
    if (e) return setError(errorText(e));
    router.dismiss();
    router.push({ pathname: '/report/[id]', params: { id: data.id } });
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <Field
        label="Rapor başlığı"
        value={title}
        onChangeText={setTitle}
        autoFocus
        hint="Bir dönemin ya da bir işin masraflarını tek başlık altında toplayın."
      />
      {error && <Notice tone="bad" text={error} />}
      <Button title="Raporu aç" onPress={create} loading={busy} />
    </ScrollView>
  );
}
