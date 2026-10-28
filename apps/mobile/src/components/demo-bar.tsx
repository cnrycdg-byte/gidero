import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { space } from '@/constants/theme';
import { useDemo } from '@/lib/demo';
import { useSession } from '@/lib/session';

/** Test modunda her ekranın altında: kim olarak görüldüğü ve kişi değiştirme */
export function DemoBar() {
  const { userId, session } = useSession();
  const demo = useDemo(userId);
  const insets = useSafeAreaInsets();
  if (!demo.testMode) return null;
  const who = demo.me
    ? `${demo.me.full_name}, ${demo.me.label}${demo.account ? ` (${demo.account})` : ''}`
    : `Gidero yöneticisi (${session?.user.email ?? ''})`;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <Text style={styles.text} numberOfLines={1}>{`Test modu: ${who}`}</Text>
      <Pressable onPress={() => router.push('/test')} hitSlop={8} style={styles.btn}>
        <Text style={styles.btnText}>Kişi değiştir</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: '#B4531A', paddingHorizontal: space.lg, paddingTop: 8 },
  text: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  btn: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
