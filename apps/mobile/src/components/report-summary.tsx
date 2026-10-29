import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { dateText, money } from '@/lib/format';
import { PAYMENT_LABEL } from '@/lib/payment';
import { formatPlate } from '@/lib/plate';
import { DOC_TYPE_LABEL, type Expense } from '@/lib/types';

type Row = Expense & { categories?: { name: string } | null };

/**
 * Onaylayıcı için raporun tek ekranda özeti: gider grubu toplamları ve her fişin ayrıntısı
 * (tarih, satıcı, grup, tutar, KDV, kim ödedi, kimlerle, açıklama, uyarılar). Fotoğraf yok.
 */
export function ReportSummary({ expenses, onOpen }: { expenses: Row[]; onOpen: (id: string) => void }) {
  const c = useColors();
  const total = expenses.reduce((a, e) => a + Number(e.total), 0);
  const byCat = new Map<string, number>();
  for (const e of expenses) {
    const k = e.categories?.name ?? 'Gider grubu seçilmemiş';
    byCat.set(k, (byCat.get(k) ?? 0) + Number(e.total));
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const sorted = [...expenses].sort((a, b) => (a.doc_date ?? '').localeCompare(b.doc_date ?? ''));

  return (
    <View style={{ gap: space.md }}>
      <View style={[styles.box, { backgroundColor: c.paper }]}>
        <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Gider gruplarına göre</Text>
        {cats.map(([name, sum]) => (
          <View key={name} style={{ gap: 4 }}>
            <View style={styles.between}>
              <Text style={[type.body, { color: c.ink }]}>{name}</Text>
              <Text style={[type.amount, { color: c.ink }]}>{money(sum)}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: c.canvas }]}>
              <View style={[styles.bar, { width: `${Math.max(3, total ? (sum / total) * 100 : 0)}%`, backgroundColor: c.pen }]} />
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.box, { backgroundColor: c.paper, paddingVertical: space.sm }]}>
        {sorted.map((e, i) => {
          const warns = (e.expense_flags ?? []).filter((f) => f.severity !== 'info' && f.code !== 'alcohol');
          const vat = (e.expense_vat_lines ?? []).reduce((a, l) => a + Number(l.vat), 0);
          const alcohol =
            e.alcohol_present &&
            (e.alcohol_decision === 'rejected'
              ? `Alkol reddedildi: ${money(Number(e.alcohol_amount ?? 0))} ödenmez`
              : e.alcohol_decision === 'kkeg'
                ? `Alkol ${money(Number(e.alcohol_amount ?? 0))}: ödenir, KKEG`
                : e.alcohol_decision === 'accepted'
                  ? `Alkol ${money(Number(e.alcohol_amount ?? 0))}: normal gider`
                  : `Alkol ${money(Number(e.alcohol_amount ?? 0))}: muhasebe kararı bekliyor`);
          return (
            <Pressable
              key={e.id}
              onPress={() => onOpen(e.id)}
              style={({ pressed }) => [styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.paperLine }, pressed && { opacity: 0.7 }]}>
              <View style={styles.between}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyStrong, { color: c.ink }]} numberOfLines={1}>
                    {e.seller_name || DOC_TYPE_LABEL[e.doc_type] || 'Fiş'}
                  </Text>
                  <Text style={[type.small, { color: c.muted }]}>
                    {[dateText(e.doc_date), e.categories?.name ?? 'Grup seçilmemiş', DOC_TYPE_LABEL[e.doc_type]].filter(Boolean).join(', ')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink }}>{money(e.total)}</Text>
                  {vat > 0 ? <Text style={[type.small, { color: c.faint }]}>{`KDV ${money(vat)}`}</Text> : null}
                </View>
              </View>
              <View style={styles.facts}>
                <Fact label="Kim ödedi" value={PAYMENT_LABEL[e.payment_method] ?? 'Kendi cebinden'} />
                {e.attendees?.length ? <Fact label="Kimlerle" value={e.attendees.join(', ')} /> : null}
                {e.plate ? <Fact label="Plaka" value={formatPlate(e.plate)} /> : null}
                {e.description ? <Fact label="Açıklama" value={e.description} /> : null}
              </View>
              {alcohol ? <Text style={[type.small, { color: e.alcohol_decision === 'rejected' ? c.red : c.amber, fontWeight: '600' }]}>{alcohol}</Text> : null}
              {warns.map((f) => (
                <Text key={f.id} style={[type.small, { color: f.severity === 'critical' ? c.red : c.amber }]}>
                  {f.message}
                </Text>
              ))}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <Text style={[type.small, { color: c.ink }]}>
      <Text style={{ color: c.muted }}>{`${label}: `}</Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  item: { paddingVertical: space.md, gap: 6 },
  facts: { gap: 2 },
});
