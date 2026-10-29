import { createElement } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/text';
import { fonts, radius, space, useColors } from '@/constants/theme';

/** Sayı seçici: bilgisayarda kaydırıcı, her yerde - / + ve elle yazma */
export function QtySlider({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const c = useColors();
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n) || min));
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.row}>
        <Pressable onPress={() => onChange(clamp(value - 1))} style={[styles.btn, { backgroundColor: c.canvas }]} accessibilityLabel={`${label} azalt`}>
          <Text style={{ fontSize: 20, color: c.ink }}>−</Text>
        </Pressable>
        <TextInput
          value={String(value)}
          onChangeText={(t) => onChange(clamp(Number(t.replace(/\D/g, ''))))}
          keyboardType="number-pad"
          accessibilityLabel={label}
          style={[styles.num, { color: c.ink, borderColor: c.paperLine, fontFamily: fonts.display }]}
        />
        <Pressable onPress={() => onChange(clamp(value + 1))} style={[styles.btn, { backgroundColor: c.canvas }]} accessibilityLabel={`${label} artır`}>
          <Text style={{ fontSize: 20, color: c.ink }}>+</Text>
        </Pressable>
      </View>
      {Platform.OS === 'web'
        ? createElement('input', {
            type: 'range',
            min,
            max,
            step: 1,
            value,
            'aria-label': label,
            onChange: (e: { target: { value: string } }) => onChange(clamp(Number(e.target.value))),
            style: { width: '100%', accentColor: c.pen, cursor: 'pointer' },
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  btn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  num: { width: 80, height: 40, borderWidth: 1, borderRadius: radius.md, textAlign: 'center', fontSize: 20 },
});
