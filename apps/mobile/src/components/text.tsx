import { Text as RNText, StyleSheet, type TextProps } from 'react-native';

import { fonts } from '@/constants/theme';

// Uygulama genelinde Figtree: fontWeight değerine göre doğru Figtree kalınlığı seçilir.
// Stilde açıkça bir fontFamily varsa (ör. Bricolage başlıklar) ona dokunulmaz.
const BY_WEIGHT: Record<string, string> = {
  '100': fonts.regular,
  '200': fonts.regular,
  '300': fonts.regular,
  '400': fonts.regular,
  normal: fonts.regular,
  '500': fonts.medium,
  '600': fonts.semibold,
  '700': fonts.bold,
  bold: fonts.bold,
  '800': fonts.bold,
  '900': fonts.bold,
};

export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return <RNText {...rest} style={style} />;
  const family = BY_WEIGHT[String(flat.fontWeight ?? '400')] ?? fonts.regular;
  return <RNText {...rest} style={[style, { fontFamily: family, fontWeight: undefined }]} />;
}
