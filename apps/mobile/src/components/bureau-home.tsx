import { Image } from 'expo-image';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Group, Notice, Row, SectionTitle, StatusTag } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { currentPeriod, dateText, money } from '@/lib/format';
import { logoUrl } from '@/lib/brand';
import { useQueue } from '@/lib/queue';
import { ensureMonthReport, pickFromLibrary } from '@/lib/receipts';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import type { Report } from '@/lib/types';

/** Muhasebe bürosunun müşteri firma ekranı: fişler firmaya girilir, onay yok, kayda alınır, dökümü alınır. */
export function BureauHome() {
  const c = useColors();
  const { active, userId, memberships, bureaus } = useSession();
  const { enqueue, version } = useQueue();
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bureau = bureaus.find((b) => b.account_id === active?.bureau_account_id);
  const firms = memberships.filter((m) => m.bureau_account_id === active?.bureau_account_id);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    const { data, error: e } = await supabase
      .from('reports')
      .select('*')
      .eq('company_id', active.company_id)
      .order('created_at', { ascending: false })
      .limit(30);
    setLoading(false);
    if (e) return setError(errorText(e));
    setReports((data ?? []) as Report[]);
  }, [active]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, version]),
  );

  if (!active || !userId) return null;
  const period = currentPeriod();
  const month = reports.filter((r) => r.period === period.period);
  const drafts = reports.filter((r) => r.status === 'draft' || r.status === 'returned');
  const booked = reports.filter((r) => ['approved', 'booked'].includes(r.status));

  async function capture(source: 'camera' | 'gallery') {
    if (!active || !userId) return;
    setError(null);
    if (!active.company_active) return setError('Büro aboneliğinin süresi doldu; yeni fiş girilemiyor.');
    try {
      const reportId = await ensureMonthReport(active.company_id, userId);
      if (source === 'camera') {
        router.push({ pathname: '/camera', params: { reportId, companyId: active.company_id } });
      } else {
        const uris = await pickFromLibrary();
        uris.forEach((uri) => enqueue({ reportId, companyId: active.company_id, userId, uri }));
        if (uris.length) router.push({ pathname: '/report/[id]', params: { id: reportId } });
      }
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      <Stack.Screen options={{ title: bureau?.name ?? 'Büro', headerLargeTitle: false }} />
      <View style={[styles.hero, { backgroundColor: c.deep }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          {active.companies.logo_path ? (
            <View style={styles.logo}>
              <Image source={{ uri: logoUrl(active.companies.logo_path)! }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={[type.small, { color: c.onDeepMuted, fontWeight: '600' }]}>Şu an çalıştığınız firma</Text>
            <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 28, color: c.onDeep }} numberOfLines={1}>
              {active.companies.legal_name}
            </Text>
            <Text style={[type.small, { color: c.onDeepMuted }]}>{`Vergi no ${active.companies.tax_number}`}</Text>
          </View>
          <Pressable onPress={() => router.push('/clients')} style={[styles.switch, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
            <Text style={{ color: c.onDeep, fontWeight: '700' }}>{`Firma değiştir (${firms.length})`}</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: space.xl, marginTop: space.sm }}>
          <Stat value={money(month.reduce((a, r) => a + Number(r.total), 0))} label={`${period.title.replace(' masrafları', '')} toplamı`} />
          <Stat value={String(drafts.length)} label="kayda alınmayı bekleyen" />
          <Stat value={String(booked.length)} label="aktarılmayı bekleyen" />
        </View>
      </View>

      {error && <Notice tone="bad" text={error} />}

      <View style={styles.tiles}>
        {Platform.OS === 'web' ? (
          <Tile icon="inbox" title="Fiş yükle" text="WhatsApp ZIP, fotoğraf, PDF, e-Fatura XML; hepsi bu firmaya girer" primary onPress={() => router.push('/bulk')} />
        ) : (
          <Tile icon="camera" title="Fiş çek" text="Fişler bu firmanın bu ayki kaydına girer" primary onPress={() => capture('camera')} />
        )}
        <Tile icon="gallery" title={Platform.OS === 'web' ? 'Tek tek seç' : 'Galeriden ekle'} text="Birkaç fişi seçip ekleyin" onPress={() => capture('gallery')} />
        <Tile icon="doc" title="Döküm ve aktarım" text="Excel, Luca, Logo dosyası; aktarıldı işareti" onPress={() => router.push('/export')} />
        <Tile icon="receipt" title="Gider grupları" text="Hesap kodları ve kanunen kabul edilmeyen paylar" onPress={() => router.push('/categories')} />
      </View>

      <SectionTitle title="Bu firmanın kayıtları" />
      {reports.length === 0 && !loading ? (
        <Text style={[type.body, { color: c.muted }]}>Henüz fiş yok. "Fiş yükle" ile başlayın.</Text>
      ) : (
        <Group>
          {reports.map((r) => (
            <Row
              key={r.id}
              icon="receipt"
              title={r.title}
              subtitle={<View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><StatusTag status={r.status} /><Text style={[type.small, { color: c.muted }]}>{dateText(r.created_at)}</Text></View>}
              value={money(r.total)}
              onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })}
            />
          ))}
        </Group>
      )}
      <Text style={[type.small, { color: c.muted }]}>
        Büro firmalarında onay yoktur: fişleri kontrol edip "Kayda al" dediğinizde kayıt döküm ve aktarım ekranına düşer.
      </Text>
    </Page>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const c = useColors();
  return (
    <View>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 20, color: c.onDeep }}>{value}</Text>
      <Text style={[type.small, { color: c.onDeepMuted }]}>{label}</Text>
    </View>
  );
}

function Tile({ icon, title, text, onPress, primary }: { icon: IconName; title: string; text: string; onPress: () => void; primary?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { backgroundColor: primary ? c.pen : c.paper, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.tileIcon, { backgroundColor: primary ? 'rgba(255,255,255,0.18)' : c.penSoft }]}>
        <Icon name={icon} size={18} color={primary ? c.onPen : c.pen} />
      </View>
      <Text style={[type.bodyStrong, { color: primary ? c.onPen : c.ink }]}>{title}</Text>
      <Text style={[type.small, { color: primary ? c.onPen : c.muted }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: space.xl, gap: space.sm },
  logo: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: '#FFFFFF', padding: 6 },
  switch: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexGrow: 1, flexBasis: 200, borderRadius: radius.lg, padding: space.lg, gap: 4, minHeight: 116 },
  tileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
});
