import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/text';
import { radius, type, useColors } from '@/constants/theme';
import { Button, Field, Notice } from '@/components/ui';
import { space } from '@/constants/theme';
import { currentPeriod, dateText } from '@/lib/format';
import { useQueue } from '@/lib/queue';
import { pickFromLibrary } from '@/lib/receipts';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

export default function NewReport() {
  const c = useColors();
  const { userId, active, hasRole } = useSession();
  const { then } = useLocalSearchParams<{ then?: 'camera' | 'gallery' }>();
  const { enqueue } = useQueue();
  const def = currentPeriod();
  const [title, setTitle] = useState('');
  // Raporu kim onaylayacak: çalışan rapor açarken görür
  const [approvers, setApprovers] = useState<string[] | null>(null);
  useEffect(() => {
    if (!active) return;
    supabase.rpc('my_approvers', { p_company: active.company_id }).then(({ data }) => {
      setApprovers(((data ?? []) as { name?: string }[]).map((x) => x.name ?? 'Onaylayıcı'));
    });
  }, [active]);
  // Muhasebeci başkası adına rapor açabilir; o rapor onaysız kayda alınır
  const accountant = hasRole('accountant');
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    if (!accountant || !active) return;
    (async () => {
      const { data: ms } = await supabase.from('memberships').select('user_id').eq('company_id', active.company_id).eq('status', 'active');
      const ids = (ms ?? []).map((m: { user_id: string }) => m.user_id);
      const { data: ps } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
      const list = ((ps ?? []) as { id: string; full_name: string }[]).map((p) => ({ id: p.id, name: p.id === userId ? 'Kendim' : p.full_name || 'İsimsiz' }));
      setPeople(list);
      setOwner((cur) => cur ?? (ids.includes(userId ?? '') ? userId : list[0]?.id ?? null));
    })();
  }, [accountant, active, userId]);
  const forOther = !!owner && owner !== userId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!userId || !active) return;
    if (title.trim().length < 2) return setError('Rapora bir başlık verin.');
    if (accountant && !owner) return setError('Önce firmaya bir çalışan ekleyin (Ekibi yönet), sonra onun adına rapor açın.');
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('reports')
      .insert({ company_id: active.company_id, owner_user_id: owner ?? userId, created_by: userId, title: title.trim(), period: def.period })
      .select('id')
      .single();
    setBusy(false);
    if (e) return setError(errorText(e));
    router.dismiss();
    if (then === 'camera') {
      router.push({ pathname: '/camera', params: { reportId: data.id, companyId: active.company_id } });
      return;
    }
    router.push({ pathname: '/report/[id]', params: { id: data.id } });
    if (then === 'gallery') {
      const uris = await pickFromLibrary();
      uris.forEach((uri) => enqueue({ reportId: data.id, companyId: active.company_id, userId, uri }));
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <Field
        label="Rapor başlığı"
        value={title}
        onChangeText={setTitle}
        autoFocus
        placeholder="Örnek: İstanbul fuarı"
        hint="Fişler bu raporun içine eklenir. Bir ay için tek rapor ya da her iş ve seyahat için ayrı rapor açabilirsiniz."
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {[def.title, 'Seyahat masrafları', 'Müşteri ziyareti'].map((t) => (
          <Pressable key={t} onPress={() => setTitle(t)} style={{ borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: title === t ? c.pen : c.paper }}>
            <Text style={{ color: title === t ? c.onPen : c.ink }}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ gap: 4, padding: space.md, borderRadius: radius.md, backgroundColor: c.paper }}>
        <Text style={[type.small, { color: c.muted }]}>{`Oluşturma tarihi: ${dateText(new Date().toISOString())}`}</Text>
        {!forOther && approvers !== null ? (
          approvers.length ? (
            <Text style={[type.body, { color: c.ink }]}>{`Onaylayacak: ${approvers.join(' → ')}`}</Text>
          ) : (
            <Text style={[type.body, { color: c.red }]}>
              Raporunuzu onaylayacak kimse tanımlı değil. Fiş ekleyebilirsiniz; göndermeden önce yöneticinizden onay zincirinde sizi birinin altına bağlamasını isteyin.
            </Text>
          )
        ) : null}
      </View>
      {accountant && (
        <View style={{ gap: space.sm }}>
          <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Kimin masrafı?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {people.map((p) => {
              const on = owner === p.id;
              return (
                <Pressable key={p.id} onPress={() => setOwner(p.id)} style={{ borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: on ? c.pen : c.paper }}>
                  <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
          {people.length === 0 && <Notice tone="warn" text="Firmada henüz çalışan yok. Önce Ekibi yönet ekranından bir çalışan ekleyin." />}
          {forOther && <Notice text="Bu kişinin adına açtığınız rapor onaya gitmez; fişleri ekleyip 'Kayda al' dediğinizde doğrudan muhasebeye düşer." />}
        </View>
      )}
      {error && <Notice tone="bad" text={error} />}
      <Button
        size="large"
        icon={then === 'camera' ? 'camera' : undefined}
        title={then === 'camera' ? 'Raporu aç ve fiş çek' : then === 'gallery' ? 'Raporu aç ve fiş seç' : 'Raporu aç'}
        onPress={create}
        loading={busy}
      />
    </ScrollView>
  );
}
