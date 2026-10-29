// Uygulama tanıtımı: ilk açılışta kişinin rolüne göre bir kez gösterilir; Hesabım'dan yeniden açılabilir
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { TourMock } from '@/components/tour-mock';
import { Button } from '@/components/ui';
import { fonts, radius, space, useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { pendingPages, sectionsFor } from '@/lib/tour';
import { tourState } from '@/lib/tour/state';

export default function Tour() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { all } = useLocalSearchParams<{ all?: string }>();
  const { active, bureaus } = useSession();
  const sections = useMemo(
    () => sectionsFor({ roles: active?.roles ?? [], bureau: bureaus.length > 0 || !!active?.bureau_account_id, hasCompany: !!active }),
    [active, bureaus],
  );
  const pages = useMemo(() => pendingPages(sections, tourState.seen, all === '1'), [sections, all]);
  const [i, setI] = useState(0);
  const closing = useRef(false);

  const finish = async () => {
    if (closing.current) return;
    closing.current = true;
    tourState.seen = Array.from(new Set([...tourState.seen, ...sections]));
    // Kaydedilemese de kullanıcıyı bekletmeyiz; bir sonraki açılışta yeniden denenir
    supabase.rpc('mark_tour_seen', { p_keys: sections }).then(() => {}, () => {});
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (!pages.length) {
    return (
      <View style={[styles.root, { backgroundColor: c.canvas, paddingTop: insets.top + space.xl }]}>
        <Text style={{ color: c.ink }}>Gösterilecek tanıtım yok.</Text>
        <Button title="Ana ekrana dön" onPress={finish} />
      </View>
    );
  }

  const p = pages[Math.min(i, pages.length - 1)];
  const last = i >= pages.length - 1;

  return (
    <View style={[styles.root, { backgroundColor: c.canvas, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.top}>
        <Text style={{ color: c.muted, fontSize: 13 }}>{`${i + 1} / ${pages.length}`}</Text>
        {!last && (
          <Pressable onPress={finish} hitSlop={12} accessibilityRole="button">
            <Text style={{ color: c.muted, fontWeight: '600' }}>Atla</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.stage}>
        <TourMock kind={p.mock} />
      </View>

      <View style={styles.copy}>
        <Text style={{ color: c.pen, fontWeight: '700', fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase' }}>{p.who}</Text>
        <Text style={{ color: c.ink, fontFamily: fonts.displayHeavy, fontSize: 24, lineHeight: 30 }}>{p.title}</Text>
        <Text style={{ color: c.ink, fontSize: 16, lineHeight: 23 }}>{p.text}</Text>
        <View style={[styles.where, { backgroundColor: c.penSoft }]}>
          <Text style={{ color: c.pen, fontSize: 14, fontWeight: '600' }}>{`Nerede: ${p.where}`}</Text>
        </View>
      </View>

      <View style={styles.dots}>
        {pages.map((x, k) => (
          <View key={k} style={[styles.dot, { backgroundColor: k === i ? c.pen : c.paperLine, width: k === i ? 18 : 6 }]} />
        ))}
      </View>

      <View style={styles.actions}>
        {i > 0 ? (
          <View style={{ flex: 1 }}>
            <Button variant="secondary" title="Geri" onPress={() => setI(i - 1)} />
          </View>
        ) : null}
        <View style={{ flex: 2 }}>
          <Button title={last ? 'Başlayalım' : 'İleri'} onPress={last ? finish : () => setI(i + 1)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.xl, gap: space.lg, alignSelf: 'center', width: '100%', maxWidth: 520 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200, borderRadius: radius.xl },
  copy: { gap: space.sm },
  where: { alignSelf: 'flex-start', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, marginTop: space.xs },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { height: 6, borderRadius: 3 },
  actions: { flexDirection: 'row', gap: space.sm },
});
