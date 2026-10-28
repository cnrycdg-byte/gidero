import { useState } from 'react';
import { Linking, Platform, Share, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';

/** Davet bağlantısı: kopyala ya da WhatsApp'tan gönder. Bağlantı 1 saat geçerlidir. */
export function InviteLink({ link, name, onClose }: { link: string; name: string; onClose?: () => void }) {
  const c = useColors();
  const [copied, setCopied] = useState(false);
  const message = `Merhaba ${name}, Gidero'da masraflarınızı girebilmeniz için hesabınız açıldı. Bu bağlantıya dokunup şifrenizi belirleyin: ${link}`;

  async function copy() {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(message).catch(() => {});
      setCopied(true);
      return;
    }
    await Share.share({ message }).catch(() => {});
  }

  return (
    <View style={[styles.box, { backgroundColor: c.penSoft }]}>
      <Text style={[type.bodyStrong, { color: c.ink }]}>{`${name} için giriş bağlantısı`}</Text>
      <Text style={[type.small, { color: c.muted }]}>
        Bu bağlantıyı kişiye WhatsApp'tan ya da e-postayla iletin; tıklayınca kendi şifresini belirler. Bağlantı 1 saat geçerlidir, süresi geçerse yenisini oluşturun.
      </Text>
      <Text selectable style={[type.small, { color: c.ink }]} numberOfLines={2}>{link}</Text>
      <View style={styles.row}>
        <Button title="WhatsApp ile gönder" onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`)} />
        <Button variant="secondary" title={copied ? 'Kopyalandı' : Platform.OS === 'web' ? 'Mesajı kopyala' : 'Paylaş'} onPress={copy} />
        {onClose && <Button variant="plain" title="Kapat" onPress={onClose} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
