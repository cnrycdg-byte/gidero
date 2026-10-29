import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Field } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { colorFromLogo, pickLogo } from '@/lib/brand';
import { BRAND_PRESETS, normalizeHex } from '@/lib/brand/colors';

export type BrandDraft = { primary: string; accent: string; logoUri: string | null };

/** Şirket açarken logo ve kurumsal renk seçimi (kayıt, şirket açıldıktan sonra yapılır) */
export function BrandPicker({ value, onChange }: { value: BrandDraft; onChange: (v: BrandDraft) => void }) {
  const c = useColors();
  const p = normalizeHex(value.primary);
  const a = normalizeHex(value.accent);

  async function choose() {
    const uri = await pickLogo();
    if (!uri) return;
    const found = await colorFromLogo(uri);
    onChange({ ...value, logoUri: uri, primary: value.primary || found || '' });
  }

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={[styles.logo, { backgroundColor: c.paper, borderColor: c.paperLine }]}>
          {value.logoUri ? (
            <Image source={{ uri: value.logoUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          ) : (
            <Text style={[type.small, { color: c.faint }]}>Logo yok</Text>
          )}
        </View>
        <View style={{ gap: space.xs }}>
          <Button title={value.logoUri ? 'Logoyu değiştir' : 'Logo seç'} icon="gallery" variant="secondary" onPress={choose} />
          {value.logoUri ? <Button title="Logoyu kaldır" variant="plain" onPress={() => onChange({ ...value, logoUri: null })} /> : null}
        </View>
      </View>
      <View style={styles.presets}>
        {BRAND_PRESETS.map((pr) => {
          const on = p === pr.primary && a === pr.accent;
          return (
            <Pressable
              key={pr.name}
              accessibilityRole="button"
              accessibilityLabel={pr.name}
              onPress={() => onChange({ ...value, primary: pr.primary, accent: pr.accent })}
              style={[styles.preset, { borderColor: on ? c.ink : c.paperLine, backgroundColor: c.paper }]}>
              <View style={[styles.pot, { backgroundColor: pr.primary }]}>
                <View style={[styles.dot, { backgroundColor: pr.accent, borderColor: c.paper }]} />
              </View>
              <Text style={[type.small, { color: c.ink }]}>{pr.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Ana renk" value={value.primary} onChangeText={(v) => onChange({ ...value, primary: v })} placeholder="#0B6E5F" autoCapitalize="characters" maxLength={7} />
        </View>
        <View style={[styles.swatch, { backgroundColor: p ?? c.canvas, borderColor: c.paperLine }]} />
        <View style={{ flex: 1 }}>
          <Field label="Vurgu rengi" value={value.accent} onChangeText={(v) => onChange({ ...value, accent: v })} placeholder="#F2A93B" autoCapitalize="characters" maxLength={7} />
        </View>
        <View style={[styles.swatch, { backgroundColor: a ?? c.canvas, borderColor: c.paperLine }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 84, height: 84, borderRadius: radius.md, borderWidth: 1, padding: 6, alignItems: 'center', justifyContent: 'center' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  preset: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1.5, borderRadius: radius.pill, paddingVertical: 5, paddingLeft: 5, paddingRight: 12 },
  pot: { width: 22, height: 22, borderRadius: 11 },
  dot: { position: 'absolute', right: -3, bottom: -3, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  swatch: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, alignSelf: 'flex-end', marginBottom: 2 },
});
