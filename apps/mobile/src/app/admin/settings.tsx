// Gidero yöneticisinin kişisel ayarları: görünüm (telefonun ayarı, açık, koyu) ve ana renk.
// Seçim profilde saklanır, telefonda ve bilgisayarda aynı görünür. Müşteri şirketlerinin rengini etkilemez.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Notice, SectionTitle } from '@/components/ui';
import { hit, paletteFor, radius, space, type, useColors, useScheme, type ThemePref } from '@/constants/theme';
import { BRAND_PRESETS } from '@/lib/brand/colors';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';

const THEMES: { key: ThemePref; label: string; hint: string }[] = [
  { key: 'system', label: 'Telefonun ayarı', hint: 'Telefon ya da bilgisayar koyu moddaysa koyu görünür' },
  { key: 'light', label: 'Açık', hint: 'Her zaman açık zemin' },
  { key: 'dark', label: 'Koyu', hint: 'Her zaman koyu zemin' },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

export default function AdminSettings() {
  const c = useColors();
  const scheme = useScheme();
  const { uiPrefs, saveUiPrefs } = useSession();
  const [theme, setTheme] = useState<ThemePref>(uiPrefs.theme);
  const [accent, setAccent] = useState<string | null>(uiPrefs.accent);
  const [custom, setCustom] = useState(uiPrefs.accent ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const previewScheme = theme === 'system' ? scheme : theme;
  const p = paletteFor(previewScheme, { primary: accent, accent: null });
  const changed = theme !== uiPrefs.theme || (accent ?? null) !== (uiPrefs.accent ?? null);

  async function save() {
    setError(null);
    setInfo(null);
    if (accent && !HEX.test(accent)) return setError('Rengi #1E3A8A biçiminde yazın.');
    setBusy(true);
    try {
      await saveUiPrefs({ theme, accent: accent ? accent.toUpperCase() : null });
      setInfo('Ayarlarınız kaydedildi. Bütün cihazlarınızda bu görünüm kullanılır.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Text style={[type.title, { color: c.ink }]}>Ayarlar</Text>
      <Text style={[type.body, { color: c.muted }]}>Yönetim panelinin görünümünü kendinize göre seçin. Müşteri şirketleri kendi renklerini kullanmaya devam eder.</Text>

      <SectionTitle title="Görünüm" />
      <View style={{ gap: space.sm }}>
        {THEMES.map((t) => {
          const on = theme === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTheme(t.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.option, { backgroundColor: c.paper, borderColor: on ? c.pen : 'transparent', opacity: pressed ? 0.8 : 1 }]}>
              <View style={[styles.radio, { borderColor: on ? c.pen : c.faint }]}>{on ? <View style={[styles.dot, { backgroundColor: c.pen }]} /> : null}</View>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.ink }]}>{t.label}</Text>
                <Text style={[type.small, { color: c.muted }]}>{t.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle title="Ana renk" />
      <Text style={[type.small, { color: c.muted }]}>Sol menü, düğmeler ve seçili öğeler bu renkle gösterilir. Yazılar okunaklı kalsın diye renk gerekiyorsa biraz koyulaştırılır.</Text>
      <View style={styles.swatches}>
        <Pressable
          onPress={() => {
            setAccent(null);
            setCustom('');
          }}
          accessibilityRole="radio"
          accessibilityState={{ selected: !accent }}
          accessibilityLabel="Gidero yeşili (varsayılan)"
          style={[styles.swatch, { backgroundColor: '#0B6E5F', borderColor: !accent ? c.ink : 'transparent' }]}>
          {!accent ? <Icon name="check" size={16} color="#FFFFFF" /> : null}
        </Pressable>
        {BRAND_PRESETS.filter((b) => b.primary !== '#0B6E5F').map((b) => {
          const on = accent?.toUpperCase() === b.primary.toUpperCase();
          return (
            <Pressable
              key={b.primary}
              onPress={() => {
                setAccent(b.primary);
                setCustom(b.primary);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={b.name}
              style={[styles.swatch, { backgroundColor: b.primary, borderColor: on ? c.ink : 'transparent' }]}>
              {on ? <Icon name="check" size={16} color="#FFFFFF" /> : null}
            </Pressable>
          );
        })}
      </View>
      <Field
        label="Kendi renginiz"
        value={custom}
        onChangeText={(t) => {
          const v = t.trim().startsWith('#') ? t.trim() : `#${t.trim()}`;
          setCustom(t);
          if (HEX.test(v)) setAccent(v.toUpperCase());
        }}
        autoCapitalize="characters"
        placeholder="#1E3A8A"
        hint="Altı haneli renk kodu yazın; seçtiğiniz renk aşağıdaki önizlemede görünür."
      />

      <SectionTitle title="Önizleme" />
      <View style={[styles.preview, { backgroundColor: p.canvas }]}>
        <View style={[styles.previewRail, { backgroundColor: previewScheme === 'dark' && !accent ? '#0C1A17' : p.deep }]}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>gidero</Text>
          <View style={[styles.previewItem, { backgroundColor: '#FFFFFF' }]}>
            <Text style={{ color: p.deep, fontWeight: '600', fontSize: 13 }}>Yönetim paneli</Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Test sürüşü</Text>
        </View>
        <View style={{ flex: 1, gap: space.sm, padding: space.md }}>
          <View style={[styles.previewCard, { backgroundColor: p.paper }]}>
            <Text style={{ color: p.muted, fontSize: 12 }}>Bu ay tahsilat</Text>
            <Text style={{ color: p.ink, fontWeight: '700', fontSize: 18 }}>₺12.450,00</Text>
          </View>
          <View style={[styles.previewBtn, { backgroundColor: p.pen }]}>
            <Text style={{ color: p.onPen, fontWeight: '600', fontSize: 14 }}>Müşteri ekle</Text>
          </View>
        </View>
      </View>

      {error ? <Notice tone="bad" text={error} /> : null}
      {info ? <Notice tone="ok" text={info} /> : null}
      <Button icon="check" title="Kaydet" onPress={save} loading={busy} disabled={!changed && !busy} />
    </Page>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 2, minHeight: hit },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: hit, height: hit, borderRadius: hit / 2, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  preview: { flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', minHeight: 170 },
  previewRail: { width: 140, padding: space.md, gap: space.sm },
  previewItem: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6 },
  previewCard: { borderRadius: radius.sm, padding: space.md, gap: 2 },
  previewBtn: { borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 18 },
});
