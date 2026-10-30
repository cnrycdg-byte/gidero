import { Stack } from 'expo-router';

import { useStackOptions } from '@/lib/nav-options';

// Sekmenin kendi gezinme yığını; üst düzey ekranda büyük başlık (Typography: Large Title)
export default function TabStack() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Muhasebe masası', headerLargeTitle: true }} />
    </Stack>
  );
}
