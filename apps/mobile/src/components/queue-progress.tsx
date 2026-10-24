import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { etaText, useQueue, type QueueItem } from '@/lib/queue';

const STAGE: Record<QueueItem['status'], string> = {
  waiting: 'Sırada',
  uploading: 'Yükleniyor',
  reading: 'Okunuyor',
  done: 'Hazır',
  failed: 'Hata',
};

/** Fişler işlenirken: ilerleme çubuğu, kalan tahmini süre ve her fişin küçük resmiyle aşaması */
export function QueueProgress({ reportId }: { reportId?: string }) {
  const c = useColors();
  const queue = useQueue();
  const [now, setNow] = useState(Date.now());
  const p = queue.progress(reportId, now);
  const items = queue.items.filter((i) => (!reportId || i.reportId === reportId) && i.status !== 'failed');

  // Süre sayacı her saniye güncellenir
  useEffect(() => {
    if (!p.active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [p.active]);

  // Çubuk: bitenler + çalışanların yaklaşık ilerlemesi, yumuşak geçişle
  const ratio = p.total ? Math.min(1, p.finished / p.total) : 0;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.max(0.06, ratio), duration: 400, useNativeDriver: false }).start();
  }, [ratio, anim]);

  if (!p.active || items.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: c.paper, borderColor: c.penSoft }]}>
      <View style={styles.head}>
        <ActivityIndicator color={c.pen} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink }}>
            {p.total} fişten {p.finished} tanesi hazır
          </Text>
          <Text style={[type.small, { color: c.muted }]}>{etaText(p.etaSeconds)} kaldı. Bu sırada çekmeye devam edebilirsiniz.</Text>
        </View>
      </View>

      <View style={[styles.track, { backgroundColor: c.canvas }]}>
        <Animated.View
          style={[
            styles.bar,
            { backgroundColor: c.pen, width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {items.map((i) => (
          <View key={i.key} style={{ width: 64, gap: 4 }}>
            <View>
              <Image source={{ uri: i.uri }} style={[styles.thumb, { opacity: i.status === 'done' ? 1 : 0.55 }]} contentFit="cover" />
              <View style={[styles.badge, { backgroundColor: i.status === 'done' ? c.pen : 'rgba(0,0,0,0.55)' }]}>
                {i.status === 'done' ? (
                  <Icon name="check" size={11} color="#fff" />
                ) : i.status === 'waiting' ? (
                  <Icon name="clock" size={11} color="#fff" />
                ) : (
                  <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.6 }] }} />
                )}
              </View>
            </View>
            <Text style={{ fontSize: 11, color: i.status === 'done' ? c.pen : c.muted, textAlign: 'center' }} numberOfLines={1}>
              {STAGE[i.status]}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1.5, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
  thumb: { width: 64, height: 80, borderRadius: radius.sm },
  badge: { position: 'absolute', right: 4, bottom: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
