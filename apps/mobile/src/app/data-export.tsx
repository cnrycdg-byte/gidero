import { Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Notice } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { buildArchive } from '@/lib/archive';
import { saveFile } from '@/lib/download';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';

/** Şirketin bütün verisini indirme: Excel + fiş görselleri tek ZIP */
export default function DataExport() {
  const c = useColors();
  const { active, hasRole } = useSession();
  const [images, setImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const allowed = hasRole('admin') || hasRole('accountant');

  async function run() {
    if (!active) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const a = await buildArchive(active.company_id, active.companies.legal_name, setProgress, images);
      await saveFile(a.filename, 'application/zip', a.bytes);
      setDone(`${a.counts.reports} rapor ve ${a.counts.expenses} fiş indirildi (${a.filename}).`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Page>
      <Stack.Screen options={{ title: 'Verilerimi indir' }} />
      {!allowed ? (
        <Notice text="Şirketin bütün verisini şirket yöneticisi ya da muhasebeci indirebilir." />
      ) : (
        <View style={[styles.box, { backgroundColor: c.paper }]}>
          <Text style={[type.body, { color: c.ink }]}>
            {`${active?.companies.legal_name ?? 'Şirket'} için bütün raporlar, fişler, KDV satırları, uyarılar ve onay geçmişi tek bir Excel dosyasında; istenirse fiş görselleri de rapor klasörlerinde, hepsi tek ZIP dosyası olarak iner.`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text style={[type.body, { color: c.ink, flex: 1 }]}>Fiş görsellerini de ekle</Text>
            <Switch value={images} onValueChange={setImages} />
          </View>
          {Platform.OS !== 'web' && <Notice tone="warn" text="Fiş görselleriyle birlikte dosya büyük olabilir; bilgisayardan indirmeniz daha rahat olur." />}
          {progress && <Notice text={progress} />}
          {error && <Notice tone="bad" text={error} />}
          {done && <Notice tone="ok" text={done} />}
          <Button icon="inbox" title="ZIP dosyasını indir" onPress={run} loading={busy} />
        </View>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
});
