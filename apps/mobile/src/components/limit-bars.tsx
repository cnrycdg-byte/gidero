import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { radius, space, type, useColors } from '@/constants/theme';
import { money } from '@/lib/format';
import { PERIOD_LABEL, rangeText, usageState, type Usage } from '@/lib/limits';

/** Gider grubu sınırları: kullanılan / sınır çubuğu; aşımda kırmızı, %90 üstünde turuncu */
export function LimitBars({ rows }: { rows: Usage[] }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.paper, borderRadius: radius.lg, padding: space.lg, gap: space.lg }}>
      {rows.map((u) => {
        const s = usageState(u);
        const color = s.over ? c.red : s.near ? c.amber : c.pen;
        return (
          <View key={`${u.user_id}-${u.category_id}`} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md }}>
              <Text style={[type.bodyStrong, { color: c.ink, flexShrink: 1 }]} numberOfLines={1}>
                {u.category_name}
              </Text>
              <Text style={[type.amount, { color: s.over ? c.red : c.ink }]}>
                {money(u.used)} <Text style={[type.small, { color: c.muted }]}>/ {money(u.limit_amount)}</Text>
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.canvas, overflow: 'hidden' }}>
              <View style={{ height: 8, borderRadius: 4, width: `${Math.min(100, Math.max(3, s.ratio * 100))}%`, backgroundColor: color }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
              <Text style={[type.small, { color: c.muted }]}>
                {PERIOD_LABEL[u.limit_period]}, {rangeText(u.period_start, u.period_end)}
              </Text>
              {s.over ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="warning" size={12} color={c.red} />
                  <Text style={[type.small, { color: c.red, fontWeight: '700' }]}>{money(-s.remaining)} aşıldı</Text>
                </View>
              ) : (
                <Text style={[type.small, { color: s.near ? c.amber : c.muted, fontWeight: s.near ? '600' : '400' }]}>
                  {money(s.remaining)} kaldı
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
