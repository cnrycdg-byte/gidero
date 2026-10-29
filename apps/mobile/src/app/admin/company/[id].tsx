import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { CompanyLogo } from '@/components/company-logo';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { errorText, supabase } from '@/lib/supabase';

type Co = {
  id: string;
  account_id: string;
  bureau_account_id: string | null;
  legal_name: string;
  tax_number: string;
  tax_office: string | null;
  accounting_software: string | null;
  alcohol_policy: 'reject' | 'kkeg' | 'expense' | 'manual';
  okc_vat_policy: 'cautious' | 'flexible';
  car_kkeg_vat_deductible: boolean;
  self_service: boolean;
  brand_primary: string | null;
  brand_accent: string | null;
  logo_path: string | null;
  people: number;
  payers: number;
  accountants: number;
  reports: number;
  categories: number;
};

const SOFTWARE: [string, string][] = [
  ['logo', 'Logo'],
  ['luca', 'Luca'],
  ['mikro', 'Mikro'],
  ['netsis', 'Netsis'],
  ['zirve', 'Zirve'],
  ['eta', 'ETA'],
  ['parasut', 'Paraşüt'],
  ['other', 'Diğer'],
];

const ALCOHOL: [Co['alcohol_policy'], string][] = [
  ['kkeg', 'Ödenir, KKEG yazılır'],
  ['reject', 'Ödenmez'],
  ['expense', 'Ödenir, normal gider'],
  ['manual', 'Muhasebe her fişte karar verir'],
];

