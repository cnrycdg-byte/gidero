import { Image } from 'expo-image';
import { View } from 'react-native';

import { useColors } from '@/constants/theme';
import { logoUrl } from '@/lib/brand';

/** Listelerde şirket logosu: beyaz zeminli küçük kare */
export function CompanyLogo({ path, size = 34 }: { path: string | null | undefined; size?: number }) {
  const c = useColors();
  const uri = logoUrl(path);
  if (!uri) return null;
  return (
    <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: c.paperLine, padding: 3 }}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
    </View>
  );
}
