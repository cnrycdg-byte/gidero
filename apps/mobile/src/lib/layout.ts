import { Platform, useWindowDimensions } from 'react-native';

/** Bilgisayar ekranı: web ve en az 900 px genişlik. Kenar menüsü ve sıkı yerleşim bu durumda açılır. */
export function useWide() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 900;
}
