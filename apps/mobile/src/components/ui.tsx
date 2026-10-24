import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { radius, space, type, useColors, type Palette } from '@/constants/theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.label, { color: c.muted }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const c = useColors();
  return <Text style={[type.body, { color: muted ? c.muted : c.text }, style]}>{children}</Text>;
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const c = useColors();
  const look = buttonLook(c, variant);
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: look.bg, borderColor: look.border, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: look.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

function buttonLook(c: Palette, v: ButtonProps['variant']) {
  switch (v) {
    case 'secondary':
      return { bg: c.card, fg: c.text, border: c.border };
    case 'danger':
      return { bg: c.dangerSoft, fg: c.danger, border: c.dangerSoft };
    case 'ghost':
      return { bg: 'transparent', fg: c.primary, border: 'transparent' };
    default:
      return { bg: c.primary, fg: c.primaryText, border: c.primary };
  }
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.card, borderColor: c.border },
          props.multiline && { minHeight: 80, textAlignVertical: 'top' },
          props.style,
        ]}
      />
      {hint ? <Text style={[type.small, { color: c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' }) {
  const c = useColors();
  const map = {
    neutral: [c.border, c.muted],
    ok: [c.primarySoft, c.primary],
    warn: [c.warningSoft, c.warning],
    bad: [c.dangerSoft, c.danger],
    info: [c.infoSoft, c.info],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'bad' }) {
  const c = useColors();
  const bg = tone === 'bad' ? c.dangerSoft : tone === 'warn' ? c.warningSoft : c.infoSoft;
  const fg = tone === 'bad' ? c.danger : tone === 'warn' ? c.warning : c.info;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <Text style={[type.small, { color: fg, lineHeight: 19 }]}>{text}</Text>
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={[styles.center, { backgroundColor: c.bg }]}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '600' },
  notice: { borderRadius: radius.md, padding: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
