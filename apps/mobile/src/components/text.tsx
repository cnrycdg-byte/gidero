import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from 'react-native';

import { systemFont } from '@/constants/theme';

// Uygulamanın bütün yazıları sistem fontuyla (iOS'ta SF Pro) yazılır:
// HIG Typography > "Using system fonts". Eski kodda kalan `fonts.*` adları ("sys-600" gibi)
// burada sistem fontu + kalınlığa çevrilir. Yazılar Dynamic Type ile büyür (allowFontScaling açık);
// HIG Typography > "Supporting Dynamic Type", Accessibility > "Support larger text sizes".
export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const fam = typeof flat.fontFamily === 'string' ? flat.fontFamily : undefined;
  if (fam && !fam.startsWith('sys-')) return <RNText {...rest} style={style} />; // ör. tutarlar için monospace
  const weight = flat.fontWeight ?? (fam ? (fam.slice(4) as TextStyle['fontWeight']) : undefined);
  return <RNText {...rest} style={[style, { fontFamily: systemFont, fontWeight: weight }]} />;
}
