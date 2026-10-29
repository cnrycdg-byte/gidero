import { useState } from 'react';
import { Linking, Platform, Share, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Field, Notice } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { randomPassword, setTempPassword } from '@/lib/people';
import { errorText } from '@/lib/supabase';

const APP_URL = 'https://gidero.expo.app';

async function copy(text: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text).catch(() => {});
    return true;
  }
  await Share.share({ message: text }).catch(() => {});
  return false;
}

/** Mesajı WhatsApp, e-posta ya da SMS ile gönderme düğmeleri (kişinin kendi uygulamasından gider) */
function SendButtons({ message, subject, email, phone }: { message: string; subject: string; email?: string; phone?: string }) {
  const [copied, setCopied] = useState(false);
  const sms = Platform.OS === 'ios' ? `sms:${phone ?? ''}&body=${encodeURIComponent(message)}` : `sms:${phone ?? ''}?body=${encodeURIComponent(message)}`;
  return (
    <View style={styles.row}>
      <Button title="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${(phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(message)}`)} />
      <Button variant="secondary" title="E-posta" onPress={() => Linking.openURL(`mailto:${email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`)} />
      <Button variant="secondary" title="SMS" onPress={() => Linking.openURL(sms)} />
      <Button variant="secondary" title={copied ? 'Kopyalandı' : Platform.OS === 'web' ? 'Kopyala' : 'Paylaş'} onPress={async () => setCopied(await copy(message))} />
    </View>
  );
}

/** Davet bağlantısı: WhatsApp, e-posta, SMS ya da kopyala. Bağlantı 1 saat geçerlidir. */
export function InviteLink({ link, name, email, phone, onClose }: { link: string; name: string; email?: string; phone?: string; onClose?: () => void }) {
  const c = useColors();
  const message = `Merhaba ${name}, Gidero'da hesabınız açıldı. Bu bağlantıya dokunup şifrenizi belirleyin (1 saat geçerli): ${link}`;
  return (
    <View style={[styles.box, { backgroundColor: c.penSoft }]}>
      <Text style={[type.bodyStrong, { color: c.ink }]}>{`${name} için giriş bağlantısı`}</Text>
      <Text style={[type.small, { color: c.muted }]}>
        Aşağıdan seçtiğiniz yolla gönderin; mesaj sizin WhatsApp'ınızdan, e-postanızdan ya da telefonunuzdan gider. Kişi bağlantıya dokunup kendi şifresini belirler. Süresi geçerse yenisini oluşturun.
      </Text>
      <Text selectable style={[type.small, { color: c.ink }]} numberOfLines={2}>{link}</Text>
      <SendButtons message={message} subject="Gidero hesabınız açıldı" email={email} phone={phone} />
      {onClose && <Button variant="plain" title="Kapat" onPress={onClose} />}
    </View>
  );
}

/** Yönetici kişinin geçici şifresini belirler; kişi ilk girişte kendi şifresini koyar. */
export function TempPassword({
  name,
  userId,
  companyId,
  accountId,
  phone,
  onDone,
}: {
  name: string;
  userId: string;
  companyId?: string;
  accountId?: string;
  phone?: string;
  onDone?: () => void;
}) {
  const c = useColors();
  const [pw, setPw] = useState(randomPassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await setTempPassword({ companyId, accountId, userId, password: pw });
      setDone({ email: r.email, password: pw });
      onDone?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const message = `Merhaba ${name}, Gidero hesabınız hazır.\nAdres: ${APP_URL}\nE-posta: ${done.email}\nGeçici şifre: ${done.password}\nİlk girişte kendi şifrenizi belirleyeceksiniz.`;
    return (
      <View style={[styles.box, { backgroundColor: c.penSoft }]}>
        <Text style={[type.bodyStrong, { color: c.ink }]}>{`${name} için geçici şifre hazır`}</Text>
        <Text selectable style={[type.body, { color: c.ink }]}>{`E-posta: ${done.email}\nGeçici şifre: ${done.password}`}</Text>
        <Text style={[type.small, { color: c.muted }]}>Bu bilgileri kişiye iletin. İlk girişte kendi şifresini koymadan devam edemez.</Text>
        <SendButtons message={message} subject="Gidero giriş bilgileriniz" email={done.email} phone={phone} />
      </View>
    );
  }

  return (
    <View style={[styles.box, { backgroundColor: c.paper, borderWidth: 1, borderColor: c.paperLine }]}>
      <Text style={[type.bodyStrong, { color: c.ink }]}>{`${name} için geçici şifre`}</Text>
      <Field label="Geçici şifre" value={pw} onChangeText={setPw} autoCapitalize="none" hint="En az 8 karakter. Kişi ilk girişte kendi şifresini koyar." />
      {error && <Notice tone="bad" text={error} />}
      <View style={styles.row}>
        <Button title="Şifreyi belirle" onPress={save} loading={busy} />
        <Button variant="plain" title="Yeni öneri" onPress={() => setPw(randomPassword())} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
