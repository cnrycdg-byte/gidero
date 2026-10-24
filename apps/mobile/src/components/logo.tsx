import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Text } from '@/components/text';
import { fonts } from '@/constants/theme';

/** Gidero işareti: yeşil kare içinde alt kenarı yırtık fiş ve amber onay işareti */
export function LogoMark({ size = 40, inverted = false }: { size?: number; inverted?: boolean }) {
  const bg = inverted ? '#FFFFFF' : '#0B6E5F';
  const slip = inverted ? '#0B6E5F' : '#FFFFFF';
  const lines = inverted ? '#5FA899' : '#9CC9BF';
  const small = size < 40;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Gidero">
      <Rect width={64} height={64} rx={15} fill={bg} />
      <Path d="M22 12H42Q46 12 46 16V48L42.5 45L39 48L35.5 45L32 48L28.5 45L25 48L21.5 45L18 48V16Q18 12 22 12Z" fill={slip} />
      {!small && <Path d="M24 19H40M24 25H34" stroke={lines} strokeWidth={2.5} strokeLinecap="round" />}
      <Path
        d="M24.5 33.5L29.5 38.5L40 28"
        fill="none"
        stroke="#F2A93B"
        strokeWidth={small ? 5 : 4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** İşaret + "gidero" yazısı */
export function Logo({ size = 32, color = '#0B3D35', inverted = false }: { size?: number; color?: string; inverted?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.28 }}>
      <LogoMark size={size} inverted={inverted} />
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.82, letterSpacing: -0.6, color, marginTop: -size * 0.06 }}>
        gidero
      </Text>
    </View>
  );
}
