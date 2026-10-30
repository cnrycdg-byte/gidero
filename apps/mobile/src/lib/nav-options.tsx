// Gezinme çubuğu ayarları: kök yığın ve sekmelerin içindeki yığınlar aynı görünümü paylaşır.
import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

import { ProfileButton } from '@/components/profile-button';
import { useColors } from '@/constants/theme';
import { useWide } from '@/lib/layout';

type Options = Exclude<ComponentProps<typeof Stack>['screenOptions'], ((...a: never[]) => unknown) | undefined>;

export function useStackOptions(): Options {
  const c = useColors();
  const wide = useWide();
  return {
    headerBackButtonDisplayMode: 'minimal',
    headerTintColor: c.pen,
    // Başlık sistem fontuyla Headline (17 pt semibold); büyük başlık Large Title bold (Typography > Specifications)
    headerTitleStyle: { color: c.ink, fontSize: 17, fontWeight: '600' },
    headerLargeTitleStyle: { color: c.ink, fontWeight: '700' },
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerStyle: { backgroundColor: c.canvas },
    contentStyle: wide ? { backgroundColor: c.canvas, maxWidth: 1180, width: '100%' } : { backgroundColor: c.canvas },
    // Telefonda Hesabım sekme çubuğunda durur; web'de dar ekranda sekme çubuğu olmadığından sağ üstte
    headerRight: Platform.OS === 'web' && !wide ? () => <ProfileButton /> : undefined,
  };
}
