// Tanıtım sayfalarının küçük ekran çizimleri: uygulamadaki gerçek kartların sade kopyaları
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { fonts, radius, space, useColors } from '@/constants/theme';
import type { MockKind } from '@/lib/tour';

export function TourMock({ kind }: { kind: MockKind }) {
  const c = useColors();
  const card = [styles.card, { backgroundColor: c.paper, borderColor: c.paperLine }];
  const line = (w: number | `${number}%`, tone?: 'warn') => (
    <View style={[styles.line, { width: w, backgroundColor: tone === 'warn' ? c.amberSoft : c.canvas, borderColor: tone === 'warn' ? c.amber : c.paperLine }]} />
  );
  const btn = (t: string, icon?: IconName, alt?: boolean) => (
    <View style={[styles.btn, { backgroundColor: alt ? c.paper : c.pen, borderColor: alt ? c.paperLine : c.pen }]}>
      {icon ? <Icon name={icon} size={14} color={alt ? c.ink : c.onPen} /> : null}
      <Text style={{ color: alt ? c.ink : c.onPen, fontWeight: '600', fontSize: 14 }}>{t}</Text>
    </View>
  );
  const small = (t: string, color = c.muted) => <Text style={{ fontSize: 13, color }}>{t}</Text>;

  switch (kind) {
    case 'welcome':
      return (
        <View style={card}>
          {['Taslak', 'Onayda', 'Muhasebe', 'Ödendi'].map((s, i) => (
            <View key={s} style={styles.step}>
              <View style={[styles.dot, { backgroundColor: i < 3 ? c.pen : c.paperLine }]}>
                <Text style={{ color: i < 3 ? c.onPen : c.muted, fontSize: 12, fontWeight: '700' }}>{String(i + 1)}</Text>
              </View>
              <Text style={{ color: c.ink, fontWeight: '600' }}>{s}</Text>
            </View>
          ))}
        </View>
      );
    case 'capture':
      return (
        <View style={[styles.card, { backgroundColor: c.deep, borderColor: c.deep }]}>
          <Text style={{ color: c.onDeepMuted, fontSize: 13 }}>Ekim masrafları</Text>
          <Text style={{ color: c.onDeep, fontFamily: fonts.displayHeavy, fontSize: 26 }}>₺1.550,00</Text>
          <View style={[styles.btn, { backgroundColor: c.paper, borderColor: c.paper }]}>
            <Icon name="camera" size={15} color={c.deep} />
            <Text style={{ color: c.deep, fontWeight: '700' }}>Fiş çek</Text>
          </View>
          <View style={[styles.btn, { backgroundColor: 'transparent', borderColor: c.onDeepMuted }]}>
            <Icon name="gallery" size={15} color={c.onDeep} />
            <Text style={{ color: c.onDeep, fontWeight: '600' }}>Galeriden ekle</Text>
          </View>
        </View>
      );
    case 'multi':
      return (
        <View style={[styles.card, { backgroundColor: '#2A2F2D', borderColor: '#2A2F2D', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }]}>
          {[1, 2, 3, 4, 5].map((n) => (
            <View key={n} style={[styles.slip, { transform: [{ rotate: `${(n % 2 ? -1 : 1) * (2 + n)}deg` }] }]}>
              <View style={[styles.badge, { backgroundColor: c.stamp ?? c.pen }]}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{String(n)}</Text>
              </View>
              {[0, 1, 2].map((k) => <View key={k} style={{ height: 3, backgroundColor: '#DADFDD', width: `${90 - k * 15}%` }} />)}
            </View>
          ))}
          <Text style={{ color: '#fff', width: '100%', textAlign: 'center', marginTop: 6, fontSize: 13 }}>5 fiş okundu, 5 ayrı kayıt</Text>
        </View>
      );
    case 'check':
      return (
        <View style={card}>
          {small('Satıcı')}
          {line('100%')}
          {small('Tarih')}
          <View style={[styles.field, { backgroundColor: c.amberSoft, borderColor: c.amber }]}>
            <Text style={{ color: c.amber, fontSize: 13 }}>Okunamadı, fişe bakıp yazın</Text>
          </View>
          {btn('Doğru, sıradaki fiş', 'check')}
        </View>
      );
    case 'track':
      return (
        <View style={card}>
          {[
            ['Gönderildi', true],
            ['Ali Çelik onayladı', true],
            ['Selin Er bekliyor', false],
            ['Muhasebe', false],
          ].map(([t, done], i) => (
            <View key={String(t)} style={styles.step}>
              <View style={[styles.tiny, { backgroundColor: done ? c.pen : i === 2 ? c.amber : c.paperLine }]} />
              <Text style={{ color: done || i === 2 ? c.ink : c.muted, fontWeight: i === 2 ? '700' : '400' }}>{String(t)}</Text>
            </View>
          ))}
          {btn('Onaya gönder', 'send')}
        </View>
      );
    case 'iban':
      return (
        <View style={card}>
          {small('IBAN')}
          <View style={[styles.field, { backgroundColor: c.canvas, borderColor: c.paperLine }]}>
            <Text style={{ color: c.ink, fontFamily: 'monospace', fontSize: 13 }}>TR33 0006 1005 1978 6457 8413 26</Text>
          </View>
          {small('Yalnızca siz, muhasebe ve ödeme yetkilisi görür.')}
        </View>
      );
    case 'approve':
      return (
        <View style={card}>
          <Text style={{ color: c.ink, fontWeight: '700' }}>İzmir fuarı, Veli Mahmut</Text>
          <Row l="Müşteri ağırlama" r="₺1.100,00" c={c} />
          <Row l="Akaryakıt" r="₺450,00" c={c} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>{btn('İade et', 'undo', true)}</View>
            <View style={{ flex: 1.3 }}>{btn('Onayla', 'check')}</View>
          </View>
        </View>
      );
    case 'accounting':
      return (
        <View style={card}>
          <Row l="770.01 Yemek" r="1.000,00" c={c} mono />
          <Row l="191.10 KDV %10" r="100,00" c={c} mono />
          <Row l="335 Personele borçlar" r="1.100,00" c={c} mono />
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {['Excel', 'Logo', 'Luca', 'PDF'].map((x) => (
              <View key={x} style={[styles.chip, { borderColor: c.paperLine }]}><Text style={{ color: c.ink, fontSize: 13 }}>{x}</Text></View>
            ))}
          </View>
        </View>
      );
    case 'pay':
      return (
        <View style={card}>
          <Row l="Veli Mahmut" r="₺1.550,00" c={c} />
          <View style={[styles.field, { backgroundColor: c.canvas, borderColor: c.paperLine, flexDirection: 'row', justifyContent: 'space-between' }]}>
            <Text style={{ color: c.ink, fontFamily: 'monospace', fontSize: 12 }}>TR33 0006 1005 …</Text>
            <Text style={{ color: c.pen, fontWeight: '700', fontSize: 13 }}>Kopyala</Text>
          </View>
          {btn('Ödeme yapıldı', 'check')}
        </View>
      );
    case 'setup':
      return (
        <View style={card}>
          {([
            ['team', 'Ekibi yönet'],
            ['checkCircle', 'Onay zinciri'],
            ['receipt', 'Gider grupları ve sınırlar'],
          ] as [IconName, string][]).map(([i, t]) => (
            <View key={t} style={[styles.step, { paddingVertical: 4 }]}>
              <View style={[styles.ico, { backgroundColor: c.penSoft }]}><Icon name={i} size={15} color={c.pen} /></View>
              <Text style={{ color: c.ink, fontWeight: '600' }}>{t}</Text>
            </View>
          ))}
        </View>
      );
    case 'bureau':
      return (
        <View style={card}>
          <View style={[styles.field, { backgroundColor: c.deep, borderColor: c.deep }]}>
            <Text style={{ color: c.onDeepMuted, fontSize: 12 }}>Çalıştığınız firma</Text>
            <Text style={{ color: c.onDeep, fontWeight: '700' }}>Ege Gıda Dağıtım Ltd.</Text>
          </View>
          <View style={[styles.field, { borderStyle: 'dashed', borderColor: c.paperLine, alignItems: 'center' }]}>
            <Text style={{ color: c.ink, fontWeight: '600' }}>WhatsApp Sohbeti.zip</Text>
            {small('38 belge bulundu')}
          </View>
          {btn('Kayda al', 'check')}
        </View>
      );
  }
}

function Row({ l, r, c, mono }: { l: string; r: string; c: ReturnType<typeof useColors>; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ color: c.muted, fontSize: 14 }}>{l}</Text>
      <Text style={{ color: c.ink, fontWeight: '600', fontSize: 14, fontFamily: mono ? 'monospace' : undefined }}>{r}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 320, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm },
  line: { height: 30, borderRadius: radius.sm, borderWidth: 1 },
  field: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, borderWidth: 1, paddingVertical: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tiny: { width: 10, height: 10, borderRadius: 5, marginLeft: 4 },
  slip: { width: 46, backgroundColor: '#FDFDFB', padding: 6, gap: 4, paddingTop: 12 },
  badge: { position: 'absolute', top: -8, left: -8, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  ico: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
