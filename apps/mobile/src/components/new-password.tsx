import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Text } from '@/components/text';
import { Button, Field, Notice, Slip } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

/** Şifre yenileme bağlantısından gelen kişi yeni şifresini yazar; sonra uygulamaya girer. */
export function NewPassword({ temporary = false }: { temporary?: boolean }) {
  const c = useColors();
  const { session, finishRecovery, invite } = useSession();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (p1.length < 8) return setError('Şifre en az 8 karakter olmalı.');
    if (p1 !== p2) return setError('İki şifre aynı değil.');
    setBusy(true);
    const { error: e } = await supabase.auth.updateUser({ password: p1, data: { must_change_password: false } });
    setBusy(false);
    if (e) return setError(errorText(e));
    await supabase.auth.refreshSession().catch(() => null);
    finishRecovery();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xxl * 2, gap: space.lg, maxWidth: 520, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <Slip tone="deep">
            <Logo size={40} color="#FFFFFF" />
          </Slip>
          <Text style={[type.title, { color: c.ink }]}>{invite || temporary ? "Gidero'ya hoş geldiniz" : 'Yeni şifrenizi belirleyin'}</Text>
          {(invite || temporary) && (
            <Text style={[type.body, { color: c.muted }]}>
              {temporary
                ? 'Yöneticinizin verdiği geçici şifreyle girdiniz. Devam etmek için kendi şifrenizi belirleyin; bundan sonra bu şifreyle girersiniz.'
                : 'Bundan sonra bu e-posta ve belirleyeceğiniz şifreyle girersiniz.'}
            </Text>
          )}
          <Text style={[type.body, { color: c.muted }]}>{session?.user.email ?? ''}</Text>
          <View style={{ gap: space.lg }}>
            <Field label="Yeni şifre" value={p1} onChangeText={setP1} secureTextEntry autoComplete="new-password" textContentType="newPassword" hint="En az 8 karakter; harf ve rakam karışık olsun." autoFocus />
            <Field label="Yeni şifre (tekrar)" value={p2} onChangeText={setP2} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
            {error && <Notice tone="bad" text={error} />}
            <Button size="large" title={invite || temporary ? 'Şifremi belirle ve gir' : 'Şifreyi kaydet ve gir'} onPress={save} loading={busy} />
            <Button variant="plain" title="Çıkış yap" onPress={() => supabase.auth.signOut({ scope: 'local' })} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
