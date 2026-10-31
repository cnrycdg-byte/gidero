// Yatay seçim düğmeleri (filtre ya da tek seçim). Seçili olan ana renkle dolu, sayı varsa yanında.
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { radius, space, useColors } from '@/constants/theme';

export function Chips<K extends string>({ items, value, onChange, role = 'tab' }: {
  items: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (k: K) => void;
  role?: 'tab' | 'radio';
}) {
  const c = useColors();
  return (
    <View style={styles.row}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable
            key={it.key}
            onPress={() => onChange(it.key)}
            accessibilityRole={role}
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.chip, { backgroundColor: on ? c.pen : c.fill, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ color: on ? c.onPen : c.ink, fontWeight: '600', fontSize: 14 }}>
              {it.count != null ? `${it.label} ${it.count}` : it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Kare seçim kutusu (liste satırlarında) */
export function Check({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} hitSlop={10}
      style={[styles.box, { borderColor: on ? c.pen : c.faint, backgroundColor: on ? c.pen : 'transparent' }]}>
      {on ? <Text style={{ color: c.onPen, fontWeight: '800', fontSize: 14, lineHeight: 16 }}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 36, borderRadius: radius.pill, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
