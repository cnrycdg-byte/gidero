import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Children, Fragment, isValidElement, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View, type LayoutChangeEvent, type TextInputProps, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import Svg, { Path } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icon';
import { useWide } from '@/lib/layout';
import { fonts, hit, radius, space, systemFont, type, useColors, type Palette } from '@/constants/theme';
import { STATUS_LABEL, type ReportStatus } from '@/lib/types';

/* ------------------------------------------------------------------ */
/* Fiş kâğıdı: alt kenarı yırtık (zikzak) beyaz kart — Gidero'nun imzası */
/* ------------------------------------------------------------------ */

function Zigzag({ color, width }: { color: string; width: number }) {
  const tooth = 12;
  const h = 7;
  const n = Math.ceil(width / tooth);
  let d = `M0 0 `;
  for (let i = 0; i < n; i++) {
    d += `L${i * tooth + tooth / 2} ${h} L${(i + 1) * tooth} 0 `;
  }
  d += `L${n * tooth} 0 Z`;
  return (
    <Svg width={width} height={h} style={{ marginTop: -0.5 }}>
      <Path d={d} fill={color} />
    </Svg>
  );
}

export function Slip({ children, style, tone = 'paper' }: { children: ReactNode; style?: ViewStyle; tone?: 'paper' | 'deep' }) {
  const c = useColors();
  const [w, setW] = useState(0);
  const bg = tone === 'deep' ? c.deep : c.paper;
  return (
    <View style={style} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      <View style={[styles.slip, { backgroundColor: bg }]}>{children}</View>
      {w > 0 && <Zigzag color={bg} width={w} />}
    </View>
  );
}

/** Fiş üzerindeki kesik çizgi */
export function Perforation({ color }: { color?: string }) {
  const c = useColors();
  return (
    <View style={{ borderBottomWidth: 1, borderStyle: 'dashed', borderColor: color ?? c.paperLine, marginVertical: space.sm }} />
  );
}

/* ---------------------------- Listeler ----------------------------- */

/** Gruplu liste başlığı: Headline, birincil yazı rengi (Lists and tables > Style: grouped style uses headers) */
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionTitle}>
      <Text accessibilityRole="header" style={[type.section, { color: c.ink }]}>{title}</Text>
      {action}
    </View>
  );
}

/**
 * Inset grouped liste (iOS Ayarlar gibi). Lists and tables > "Prefer displaying text in a list or table";
 * Style: "the grouped style uses headers, footers, and additional space to separate groups of data".
 * Arka plan secondarySystemGroupedBackground, ayraç opaqueSeparator (Color > iOS, iPadOS).
 */
export function Group({ children }: { children: ReactNode }) {
  const c = useColors();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, { backgroundColor: c.paper }]}>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={[styles.separator, { backgroundColor: c.paperLine }]} />}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

type RowProps = {
  title: string;
  subtitle?: ReactNode;
  value?: string;
  valueTone?: 'ink' | 'muted';
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  right?: ReactNode;
  /** Simge yerine solda gösterilecek öğe (örneğin şirket logosu) */
  left?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
};

