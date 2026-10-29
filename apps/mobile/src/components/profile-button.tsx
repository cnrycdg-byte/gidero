import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';

/** Sağ üst köşedeki profil düğmesi: baş harfler, dokununca Hesabım */
export function ProfileButton() {
  const c = useColors();
  const { session } = useSession();
  const name = String(session?.user.user_metadata?.full_name || session?.user.email || '?');
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase('tr-TR'))
    .join('');
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Hesabım"
      style={({ pressed }) => [styles.avatar, { backgroundColor: c.pen, opacity: pressed ? 0.8 : 1 }]}>
      <Text style={{ color: c.onPen, fontWeight: '700', fontSize: 13 }}>{initials}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
});
