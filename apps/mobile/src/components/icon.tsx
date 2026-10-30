import { SymbolView, type SFSymbol, type AndroidSymbol } from 'expo-symbols';
import { Platform, Text, type ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Uygulamadaki ikonlar: iOS'ta SF Symbols, Android'de Material Symbols.
// HIG SF Symbols: liste ve araç çubuklarında yazının yanında çizgi (outline) varyant,
// seçim ve sekme çubuğunda dolu (fill) varyant ("an iOS tab bar prefers the fill variant").
// Tanıdık eylemlere tanıdık semboller (Buttons > Content): paylaş, sil, ekle, geri al.
const ICONS = {
  camera: { ios: 'camera.fill', android: 'photo_camera' },
  gallery: { ios: 'photo.on.rectangle', android: 'photo_library' },
  settings: { ios: 'gearshape', android: 'settings' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  error: { ios: 'exclamationmark.circle.fill', android: 'error' },
  flashOn: { ios: 'bolt.fill', android: 'flash_on' },
  flashOff: { ios: 'bolt.slash', android: 'flash_off' },
  close: { ios: 'xmark', android: 'close' },
  check: { ios: 'checkmark', android: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  team: { ios: 'person.2', android: 'group' },
  personAdd: { ios: 'person.badge.plus', android: 'person_add' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  trash: { ios: 'trash', android: 'delete' },
  plus: { ios: 'plus', android: 'add' },
  receipt: { ios: 'receipt', android: 'receipt_long' },
  doc: { ios: 'doc.text', android: 'description' },
  clock: { ios: 'clock', android: 'schedule' },
  send: { ios: 'paperplane.fill', android: 'send' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo' },
  inbox: { ios: 'tray.full', android: 'inbox' },
  info: { ios: 'info.circle.fill', android: 'info' },
  bell: { ios: 'bell', android: 'notifications' },
  bellFill: { ios: 'bell.fill', android: 'notifications_active' },
  person: { ios: 'person.crop.circle', android: 'account_circle' },
  creditcard: { ios: 'creditcard', android: 'credit_card' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  printer: { ios: 'printer', android: 'print' },
  building: { ios: 'building.2', android: 'apartment' },
  chart: { ios: 'chart.bar', android: 'bar_chart' },
  feedback: { ios: 'bubble.left.and.text.bubble.right', android: 'feedback' },
} satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

// Web'de SF Symbols kullanılamaz (yalnızca Apple platformlarında lisanslıdır; HIG SF Symbols > terms and conditions);
// orada basit karakterler kullanılır
const WEB_GLYPH: Partial<Record<IconName, string>> = {
  chevron: '›', check: '✓', checkCircle: '✓', close: '✕', plus: '+', warning: '!', error: '!', camera: '◉',
  gallery: '▦', settings: '⚙', team: '◎', personAdd: '+', logout: '⏻', trash: '✕', receipt: '▤', doc: '▤',
  clock: '◷', send: '➤', undo: '↺', inbox: '▣', flashOn: 'ϟ', flashOff: 'ϟ', info: 'i', bell: '◔', person: '◉',
  creditcard: '▭', share: '⇪', printer: '⎙', building: '▥', chart: '▮', feedback: '✎',
};

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: ColorValue }) {
  if (Platform.OS === 'web') {
    // Zil web'de de zil gibi görünsün diye çizilir (SF Symbols "bell" biçimine yakın)
    if (name === 'bell' || name === 'bellFill') {
      const fill = name === 'bellFill';
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 2.7A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.7L18 12.6V9a6 6 0 0 0-6-6Z"
            fill={fill ? (color as string) : 'none'}
            stroke={color as string}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Path d="M9.8 19.2a2.3 2.3 0 0 0 4.4 0" fill="none" stroke={color as string} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
      );
    }
    return (
      <Text style={{ color, fontSize: size * 0.9, lineHeight: size, width: size, textAlign: 'center', fontWeight: '700' }}>
        {WEB_GLYPH[name] ?? '•'}
      </Text>
    );
  }
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} resizeMode="scaleAspectFit" />;
}
