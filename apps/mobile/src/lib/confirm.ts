import { Alert, Platform } from 'react-native';

/** Onay sorusu: telefonda yerel uyarı penceresi, web'de tarayıcı onayı */
export function confirm(title: string, message: string, okText: string, onOk: () => void, destructive = true) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: okText, style: destructive ? 'destructive' : 'default', onPress: onOk },
  ]);
}
