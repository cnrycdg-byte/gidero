import { useColorScheme } from 'react-native';

// Gidero renk dili: fiş kâğıdı (paper) gri masa üstünde (canvas) durur; ana renk tükenmez kalem mavisi,
// onay yeşili ise ıslak imza mührü gibi yalnızca "onaylandı" anlamında kullanılır.
const light = {
  canvas: '#ECEEF1',
  paper: '#FFFFFF',
  paperLine: '#E3E6EA',
  ink: '#18202B',
  muted: '#667085',
  faint: '#98A2B3',
  pen: '#2341B8',
  penSoft: '#E6EBFB',
  onPen: '#FFFFFF',
  stamp: '#17734F',
  stampSoft: '#E3F2EA',
  amber: '#A15C07',
  amberSoft: '#FCF0DC',
  red: '#B42318',
  redSoft: '#FDE8E6',
};

const dark: typeof light = {
  canvas: '#0F1318',
  paper: '#1A2028',
  paperLine: '#2A313B',
  ink: '#E8ECF1',
  muted: '#98A2B3',
  faint: '#667085',
  pen: '#8EA4FF',
  penSoft: '#1E2747',
  onPen: '#0B1230',
  stamp: '#55C795',
  stampSoft: '#15301F',
  amber: '#F5B54A',
  amberSoft: '#36280F',
  red: '#FF8A80',
  redSoft: '#3A1816',
};

export type Palette = typeof light;

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const type = {
  display: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1, fontVariant: ['tabular-nums' as const] },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18 },
  section: { fontSize: 15, fontWeight: '600' as const },
  amount: { fontSize: 16, fontWeight: '600' as const, fontVariant: ['tabular-nums' as const] },
};
