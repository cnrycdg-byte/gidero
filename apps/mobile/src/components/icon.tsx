import { SymbolView, type SFSymbol, type AndroidSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';

// Uygulamadaki ikonlar: iOS'ta SF Symbols, Android'de Material Symbols
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
} satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: ColorValue }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} resizeMode="scaleAspectFit" />;
}
