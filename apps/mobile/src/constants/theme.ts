import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

import { brandPalette, type BrandInput } from '@/lib/brand/colors';

// Gidero marka seti: defter yeşili (#0B6E5F), koyu yeşil (#0B3D35), onay amberi (#F2A93B).
// Amber yalnızca onay ve vurgu içindir; uyarılar turuncu-kırmızı, kritik hatalar kırmızıdır.
const light = {
  canvas: '#F4F6F5',
  paper: '#FFFFFF',
  paperLine: '#E1E7E5',
  ink: '#16211F',
  muted: '#4A5856',
  faint: '#7D8B88',
  pen: '#0B6E5F',
  penSoft: '#E6F1EE',
  onPen: '#FFFFFF',
  deep: '#0B3D35',
  onDeep: '#FFFFFF',
  onDeepMuted: '#9CC9BF',
  stamp: '#9A5B00',
  stampSoft: '#FDF1DC',
  gold: '#F2A93B',
  amber: '#B54708',
  amberSoft: '#FEF0E6',
  red: '#B42318',
  redSoft: '#FDE8E6',
};

const dark: typeof light = {
  canvas: '#0A1513',
  paper: '#13221F',
  paperLine: '#22332F',
  ink: '#E8F0EE',
  muted: '#A3B3AF',
  faint: '#6F817C',
  pen: '#4FC2A8',
  penSoft: '#123A33',
  onPen: '#04201B',
  deep: '#0E4A40',
  onDeep: '#FFFFFF',
  onDeepMuted: '#9CC9BF',
  stamp: '#F2A93B',
  stampSoft: '#3A2A0E',
  gold: '#F2A93B',
  amber: '#F59E5B',
  amberSoft: '#3A2210',
  red: '#FF8A80',
  redSoft: '#3A1816',
};

export type Palette = typeof light;

// Görünüm tercihi: telefonun ayarı (sistem), açık ya da koyu. Cihazda saklanır.
export type ThemePref = 'system' | 'light' | 'dark';
const THEME_KEY = 'gidero.theme';
let themePref: ThemePref = 'system';
const themeSubs = new Set<() => void>();
const subscribe = (f: () => void) => {
  themeSubs.add(f);
  return () => {
    themeSubs.delete(f);
  };
};

export async function loadThemePref() {
  const v = await AsyncStorage.getItem(THEME_KEY).catch(() => null);
  if (v === 'light' || v === 'dark' || v === 'system') {
    themePref = v;
    themeSubs.forEach((f) => f());
  }
}

export function setThemePref(p: ThemePref) {
  themePref = p;
  AsyncStorage.setItem(THEME_KEY, p).catch(() => {});
  themeSubs.forEach((f) => f());
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, () => themePref, () => themePref);
}

/** Geçerli görünüm: tercih "sistem" ise telefonun ayarı */
export function useScheme(): 'light' | 'dark' {
  const sys = useColorScheme();
  const pref = useThemePref();
  return pref === 'system' ? (sys === 'dark' ? 'dark' : 'light') : pref;
}

// Şirket markası: seçili şirketin kurumsal renkleri tüm uygulamaya uygulanır (oturum sağlar)
const NO_BRAND: BrandInput = { primary: null, accent: null };
export const BrandContext = createContext<BrandInput>(NO_BRAND);
const paletteCache = new Map<string, Palette>();

export function paletteFor(scheme: 'light' | 'dark', b: BrandInput): Palette {
  const key = `${scheme}|${b.primary ?? ''}|${b.accent ?? ''}`;
  let p = paletteCache.get(key);
  if (!p) {
    p = brandPalette(scheme === 'dark' ? dark : light, b, scheme);
    paletteCache.set(key, p);
  }
  return p;
}

export function useColors(): Palette {
  const scheme = useScheme();
  return paletteFor(scheme, useContext(BrandContext));
}

/** Marka yazı aileleri: başlık ve tutarlar Bricolage Grotesque, metin Figtree. */
export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 6, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const type = {
  display: { fontSize: 42, fontFamily: fonts.displayHeavy, letterSpacing: -1.2, fontVariant: ['tabular-nums' as const] },
  title: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.4 },
  body: { fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18 },
  section: { fontSize: 17, fontFamily: fonts.display, letterSpacing: -0.2 },
  amount: { fontSize: 16, fontFamily: fonts.display, fontVariant: ['tabular-nums' as const] },
};
