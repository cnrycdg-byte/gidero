// Web'de sekme çubuğu yok: geniş ekranda soldaki menü, dar ekranda sağ üstteki Hesabım düğmesi kullanılır.
// (expo-router'ın web sekmeleri bütün sekmeleri aynı anda açtığı için Slot tercih edildi.)
import { Slot } from 'expo-router';

export default function TabLayoutWeb() {
  return <Slot />;
}
