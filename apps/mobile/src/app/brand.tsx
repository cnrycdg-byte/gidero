import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Notice, SectionTitle } from '@/components/ui';
import { fonts, paletteFor, radius, space, type, useColors, useScheme, type Palette } from '@/constants/theme';
import { colorFromLogo, logoUrl, pickLogo, uploadLogo } from '@/lib/brand';
import { BRAND_PRESETS, normalizeHex } from '@/lib/brand/colors';
import { useWide } from '@/lib/layout';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type BrandRow = {
  company_id: string;
  legal_name: string;
  brand_primary: string | null;
  brand_accent: string | null;
  logo_path: string | null;
  can_edit: boolean;
};

/** Şirketin logosu ve kurumsal renkleri. Şirket yöneticisi ve Gidero yöneticisi değiştirir. */
export default function BrandScreen() {
  const params = useLocalSearchParams<{ company?: string }>();
  const { active, reloadMemberships } = useSession();
  const companyId = params.company || active?.company_id || '';
  const c = useColors();
  const scheme = useScheme();
  const wide = useWide();

  const [row, setRow] = useState<BrandRow | null>(null);
  const [primary, setPrimary] = useState('');
  const [accent, setAccent] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [localLogo, setLocalLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const suggested = useSuggested();

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data, error: e } = await supabase.rpc('company_brand', { p_company: companyId });
    if (e) return setError(errorText(e));
    const r = data as BrandRow;
    setRow(r);
    setPrimary(r.brand_primary ?? '');
    setAccent(r.brand_accent ?? '');
    setLogo(r.logo_path);
    setLocalLogo(null);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const p = normalizeHex(primary);
  const a = normalizeHex(accent);
  const preview = paletteFor(scheme, { primary: p, accent: a });
  const shownLogo = localLogo ?? logoUrl(logo);
  const editable = !!row?.can_edit;
  const dirty = !!row && (p !== (row.brand_primary ?? null) || a !== (row.brand_accent ?? null) || logo !== row.logo_path);

  async function chooseLogo() {
    if (!row) return;
    setError(null);
    setInfo(null);
    try {
      const uri = await pickLogo();
      if (!uri) return;
      setBusy(true);
      const path = await uploadLogo(row.company_id, uri);
      setLogo(path);
      setLocalLogo(uri);
      // Logodaki baskın renk, ana renk boşsa öneri olarak gelir
      const found = await colorFromLogo(uri);
      if (found && !p) setPrimary(found);
      else if (found) setInfo(`Logodaki baskın renk ${found}. Kullanmak için "Logodan al" düğmesine basın.`);
      suggested.current = found;
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!row) return;
    if (primary && !p) return setError('Ana rengi #1A2B3C biçiminde yazın.');
    if (accent && !a) return setError('Vurgu rengini #1A2B3C biçiminde yazın.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('set_company_brand', {
      p_company: row.company_id,
      p_primary: p,
      p_accent: a,
      p_logo_path: logo,
    });
    setBusy(false);
    if (e) return setError(errorText(e));
    setInfo('Kaydedildi. Bu şirkete giren herkes uygulamayı bu renklerle görür.');
    await reloadMemberships();
    await load();
  }

  function reset() {
    setPrimary('');
    setAccent('');
    setLogo(null);
    setLocalLogo(null);
  }

  const editor = (
    <View style={{ gap: space.lg, flex: wide ? 1 : undefined }}>
      <SectionTitle title="Logo" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
        <View style={[styles.logoBox, { backgroundColor: c.paper, borderColor: c.paperLine }]}>
          {shownLogo ? (
            <Image source={{ uri: shownLogo }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          ) : (
            <Text style={[type.small, { color: c.faint, textAlign: 'center' }]}>Logo yok</Text>
          )}
        </View>
        {editable && (
          <View style={{ gap: space.sm }}>
            <Button title={shownLogo ? 'Logoyu değiştir' : 'Logo yükle'} icon="gallery" onPress={chooseLogo} loading={busy} />
            {shownLogo ? (
              <Button
                title="Logoyu kaldır"
                variant="plain"
                onPress={() => {
                  setLogo(null);
                  setLocalLogo(null);
                }}
              />
            ) : null}
          </View>
        )}
      </View>
      <Text style={[type.small, { color: c.muted }]}>PNG, JPG ya da WEBP; en fazla 1 MB. Saydam zeminli PNG en iyi görünür.</Text>

      <SectionTitle title="Kurumsal renkler" />
      <View style={styles.presets}>
        {BRAND_PRESETS.map((pr) => {
          const on = p === pr.primary && a === pr.accent;
          return (
            <Pressable
              key={pr.name}
              disabled={!editable}
              accessibilityRole="button"
              accessibilityLabel={pr.name}
              onPress={() => {
                setPrimary(pr.primary);
                setAccent(pr.accent);
              }}
              style={[styles.preset, { borderColor: on ? c.ink : c.paperLine, backgroundColor: c.paper }]}>
              <View style={[styles.pot, { backgroundColor: pr.primary }]}>
                <View style={[styles.potDot, { backgroundColor: pr.accent, borderColor: c.paper }]} />
              </View>
              <Text style={[type.small, { color: c.ink }]} numberOfLines={1}>
                {pr.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.md }}>
        <ColorField label="Ana renk" hint="Butonlar, seçili menü, başlık alanı" value={primary} onChange={setPrimary} editable={editable} />
        <ColorField label="Vurgu rengi" hint="Onay damgası ve küçük vurgular" value={accent} onChange={setAccent} editable={editable} />
      </View>
      {editable && suggested.current && suggested.current !== p ? (
        <Button title={`Logodan al (${suggested.current})`} variant="secondary" onPress={() => setPrimary(suggested.current!)} />
      ) : null}
      <Text style={[type.small, { color: c.muted }]}>
        Çok açık renkler, yazılar okunur kalsın diye otomatik koyulaştırılır. Uyarı ve hata renkleri değişmez.
      </Text>

      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}
      {editable ? (
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Button title="Kaydet" onPress={save} loading={busy} disabled={!dirty} />
          <Button title="Gidero renklerine dön" variant="secondary" onPress={reset} disabled={busy} />
        </View>
      ) : row ? (
        <Notice text="Logo ve renkleri şirketin yöneticisi değiştirebilir." />
      ) : null}
    </View>
  );

  return (
    <Page wide>
      <Stack.Screen options={{ title: 'Logo ve renkler', headerLargeTitle: false }} />
      {row && (
        <Text style={[type.title, { color: c.ink }]} numberOfLines={2}>
          {row.legal_name}
        </Text>
      )}
      {!row && error && <Notice tone="bad" text={error} />}
      {row && (
        <View style={{ flexDirection: wide ? 'row' : 'column-reverse', gap: space.xxl, alignItems: 'flex-start' }}>
          {editor}
          <View style={{ width: wide ? 340 : '100%', gap: space.sm }}>
            <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Çalışanlarınız böyle görecek</Text>
            <Preview c={preview} name={row.legal_name} logo={shownLogo} />
          </View>
        </View>
      )}
    </Page>
  );
}

/** Logodan bulunan renk önerisi (yeniden çizimde kaybolmasın diye ref) */
function useSuggested() {
  const [ref] = useState<{ current: string | null }>({ current: null });
  return ref;
}

function ColorField({ label, hint, value, onChange, editable }: { label: string; hint: string; value: string; onChange: (v: string) => void; editable: boolean }) {
  const c = useColors();
  const hex = normalizeHex(value);
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field
            label={label}
            hint={hint}
            value={value}
            onChangeText={onChange}
            placeholder="#0B6E5F"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            editable={editable}
          />
        </View>
        {Platform.OS === 'web' && editable ? (
          // Tarayıcının renk seçicisi: sürükleyerek renk seçilir
          <View style={[styles.swatch, { borderColor: c.paperLine, backgroundColor: hex ?? c.canvas, overflow: 'hidden' }]}>
            <input
              type="color"
              aria-label={`${label} seç`}
              value={(hex ?? '#0B6E5F').toLowerCase()}
              onChange={(e: { target: { value: string } }) => onChange(e.target.value.toUpperCase())}
              style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 0, padding: 0 }}
            />
          </View>
        ) : (
          <View style={[styles.swatch, { borderColor: c.paperLine, backgroundColor: hex ?? c.canvas }]} />
        )}
      </View>
    </View>
  );
}

