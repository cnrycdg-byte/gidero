import { router, usePathname, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Logo } from '@/components/logo';
import { Text } from '@/components/text';
import { fonts, radius, space, useColors, useScheme } from '@/constants/theme';
import { logoUrl } from '@/lib/brand';
import { useSession } from '@/lib/session';

type Item = { href: string; label: string; icon: IconName };

/** Bilgisayarda soldaki menü: kişinin rolüne göre ekranlar, üstte çalışılan firma, altta hesap. */
export function Sidebar() {
  const c = useColors();
  const scheme = useScheme();
  const path = usePathname();
  const { session, active, bureaus, platformAdmin, hasRole } = useSession();
  const bureauFirm = !!active?.bureau_account_id && !active.roles.includes('employee');

  const groups: { title?: string; items: Item[] }[] = [];
  if (bureauFirm) {
    groups.push({
      items: [
        { href: '/', label: 'Firma ekranı', icon: 'doc' },
        { href: '/bulk', label: 'Fiş yükle', icon: 'inbox' },
        { href: '/export', label: 'Döküm ve aktarım', icon: 'receipt' },
        { href: '/categories', label: 'Gider grupları', icon: 'receipt' },
      ],
    });
  } else if (active) {
    const main: Item[] = [{ href: '/', label: 'Raporlarım', icon: 'receipt' }];
    if (hasRole('approver') || hasRole('admin')) main.push({ href: '/approvals', label: 'Onayımı bekleyenler', icon: 'checkCircle' });
    if (hasRole('accountant')) main.push({ href: '/accounting', label: 'Muhasebe masası', icon: 'inbox' });
    if (hasRole('accountant')) main.push({ href: '/bulk', label: 'Toplu yükleme', icon: 'gallery' });
    if (hasRole('payer')) main.push({ href: '/payments', label: 'Ödemeler', icon: 'receipt' });
    groups.push({ items: main });
    const admin: Item[] = [];
    if (hasRole('admin'))
      admin.push(
        { href: '/team', label: 'Ekip', icon: 'team' },
        { href: '/approval-flow', label: 'Onay zinciri', icon: 'checkCircle' },
        { href: '/brand', label: 'Logo ve renkler', icon: 'settings' },
      );
    if (hasRole('admin') || hasRole('accountant')) admin.push({ href: '/categories', label: 'Gider grupları', icon: 'receipt' });
    if (hasRole('admin') || hasRole('accountant') || hasRole('approver')) admin.push({ href: '/limits', label: 'Sınır durumu', icon: 'warning' });
    if (admin.length) groups.push({ title: 'Şirket', items: admin });
  }
  if (bureaus.length) groups.push({ title: 'Büro', items: [{ href: '/clients', label: 'Müşteri firmalar ve ekip', icon: 'team' }] });
  if (platformAdmin)
    groups.push({
      title: 'Gidero',
      items: [
        { href: '/admin', label: 'Yönetim paneli', icon: 'settings' },
        { href: '/test', label: 'Test sürüşü', icon: 'team' },
      ],
    });

  const branded = !!active?.companies.brand_primary;
  const bg = scheme === 'dark' && !branded ? '#0C1A17' : c.deep;
  const logo = logoUrl(active?.companies.logo_path);
  const name = String(session?.user.user_metadata?.full_name || session?.user.email || '');
  const isOn = (h: string) => (h === '/' ? path === '/' : path === h || path.startsWith(`${h}/`));

  return (
    <View style={[styles.rail, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Pressable onPress={() => router.navigate('/')} style={{ paddingVertical: space.xs }}>
          <Logo size={26} color="#FFFFFF" />
        </Pressable>
        {active || bureaus.length ? (
          <Pressable
            onPress={() => router.push(bureaus.length ? '/clients' : '/settings')}
            style={({ pressed }) => [styles.firm, { backgroundColor: pressed ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)' }]}>
            {logo ? (
              <View style={styles.firmLogo}>
                <Image source={{ uri: logo }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
              </View>
            ) : null}
            <Text style={styles.firmLabel}>{bureauFirm ? 'Çalıştığınız firma' : bureaus.length && !active ? 'Büro' : 'Şirket'}</Text>
            <Text style={styles.firmName} numberOfLines={2}>
              {active?.companies.legal_name ?? bureaus[0]?.name}
            </Text>
            <Text style={styles.firmHint}>{bureaus.length ? 'Firma değiştir' : 'Şirket değiştir'}</Text>
          </Pressable>
        ) : null}
        {groups.map((g, i) => (
          <View key={i} style={{ gap: 2 }}>
            {g.title && <Text style={styles.group}>{g.title}</Text>}
            {g.items.map((it) => {
              const on = isOn(it.href);
              return (
                <Pressable
                  key={it.href + it.label}
                  onPress={() => router.navigate(it.href as Href)}
                  style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                    styles.item,
                    { backgroundColor: on ? '#FFFFFF' : pressed || hovered ? 'rgba(255,255,255,0.10)' : 'transparent' },
                  ]}>
                  <Icon name={it.icon} size={15} color={on ? c.deep : 'rgba(255,255,255,0.75)'} />
                  <Text style={[styles.itemText, { color: on ? c.deep : '#FFFFFF', fontFamily: on ? fonts.semibold : fonts.medium }]}>{it.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={styles.bottom}>
        <Pressable onPress={() => router.push('/notifications')} style={styles.item}>
          <Icon name="inbox" size={15} color="rgba(255,255,255,0.75)" />
          <Text style={[styles.itemText, { color: '#FFFFFF' }]}>Bildirimler</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/profile')} style={[styles.me, isOn('/profile') && { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
          <View style={styles.avatar}>
            <Text style={{ color: c.deep, fontFamily: fonts.bold, fontSize: 12 }}>
              {name
                .split(/[\s@.]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]!.toLocaleUpperCase('tr-TR'))
                .join('')}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 13 }} numberOfLines={1}>{name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Hesabım</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  firmLogo: { height: 44, borderRadius: 8, backgroundColor: '#FFFFFF', padding: 6, marginBottom: 6 },
  rail: { width: 248, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(0,0,0,0.2)' },
  firm: { borderRadius: radius.md, padding: space.md, gap: 2 },
  firmLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  firmName: { color: '#FFFFFF', fontFamily: fonts.display, fontSize: 16, lineHeight: 20 },
  firmHint: { color: '#F2A93B', fontSize: 12, fontFamily: fonts.semibold, marginTop: 2 },
  group: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: fonts.semibold, paddingHorizontal: space.sm, marginBottom: 4, marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.sm, paddingVertical: 8, borderRadius: radius.sm },
  itemText: { fontSize: 14 },
  bottom: { padding: space.md, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  me: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: space.sm, borderRadius: radius.md },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F2A93B', alignItems: 'center', justifyContent: 'center' },
});
