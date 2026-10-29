// Gidero yönetim ekranlarının üstünde sabit duran menü: geri tuşuna basmadan bölümler arasında geçilir.
import { router, usePathname } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { radius, space, useColors } from '@/constants/theme';

const ITEMS: { href: string; label: string; icon: IconName; match?: string[] }[] = [
  { href: '/admin', label: 'Panel', icon: 'settings', match: ['/admin/account', '/admin/company'] },
  { href: '/admin/new-customer', label: 'Müşteri ekle', icon: 'personAdd' },
  { href: '/admin/plans', label: 'Fiyatlar', icon: 'receipt', match: ['/admin/plan-details'] },
  { href: '/admin/orders', label: 'Siparişler', icon: 'inbox' },
  { href: '/admin/finance', label: 'Gelir ve gider', icon: 'doc' },
  { href: '/admin/campaigns', label: 'Kampanyalar', icon: 'plus' },
  { href: '/admin/chats', label: 'Site sohbetleri', icon: 'send' },
  { href: '/test', label: 'Test sürüşü', icon: 'team' },
];

export function AdminNav() {
  const c = useColors();
  const path = usePathname();
  const scroller = useRef<ScrollViewInstance>(null);
  const isOn = (it: (typeof ITEMS)[number]) =>
    it.href === '/admin' ? path === '/admin' || (it.match ?? []).some((m) => path.startsWith(m)) : path === it.href || (it.match ?? []).some((m) => path.startsWith(m));

  return (
    <View style={[styles.bar, { backgroundColor: c.canvas, borderBottomColor: c.paperLine }]}>
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="tablist">
        {ITEMS.map((it) => {
          const on = isOn(it);
          return (
            <Pressable
              key={it.href}
              // Dar ekranda seçili bölüm görünür alana kaydırılır
              onLayout={on ? (e) => scroller.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - space.lg), animated: false }) : undefined}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              // Yönetim bölümleri arasında yığın büyümesin: yerine geç
              onPress={() => (on ? null : router.replace(it.href as never))}
              style={({ pressed }) => [styles.item, { backgroundColor: on ? c.pen : c.paper, opacity: pressed ? 0.8 : 1 }]}>
              <Icon name={it.icon} size={14} color={on ? c.onPen : c.pen} />
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: '600', fontSize: 14 }}>{it.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
});
