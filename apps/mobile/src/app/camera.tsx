import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Button } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { useQueue } from '@/lib/queue';
import { useSession } from '@/lib/session';

// Seri fiş çekimi: kamera açık kalır, her deklanşörde fiş sıraya girer ve arka planda okunur.
export default function Camera() {
  const { reportId, companyId } = useLocalSearchParams<{ reportId: string; companyId: string }>();
  const c = useColors();
  const { userId } = useSession();
  const { enqueue } = useQueue();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [ready, setReady] = useState(false);
  const flash = useRef(new Animated.Value(0)).current;

  async function shoot() {
    if (!cam.current || busy || !userId) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.6, shutterSound: false });
      if (pic?.uri) {
        setShots((s) => [...s, pic.uri]);
        enqueue({ reportId, companyId, userId, uri: pic.uri });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!perm) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!perm.granted) {
    return (
      <SafeAreaView style={[styles.permission, { backgroundColor: c.canvas }]}>
        <View style={[styles.permIcon, { backgroundColor: c.penSoft }]}>
          <Icon name="camera" size={30} color={c.pen} />
        </View>
        <Text style={[type.title, { color: c.ink, textAlign: 'center' }]}>Kamerayı açalım</Text>
        <Text style={[type.body, { color: c.muted, textAlign: 'center' }]}>
          Fişlerinizi fotoğraflamak için Gidero'nun kameraya erişmesi gerekiyor.
        </Text>
        <Button
          title={perm.canAskAgain ? 'Kameraya izin ver' : 'Ayarları aç'}
          onPress={() => (perm.canAskAgain ? requestPerm() : Linking.openSettings())}
          style={{ alignSelf: 'stretch', marginTop: space.lg }}
        />
        <Button variant="plain" title="Vazgeç" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const last = shots[shots.length - 1];

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={cam}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        animateShutter={false}
        onCameraReady={() => setReady(true)}
      />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flash }]} />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <RoundButton onPress={() => router.back()} label="Kapat">
            <Icon name="close" size={18} color="#fff" />
          </RoundButton>
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {shots.length === 0 ? 'Fişi çerçeveye sığdırın' : `${shots.length} fiş çekildi`}
            </Text>
          </View>
          <RoundButton onPress={() => setTorch((t) => !t)} label={torch ? 'Işığı kapat' : 'Işığı aç'} active={torch}>
            <Icon name={torch ? 'flashOn' : 'flashOff'} size={18} color={torch ? '#111' : '#fff'} />
          </RoundButton>
        </View>

        <View style={styles.frame} pointerEvents="none">
          <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }]} />
          <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }]} />
          <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
          <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }]} />
        </View>

        <View style={styles.bottomBar}>
          <View style={styles.side}>
            {last ? (
              <View>
                <Image source={{ uri: last }} style={styles.thumb} contentFit="cover" />
                <View style={[styles.badge, { backgroundColor: c.pen }]}>
                  <Text style={{ color: c.onPen, fontSize: 12, fontWeight: '700' }}>{shots.length}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fişi çek"
            onPress={shoot}
            disabled={!ready || busy}
            style={({ pressed }) => [styles.shutterRing, { opacity: !ready ? 0.4 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
            <View style={styles.shutter} />
          </Pressable>

          <View style={[styles.side, { alignItems: 'flex-end' }]}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.done, { backgroundColor: shots.length ? c.pen : 'rgba(255,255,255,0.18)', opacity: pressed ? 0.8 : 1 }]}>
              <Text style={{ color: shots.length ? c.onPen : '#fff', fontWeight: '700', fontSize: 15 }}>Bitti</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.hint}>Arka arkaya çekin; fişler arka planda okunur.</Text>
      </SafeAreaView>
    </View>
  );
}

function RoundButton({ children, onPress, label, active }: { children: React.ReactNode; onPress: () => void; label: string; active?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={8}
      style={[styles.round, { backgroundColor: active ? '#FFD84D' : 'rgba(0,0,0,0.45)' }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  counter: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  counterText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  frame: { flex: 1, marginHorizontal: 36, marginVertical: 28 },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 4 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl },
  side: { width: 84 },
  thumb: { width: 54, height: 54, borderRadius: 10, borderWidth: 2, borderColor: '#fff' },
  badge: { position: 'absolute', top: -8, right: -8, minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  shutterRing: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
  done: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  hint: { color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontSize: 13, marginTop: space.md, marginBottom: space.sm },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md },
  permIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
