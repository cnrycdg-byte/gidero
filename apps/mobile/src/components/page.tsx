import type { ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';

import { space } from '@/constants/theme';
import { useWide } from '@/lib/layout';

/** Kaydırılabilir sayfa; web'de geniş ekranda ortalanır (yönetim paneli için) */
export function Page({ children, refreshing, onRefresh, wide }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; wide?: boolean }) {
  const desk = useWide();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      contentContainerStyle={{ padding: desk ? space.xxl : space.lg, paddingBottom: space.xxl * 2, alignItems: desk ? 'flex-start' : 'center' }}>
      <View style={{ width: '100%', maxWidth: Platform.OS === 'web' ? (wide ? 1100 : 760) : undefined, gap: space.lg }}>{children}</View>
    </ScrollView>
  );
}
