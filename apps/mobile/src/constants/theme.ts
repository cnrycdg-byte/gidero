import { createContext, useContext, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';

import { brandPalette, type BrandInput } from '@/lib/brand/colors';

// Renkler Apple HIG'e göre (Color > System colors; iOS, iPadOS):
// - Arka planlar gruplu liste setinden: systemGroupedBackground (canvas), secondarySystemGroupedBackground (paper).
// - Yazılar label / secondaryLabel / tertiaryLabel; ayraç opaqueSeparator.
// - Durum renkleri systemRed, systemOrange; küçük metinde 4,5:1 karşıtlık için (Accessibility > Vision)
//   sistemin "artırılmış karşıtlık" varyantları kullanılır.
// - Vurgu rengi (pen) uygulamanın accent rengidir: şirketin kurumsal rengi ya da Gidero yeşili
//   (Branding > "Apply your app's accent color judiciously"; Color > Liquid Glass color).
// Değerler web ve Android için de gerektiğinden sabit yazılır; iOS sistem değerleriyle aynıdır.
// Artırılmış karşıtlık açıksa (Ayarlar > Erişilebilirlik) `contrast` setleri devreye girer.
const light = {
  canvas: '#F2F2F7', // systemGroupedBackground
  paper: '#FFFFFF', // secondarySystemGroupedBackground
  paperLine: '#C6C6C8', // opaqueSeparator
  ink: '#000000', // label
  muted: '#3C3C4399', // secondaryLabel
  faint: '#3C3C434D', // tertiaryLabel
  fill: '#7878801F', // tertiarySystemFill
  pen: '#0B6E5F', // accent (marka)
  penSoft: '#E6F1EE',
  onPen: '#FFFFFF',
  deep: '#0B3D35',
  onDeep: '#FFFFFF',
  onDeepMuted: '#9CC9BF',
  stamp: '#C93400', // systemOrange, artırılmış karşıtlık (metinde okunur)
  stampSoft: '#FF95001F',
  gold: '#F2A93B',
  amber: '#C93400', // systemOrange, artırılmış karşıtlık
  amberSoft: '#FF95001F',
  red: '#D70015', // systemRed, artırılmış karşıtlık
  redSoft: '#FF3B301A',
  green: '#248A3D', // systemGreen, artırılmış karşıtlık
  blue: '#007AFF', // systemBlue (link)
};

const dark: typeof light = {
  canvas: '#000000', // systemGroupedBackground
  paper: '#1C1C1E', // secondarySystemGroupedBackground
  paperLine: '#38383A', // opaqueSeparator
  ink: '#FFFFFF', // label
  muted: '#EBEBF599', // secondaryLabel
  faint: '#EBEBF54D', // tertiaryLabel
  fill: '#7676803D', // tertiarySystemFill
  pen: '#4FC2A8',
  penSoft: '#123A33',
  onPen: '#04201B',
  deep: '#0E4A40',
  onDeep: '#FFFFFF',
  onDeepMuted: '#9CC9BF',
  stamp: '#FF9F0A', // systemOrange
  stampSoft: '#FF9F0A29',
  gold: '#F2A93B',
  amber: '#FF9F0A', // systemOrange
  amberSoft: '#FF9F0A29',
  red: '#FF453A', // systemRed
  redSoft: '#FF453A29',
  green: '#30D158', // systemGreen
  blue: '#0A84FF', // systemBlue
};

// Artırılmış karşıtlık (Color > "Make sure all your app's colors work well in light, dark, and increased contrast contexts")
const lightContrast: Partial<typeof light> = { muted: '#3C3C43CC', faint: '#3C3C4399', paperLine: '#8E8E93', blue: '#0040DD' };
const darkContrast: Partial<typeof light> = { muted: '#EBEBF5CC', faint: '#EBEBF599', paperLine: '#8E8E93', amber: '#FFB340', stamp: '#FFB340', red: '#FF6961', green: '#30DB5B', blue: '#409CFF' };

export type Palette = typeof light;

// Görünüm her zaman telefonun ayarını izler; uygulamaya özel açık/koyu seçeneği yoktur
// (Dark Mode > "Avoid offering an app-specific appearance setting").
export function useScheme(): 'light' | 'dark' {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

/** Ayarlar > Erişilebilirlik > Karşıtlığı artır (iOS). Diğer platformlarda kapalı sayılır. */
let highContrast = false;
const contrastSubs = new Set<() => void>();
if (Platform.OS === 'ios') {
  AccessibilityInfo.isDarkerSystemColorsEnabled?.().then((v) => {
    highContrast = !!v;
    contrastSubs.forEach((f) => f());
  }).catch(() => {});
  AccessibilityInfo.addEventListener?.('darkerSystemColorsChanged', (v: boolean) => {
    highContrast = !!v;
    contrastSubs.forEach((f) => f());
  });
}
function useHighContrast() {
  return useSyncExternalStore(
    (f) => {
      contrastSubs.add(f);
      return () => {
        contrastSubs.delete(f);
      };
    },
    () => highContrast,
    () => false,
  );
}

// Şirket markası: seçili şirketin kurumsal renkleri tüm uygulamaya uygulanır (oturum sağlar)
const NO_BRAND: BrandInput = { primary: null, accent: null };
export const BrandContext = createContext<BrandInput>(NO_BRAND);
const paletteCache = new Map<string, Palette>();

export function paletteFor(scheme: 'light' | 'dark', b: BrandInput, contrast = false): Palette {
  const key = `${scheme}|${contrast ? 1 : 0}|${b.primary ?? ''}|${b.accent ?? ''}`;
  let p = paletteCache.get(key);
  if (!p) {
    const base = scheme === 'dark' ? dark : light;
    const withContrast = contrast ? { ...base, ...(scheme === 'dark' ? darkContrast : lightContrast) } : base;
    p = brandPalette(withContrast, b, scheme);
    paletteCache.set(key, p);
  }
  return p;
}

export function useColors(): Palette {
  const scheme = useScheme();
  const contrast = useHighContrast();
  return paletteFor(scheme, useContext(BrandContext), contrast);
}

/**
 * Yazı tipi: sistem fontu (iOS'ta SF Pro). Typography > "Using system fonts", Platform considerations:
 * "SF Pro is the system font in iOS and iPadOS". Font gömülmez ("don't embed system fonts").
 * Eski adlar korunur; Text bileşeni bunları sistem fontu + kalınlığa çevirir.
 * İnce kalınlıklar kullanılmaz (Typography > "avoid light font weights").
 */
export const fonts = {
  display: 'sys-700',
  displayHeavy: 'sys-700',
  regular: 'sys-400',
  medium: 'sys-500',
  semibold: 'sys-600',
  bold: 'sys-700',
} as const;

/** Platformun sistem fontu: iOS ve web'de "System" (SF Pro / -apple-system), Android'de varsayılan (Roboto) */
export const systemFont = Platform.select({ ios: 'System', web: 'System', default: undefined });

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
// Layout: kenar boşluğu 16 pt (lg). Dokunma alanı en az 44x44 pt (Buttons > Best practices).
export const hit = 44;
export const radius = { sm: 6, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/**
 * Metin stilleri, iOS Dynamic Type "Large (default)" tablosundan (Typography > Specifications):
 * Large Title 34/41, Title 2 22/28, Headline 17/22 semibold, Body 17/22, Callout 16/21,
 * Subhead 15/20, Footnote 13/18, Caption 1 12/16. En küçük boyut 11 pt.
 * Vurgulu (emphasized) hâller: Large Title ve Title bold, diğerleri semibold.
 * Yazılar Dynamic Type ile büyür (React Native Text'te allowFontScaling açık).
 */
export const type = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] }, // Large Title, emphasized
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const }, // Title 2, emphasized
  section: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const }, // Headline
  body: { fontSize: 17, lineHeight: 22 }, // Body
  bodyStrong: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const }, // Body, emphasized
  callout: { fontSize: 16, lineHeight: 21 }, // Callout
  subhead: { fontSize: 15, lineHeight: 20 }, // Subhead
  small: { fontSize: 13, lineHeight: 18 }, // Footnote
  caption: { fontSize: 12, lineHeight: 16 }, // Caption 1
  amount: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, fontVariant: ['tabular-nums' as const] }, // Body, emphasized
};