/** Gidero yöneticisi için bir firmanın bütün ayarları tek sayfada */
export default function AdminCompany() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const [co, setCo] = useState<Co | null>(null);
  const [draft, setDraft] = useState<Partial<Co>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_company', { p_company: id });
    if (e) return setError(errorText(e));
    setCo(data as Co);
    setDraft({});
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!co) return <Page>{error ? <Notice tone="bad" text={error} /> : null}</Page>;
  const v = { ...co, ...draft } as Co;
  const set = (p: Partial<Co>) => {
    setInfo(null);
    setDraft((d) => ({ ...d, ...p }));
  };
  const dirty = Object.keys(draft).length > 0;

  async function save() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_set_company', { p_company: id, p_settings: draft });
    setBusy(false);
    if (e) return setError(errorText(e));
    setInfo('Firma ayarları kaydedildi.');
    load();
  }

  const chip = (on: boolean) => [styles.chip, { backgroundColor: on ? c.pen : c.paper }];
  const chipText = (on: boolean) => ({ color: on ? c.onPen : c.ink, fontWeight: (on ? '600' : '400') as '600' | '400' });

  return (
    <Page wide>
      <Stack.Screen options={{ title: 'Firma ayarları' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <CompanyLogo path={co.logo_path} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={[type.title, { color: c.ink }]} numberOfLines={2}>
            {co.legal_name}
          </Text>
          <Text style={[type.small, { color: c.muted }]}>
            {`VKN ${co.tax_number}${co.bureau_account_id ? ', büroya bağlı firma' : ''}`}
          </Text>
        </View>
        <Button variant="plain" title="Müşteri sayfası" onPress={() => router.push({ pathname: '/admin/account/[id]', params: { id: co.bureau_account_id ?? co.account_id } })} />
      </View>

      <View style={styles.stats}>
        {(
          [
            [co.people, 'kişi'],
            [co.accountants, 'muhasebeci'],
            [co.payers, 'ödeme yetkilisi'],
            [co.reports, 'rapor'],
            [co.categories, 'gider grubu'],
          ] as const
        ).map(([n, label]) => (
          <View key={label} style={[styles.stat, { backgroundColor: c.paper }]}>
            <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 22, color: c.ink }}>{n}</Text>
            <Text style={[type.small, { color: c.muted }]}>{label}</Text>
          </View>
        ))}
      </View>

      <SectionTitle title="Logo ve kurumsal renkler" />
      <Group>
        <Row
          icon="settings"
          title={co.logo_path || co.brand_primary ? 'Logo ve renkleri değiştir' : 'Logo ve renk ekle'}
          subtitle={co.brand_primary ? `Ana renk ${co.brand_primary}${co.brand_accent ? `, vurgu ${co.brand_accent}` : ''}` : 'Gidero renkleri kullanılıyor'}
          right={
            co.brand_primary ? (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={[styles.sw, { backgroundColor: co.brand_primary }]} />
                {co.brand_accent ? <View style={[styles.sw, { backgroundColor: co.brand_accent }]} /> : null}
              </View>
            ) : undefined
          }
          onPress={() => router.push({ pathname: '/brand', params: { company: co.id } })}
        />
      </Group>

      <SectionTitle title="Firma bilgileri" />
      <View style={[styles.box, { backgroundColor: c.paper }]}>
        <Field label="Unvan" value={v.legal_name} onChangeText={(t) => set({ legal_name: t })} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Vergi no" value={v.tax_number} onChangeText={(t) => set({ tax_number: t.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={11} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Vergi dairesi" value={v.tax_office ?? ''} onChangeText={(t) => set({ tax_office: t })} />
          </View>
        </View>
        <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Muhasebe programı</Text>
        <View style={styles.chips}>
          {SOFTWARE.map(([k, label]) => (
            <Pressable key={k} onPress={() => set({ accounting_software: v.accounting_software === k ? null : k })} style={chip(v.accounting_software === k)}>
              <Text style={chipText(v.accounting_software === k)}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <SectionTitle title="Vergi ve masraf kuralları" />
      <View style={[styles.box, { backgroundColor: c.paper }]}>
        <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Alkollü içki</Text>
        <View style={styles.chips}>
          {ALCOHOL.map(([k, label]) => (
            <Pressable key={k} onPress={() => set({ alcohol_policy: k })} style={chip(v.alcohol_policy === k)}>
              <Text style={chipText(v.alcohol_policy === k)}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Yemek ve konaklamada yazar kasa fişi</Text>
        <View style={styles.chips}>
          <Pressable onPress={() => set({ okc_vat_policy: 'flexible' })} style={chip(v.okc_vat_policy === 'flexible')}>
            <Text style={chipText(v.okc_vat_policy === 'flexible')}>Kabul edilir</Text>
          </Pressable>
          <Pressable onPress={() => set({ okc_vat_policy: 'cautious' })} style={chip(v.okc_vat_policy === 'cautious')}>
            <Text style={chipText(v.okc_vat_policy === 'cautious')}>KDV indirilmez, uyar</Text>
          </Pressable>
        </View>
        <Toggle
          label="Binek araçta kabul edilmeyen payın KDV'si indirilsin"
          hint="Mali müşavirin görüşüne göre açın; kapalıysa %30'un KDV'si de gider yazılır."
          value={v.car_kkeg_vat_deductible}
          onChange={(b) => set({ car_kkeg_vat_deductible: b })}
        />
        {co.bureau_account_id ? (
          <Toggle
            label="Firmanın kendi girişi (ücretli ek)"
            hint="Açılırsa firmanın çalışanları da giriş yapıp masraf girebilir; kapalıyken fişleri büro girer."
            value={v.self_service}
            onChange={(b) => set({ self_service: b })}
          />
        ) : null}
      </View>

      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}
      <Button title="Kaydet" onPress={save} loading={busy} disabled={!dirty} />
      <Text style={[type.small, { color: c.faint }]}>
        Ekip, onay zinciri ve gider grupları firmanın kendi ekranlarından yönetilir; test müşterisinde "Test sürüşü" ile firmanın yöneticisine geçip düzenleyebilirsiniz.
      </Text>
    </Page>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (b: boolean) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: c.ink }]}>{label}</Text>
        <Text style={[type.small, { color: c.muted }]}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: { borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 96 },
  sw: { width: 18, height: 18, borderRadius: 9 },
});
