import { useColorScheme } from 'react-native';

// Gidero renkleri: koyu lacivert zemin üzerine yeşil vurgu; uyarılar sarı/kırmızı.
const light = {
  bg: '#F4F5F2',
  card: '#FFFFFF',
  text: '#13201C',
  muted: '#5E6B66',
  border: '#E1E4DE',
  primary: '#0B7A5A',
  primaryText: '#FFFFFF',
  primarySoft: '#E2F2EC',
  warning: '#9A6200',
  warningSoft: '#FDF1D8',
  danger: '#B42318',
  dangerSoft: '#FDE7E5',
  info: '#2B5BA8',
  infoSoft: '#E5EDFA',
};

const dark: typeof light = {
  bg: '#0E1513',
  card: '#18211E',
  text: '#ECF1EE',
  muted: '#9AA8A2',
  border: '#27322E',
  primary: '#34C08F',
  primaryText: '#05140F',
  primarySoft: '#12352A',
  warning: '#F2B94B',
  warningSoft: '#3A2C10',
  danger: '#FF8A7E',
  dangerSoft: '#3D1715',
  info: '#8DB3F2',
  infoSoft: '#16243B',
};

export type Palette = typeof light;

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16 },
  small: { fontSize: 13 },
  amount: { fontSize: 32, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
};