/** Uygulamanın küçük bir kopyası: menü şeridi, rapor fişi, onay damgası ve buton, seçilen renklerle */
function Preview({ c, name, logo }: { c: Palette; name: string; logo: string | null }) {
  return (
    <View style={[styles.preview, { backgroundColor: c.canvas, borderColor: c.paperLine }]}>
      <View style={[styles.rail, { backgroundColor: c.deep }]}>
        <View style={[styles.railLogo, { backgroundColor: '#FFFFFF' }]}>
          {logo ? (
            <Image source={{ uri: logo }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          ) : (
            <Text style={{ fontFamily: fonts.displayHeavy, color: c.deep, fontSize: 14 }}>{name.slice(0, 1)}</Text>
          )}
        </View>
        <View style={[styles.railItem, { backgroundColor: '#FFFFFF' }]}>
          <Icon name="receipt" size={11} color={c.deep} />
        </View>
        <View style={styles.railItem}>
          <Icon name="inbox" size={11} color={c.onDeepMuted} />
        </View>
        <View style={styles.railItem}>
          <Icon name="team" size={11} color={c.onDeepMuted} />
        </View>
      </View>
      <View style={{ flex: 1, padding: space.md, gap: space.sm }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 13, color: c.ink }} numberOfLines={1}>
          {name}
        </Text>
        <View style={[styles.slip, { backgroundColor: c.paper }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: c.ink, fontWeight: '600' }}>Ekim masrafları</Text>
            <View style={[styles.stamp, { borderColor: c.gold }]}>
              <Text style={{ fontSize: 9, color: c.ink, fontWeight: '700' }}>Onaylandı</Text>
            </View>
          </View>
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 22, color: c.ink }}>₺4.820,50</Text>
          <View style={[styles.tag, { backgroundColor: c.penSoft }]}>
            <Text style={{ fontSize: 10, color: c.pen, fontWeight: '700' }}>6 fiş</Text>
          </View>
        </View>
        <View style={[styles.btn, { backgroundColor: c.pen }]}>
          <Text style={{ color: c.onPen, fontWeight: '700', fontSize: 12 }}>Fiş çek</Text>
        </View>
        <Text style={{ fontSize: 11, color: c.pen, fontWeight: '600' }}>Tüm raporları gör</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logoBox: { width: 112, height: 112, borderRadius: radius.lg, borderWidth: 1, padding: space.sm, alignItems: 'center', justifyContent: 'center' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  preset: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1.5, borderRadius: radius.pill, paddingVertical: 6, paddingLeft: 6, paddingRight: 12 },
  pot: { width: 26, height: 26, borderRadius: 13 },
  potDot: { position: 'absolute', right: -3, bottom: -3, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  swatch: { width: 46, height: 46, borderRadius: radius.md, borderWidth: 1 },
  preview: { flexDirection: 'row', borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden', minHeight: 260 },
  rail: { width: 52, alignItems: 'center', paddingVertical: space.md, gap: space.sm },
  railLogo: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', padding: 3, marginBottom: space.sm, overflow: 'hidden' },
  railItem: { width: 30, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  slip: { borderRadius: radius.md, padding: space.md, gap: 4 },
  stamp: { borderWidth: 1.5, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, transform: [{ rotate: '-4deg' }] },
  tag: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  btn: { borderRadius: radius.pill, paddingVertical: 9, alignItems: 'center' },
});
