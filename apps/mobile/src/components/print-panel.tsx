// Raporu fiş görselleriyle yazdırma ve PDF: görseller A4'e olabildiğince çok sığdırılır (kâğıt tasarrufu).
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Notice, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import type { Density } from '@/lib/print/layout';
import { printReport, shareReportPdf } from '@/lib/print/report-print';
import { errorText } from '@/lib/supabase';

const OPTIONS: { key: Density; label: string; hint: string }[] = [
  { key: 'tight', label: 'Sıkı', hint: 'Bir A4 sayfaya 8-12 yazar kasa fişi; en az kâğıt.' },
  { key: 'normal', label: 'Orta', hint: 'Bir A4 sayfaya 6-9 fiş; yazılar daha büyük.' },
  { key: 'large', label: 'Büyük', hint: 'Bir A4 sayfaya 2-4 fiş; soluk fişler ve faturalar için.' },
];

export function PrintPanel({ reportId, receiptCount }: { reportId: string; receiptCount: number }) {
  const c = useColors();
  const [density, setDensity] = useState<Density>('tight');
  const [busy, setBusy] = useState<null | 'pdf' | 'print'>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const web = Platform.OS === 'web';

  async function run(kind: 'pdf' | 'print') {
    setBusy(kind);
    setError(null);
    try {
      await (kind === 'pdf' ? shareReportPdf : printReport)(reportId, density, setStatus);
      setStatus(web ? 'Yazdırma penceresi açıldı. PDF için Hedef olarak "PDF olarak kaydet"i seçin.' : null);
    } catch (e) {
      setStatus(null);
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const hint = OPTIONS.find((o) => o.key === density)!.hint;
  return (
    <View style={{ gap: space.sm }}>
      <SectionTitle title="Yazdır ve PDF" />
      <Text style={[type.small, { color: c.muted }]}>
        {`Rapor özeti, onay geçmişi ve ${receiptCount} fişin görseli. Görseller tablodaki numaralarla basılır.`}
      </Text>
      <View style={styles.seg} accessibilityRole="radiogroup">
        {OPTIONS.map((o) => {
          const on = o.key === density;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => setDensity(o.key)}
              style={[styles.opt, { backgroundColor: on ? c.pen : c.paper, borderColor: on ? c.pen : c.paperLine }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[type.small, { color: c.muted }]}>{hint}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button variant="secondary" icon="doc" title={web ? 'PDF indir' : 'PDF paylaş'} onPress={() => run('pdf')} loading={busy === 'pdf'} disabled={!!busy} style={{ flex: 1 }} />
        <Button variant="secondary" icon="receipt" title="Yazdır" onPress={() => run('print')} loading={busy === 'print'} disabled={!!busy} style={{ flex: 1 }} />
      </View>
      {status ? <Text style={[type.small, { color: c.muted }]}>{status}</Text> : null}
      {error ? <Notice tone="bad" text={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', gap: space.sm },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.md, borderWidth: 1 },
});