export function Row({ title, subtitle, value, valueTone = 'ink', icon, iconColor, iconBg, right, left, onPress, chevron }: RowProps) {
  const c = useColors();
  const wide = useWide();
  const body = (
    <View style={[styles.row, wide && { paddingVertical: 9 }]}>
      {left}
      {!left && icon && (
        <View style={[styles.rowIcon, { backgroundColor: iconBg ?? c.penSoft }]}>
          <Icon name={icon} size={16} color={iconColor ?? c.pen} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        {/* Satır başlığı Body (17 pt), ikinci satır Footnote secondaryLabel (Typography > Specifications) */}
        <Text style={[type.body, { color: c.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {typeof subtitle === 'string' ? (
          <Text style={[type.small, { color: c.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
      </View>
      {value != null && <Text style={[type.amount, { color: valueTone === 'ink' ? c.ink : c.muted }]}>{value}</Text>}
      {right}
      {/* Alt sayfaya giden satırda açılma oku (Lists and tables > "use a disclosure indicator") */}
      {(chevron ?? !!onPress) && <Icon name="chevron" size={13} color={c.faint} />}
    </View>
  );
  if (!onPress) return body;
  return (
    // Seçimde kısa vurgu (Lists and tables > "Provide appropriate feedback when people select a list item")
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? c.fill : 'transparent' })}>
      {body}
    </Pressable>
  );
}

/* ----------------------------- Durum ------------------------------- */

export function statusColors(c: Palette, s: ReportStatus) {
  if (s === 'approved' || s === 'booked' || s === 'exported') return { fg: c.stamp, bg: c.stampSoft };
  if (s === 'paid') return { fg: c.pen, bg: c.penSoft };
  if (s === 'pending') return { fg: c.pen, bg: c.penSoft };
  if (s === 'returned') return { fg: c.red, bg: c.redSoft };
  return { fg: c.muted, bg: c.canvas };
}

/** Küçük durum etiketi: renkli nokta + yazı */
export function StatusTag({ status }: { status: ReportStatus }) {
  const c = useColors();
  const { fg } = statusColors(c, status);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: fg }} />
      <Text style={[type.small, { color: fg, fontWeight: '600' }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

/** Rapor ekranındaki mühür: çerçeveli, hafif eğik */
export function Stamp({ status }: { status: ReportStatus }) {
  const c = useColors();
  const { fg } = statusColors(c, status);
  return (
    <View style={[styles.stamp, { borderColor: fg }]}>
      <Text style={{ color: fg, fontFamily: fonts.display, fontSize: 14, letterSpacing: 0.2 }}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

/* ---------------------------- Düğmeler ----------------------------- */

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'plain' | 'light' | 'ghostLight';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'regular' | 'large';
  style?: ViewStyle;
};

/**
 * Düğmeler (Buttons): en olası eylem için belirgin (accent dolgulu) stil; ekranda bir ya da iki tane.
 * Seçenekler arasında fark boyutla değil stille verilir. Dokunma alanı en az 44x44 pt, basılma hâli vardır.
 * Yıkıcı eylem sistem kırmızısıyla gösterilir, ana (primary) rol verilmez.
 */
export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, size = 'regular', style }: ButtonProps) {
  const c = useColors();
  const wide = useWide();
  const look = buttonLook(c, variant);
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (variant === 'primary') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        size === 'large' && { minHeight: 56 },
        // Bilgisayarda düğme yazısı kadar geniş; satırın tamamını kaplamaz
        wide && { minHeight: hit, alignSelf: 'flex-start', paddingHorizontal: 18 },
        { backgroundColor: look.bg, opacity: off ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {icon && <Icon name={icon} size={size === 'large' ? 20 : 17} color={look.fg} />}
          <Text style={{ color: look.fg, fontSize: wide ? 15 : 17, fontWeight: '600' }}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

function buttonLook(c: Palette, v: ButtonProps['variant']) {
  switch (v) {
    case 'secondary':
      return { bg: c.fill, fg: c.pen }; // gri dolgulu, accent yazılı (bordered)
    case 'danger':
      return { bg: c.redSoft, fg: c.red }; // systemRed (Buttons > Role: destructive)
    case 'plain':
      return { bg: 'transparent', fg: c.pen };
    case 'light':
      return { bg: '#FFFFFF', fg: c.deep };
    case 'ghostLight':
      return { bg: 'rgba(255,255,255,0.12)', fg: '#FFFFFF' };
    default:
      return { bg: c.pen, fg: c.onPen };
  }
}

/* ----------------------------- Form -------------------------------- */

export function Field({ label, hint, missing, ...props }: TextInputProps & { label: string; hint?: string; missing?: boolean }) {
  const c = useColors();
  const wide = useWide();
  const [focus, setFocus] = useState(false);
  // missing: fişten okunamayan alan; turuncu zeminle elle girilmesi istenir
  return (
    <View style={{ gap: 6, maxWidth: wide ? 560 : undefined, width: '100%' }}>
      <Text style={[type.small, { color: missing ? c.amber : c.muted, fontWeight: '600' }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.faint}
        {...props}
        onFocus={(e) => {
          setFocus(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          { color: c.ink, backgroundColor: missing ? c.amberSoft : c.fill, borderColor: focus ? c.pen : missing ? c.amber : 'transparent' },
          wide && { paddingVertical: 9, fontSize: 15 },
          props.editable === false && { opacity: 0.7 },
          props.multiline && { minHeight: 84, textAlignVertical: 'top' },
          props.style,
        ]}
      />
      {missing && !hint ? <Text style={[type.small, { color: c.amber }]}>Okunamadı, fişe bakıp elle yazın.</Text> : null}
      {hint ? <Text style={[type.small, { color: missing ? c.amber : c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

/* ---------------------------- Bildirim ----------------------------- */

/**
 * Bilgi ve uyarı kutusu. Anlam yalnızca renkle verilmez: her tonun kendi SF Symbol'ü vardır
 * (Color > Inclusive color; Accessibility > "Convey information with more than color alone").
 * Yazı birincil renktedir; renk ikon ve zeminde kalır (küçük metinde 4,5:1 karşıtlık).
 */
export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'bad' | 'ok' }) {
  const c = useColors();
  const map = {
    info: { bg: c.penSoft, fg: c.pen, icon: 'info' as IconName },
    warn: { bg: c.amberSoft, fg: c.amber, icon: 'warning' as IconName },
    bad: { bg: c.redSoft, fg: c.red, icon: 'error' as IconName },
    ok: { bg: c.stampSoft, fg: c.stamp, icon: 'checkCircle' as IconName },
  }[tone];
  // Paket sınırı uyarılarında doğrudan paket satın alma ekranına git
  // Telefonda satın alma yönlendirmesi yok (mağaza kuralı); yalnızca web panelinde gösterilir
  const upgrade = Platform.OS === 'web' && (tone === 'bad' || tone === 'warn') && /paket(inizi|i)\s+(büyüt|yenile)/i.test(text);
  return (
    <View style={[styles.notice, { backgroundColor: map.bg, alignItems: upgrade ? 'center' : 'flex-start' }]}>
      <Icon name={map.icon} size={16} color={map.fg} />
      <Text style={[type.subhead, { color: c.ink, flex: 1 }]}>{text}</Text>
      {upgrade && (
        <Pressable
          onPress={() => router.push('/subscription')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.upgrade, { backgroundColor: map.fg, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: fonts.semibold }}>Paketi büyüt</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Empty({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.paper }]}>
        <Icon name={icon} size={26} color={c.pen} />
      </View>
      <Text style={[type.bodyStrong, { color: c.ink, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.small, { color: c.muted, textAlign: 'center', maxWidth: 280 }]}>{text}</Text>
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.canvas }}>
      <ActivityIndicator color={c.pen} />
    </View>
  );
}

const styles = StyleSheet.create({
  slip: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.xl,
    paddingBottom: space.lg,
    gap: space.xs,
    ...Platform.select({
      ios: { shadowColor: '#0B1220', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      default: {},
    }),
  },
  sectionTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    marginTop: space.sm,
    minHeight: hit,
  },
  group: { borderRadius: radius.md, overflow: 'hidden' },
  // Ayraç yazının başladığı yerden başlar (16 kenar + 30 ikon + 12 boşluk)
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  // Satır en az 44 pt (Buttons > Best practices: hit region 44x44 pt), kenar boşluğu 16 pt
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 11, minHeight: hit + 8 },
  rowIcon: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  stamp: {
    borderWidth: 2,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    transform: [{ rotate: '-4deg' }],
  },
  // iOS 26 düğmeleri kapsül biçimindedir; yükseklik 50 pt (en az 44 pt)
  button: {
    minHeight: 50,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  input: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, minHeight: hit, fontSize: 17, fontFamily: systemFont },
  upgrade: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  notice: { borderRadius: radius.md, padding: space.md, flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
});
