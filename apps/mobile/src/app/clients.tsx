import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Button, Empty, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { accountStatus, type AccountStatus } from '@/lib/billing';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

// Muhasebe bürosu: müşteri firmalar (paket hakkı kadar firma eklenir)
export default function Clients() {
  const c = useColors();
  const { bureaus, memberships, active, setActiveCompany, reloadMemberships } = useSession();
  const bureau = bureaus.find((b) => b.role === 'owner') ?? bureaus[0];
  const firms = memberships.filter((m) => m.bureau_account_id === bureau?.account_id);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [name, setName] = useState('');
  const [vkn, setVkn] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bureau) return;
    setStatus(await accountStatus(bureau.account_id).catch(() => null));
  }, [bureau]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function add() {
    if (!bureau) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('bureau_add_company', {
      p_account: bureau.account_id,
      p_legal_name: name,
      p_tax_number: vkn,
    });
    setBusy(false);
    if (e) return setError(errorText(e));
    setName('');
    setVkn('');
    setAdding(false);
    await reloadMemberships();
    if (data) setActiveCompany(data as string);
    load();
  }

  if (!bureau) {
    return (
      <View style={{ padding: space.xl }}>
        <Notice text="Bu ekran muhasebe büroları içindir." />
      </View>
    );
  }

  const full = status?.max_companies != null && firms.length >= status.max_companies;
  const isOwner = bureau.role === 'owner';

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: c.deep, borderRadius: radius.lg, padding: space.xl, gap: 4 }}>
        <Text style={[type.small, { color: c.onDeepMuted, fontWeight: '600' }]}>{bureau.name}</Text>
        <Text style={[type.display, { color: c.onDeep, fontSize: 36 }]}>
          {firms.length}
          <Text style={{ color: c.onDeepMuted, fontSize: 22 }}> / {status?.max_companies ?? '—'} firma</Text>
        </Text>
        <Text style={[type.small, { color: c.onDeepMuted }]}>
          {status ? `${status.plan_name ?? 'Ücretsiz deneme'}${status.active ? '' : ', süresi doldu'}` : ''}
        </Text>
      </View>

      {full && isOwner && (
        <Notice tone="warn" text="Paketinizdeki firma hakkının hepsi kullanılıyor. Yeni firma için paketinizi büyütün." />
      )}

      {isOwner && (
        <View style={{ gap: space.sm }}>
          {!adding ? (
            <Button icon="plus" title="Müşteri firma ekle" onPress={() => (full ? router.push('/subscription') : setAdding(true))} />
          ) : (
            <View style={{ backgroundColor: c.paper, borderRadius: radius.lg, padding: space.lg, gap: space.md }}>
              <Field label="Firma unvanı" value={name} onChangeText={setName} placeholder="Örnek Gıda Ltd. Şti." autoFocus />
              <Field label="Vergi numarası" value={vkn} onChangeText={setVkn} keyboardType="number-pad" maxLength={11} />
              {error && <Notice tone="bad" text={error} />}
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button variant="secondary" title="Vazgeç" onPress={() => setAdding(false)} style={{ flex: 1, backgroundColor: c.canvas }} />
                <Button title="Ekle" onPress={add} loading={busy} style={{ flex: 1 }} />
              </View>
            </View>
          )}
          <Button variant="plain" title="Paketi ve ödemeyi yönet" onPress={() => router.push('/subscription')} />
        </View>
      )}

      <SectionTitle title="Müşteri firmalar" />
      {firms.length === 0 ? (
        <Empty
          icon="doc"
          title="Henüz müşteri firma yok"
          text="Firma ekleyin; sonra firmanın fişlerini siz girebilir ya da firmadaki bir kişiyi Ekip ekranından ekleyip fişleri ona girdirebilirsiniz."
        />
      ) : (
        <Group>
          {firms.map((f) => (
            <Row
              key={f.company_id}
              icon="doc"
              title={f.companies.legal_name}
              subtitle={`Vergi no ${f.companies.tax_number}`}
              right={f.company_id === active?.company_id ? <Icon name="check" size={16} color={c.pen} /> : undefined}
              onPress={() => {
                setActiveCompany(f.company_id);
                router.dismissTo('/');
              }}
            />
          ))}
        </Group>
      )}
    </ScrollView>
  );
}
