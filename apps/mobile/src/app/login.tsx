import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/logo';
import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Notice, Perforation, Slip } from '@/components/ui';
import { fonts, space, type, useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

// Yenileme bağlantısı uygulamanın web adresine döner; telefondan açılsa da tarayıcıda yeni şifre yazılır
function recoveryUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/`;
  return 'https://gidero.expo.app/';
}

export default function Login() {
  const c = useColors();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { authNotice } = useSession();
  const [error, setError] = useState<string | null>(authNotice);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setInfo(null);
    const mail = email.trim().toLowerCase();
    if (!mail.includes('@')) return setError('Geçerli bir e-posta yazın.');
    if (mode === 'forgot') {
      setBusy(true);
      const { error: e } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: recoveryUrl() });
      setBusy(false);
      if (e) return setError(errorText(e));
      return setInfo('Şifre yenileme bağlantısı e-postanıza gönderildi. Gelen kutunuzu (ve gereksiz/spam klasörünü) kontrol edin, bağlantıya dokunup yeni şifrenizi yazın.');
    }
    if (password.length < 6) return setError('Şifre en az 6 karakter olmalı.');
    if (mode === 'signup' && name.trim().length < 2) return setError('Adınızı ve soyadınızı yazın.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: e } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { data: { full_name: name.trim() } },
        });
        if (e) throw e;
        // E-posta zaten kayıtlıysa Supabase güvenlik gereği hata vermez ve e-posta göndermez
        if (data.user && (data.user.identities ?? []).length === 0) {
          setMode('signin');
          setError('Bu e-postayla zaten hesap var. Giriş yapın; şifrenizi hatırlamıyorsanız "Şifremi unuttum"a dokunun.');
          return;
        }
        if (!data.session) {
          setInfo('Hesabınız açıldı. E-postanıza gelen bağlantıya dokunun, sonra buradan giriş yapın.');
          setMode('signin');
        }
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <Slip tone="deep" style={{ marginBottom: space.xxl }}>
            <Logo size={44} color="#FFFFFF" />
            <Perforation color="rgba(255,255,255,0.18)" />
            <Text style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: '#FFFFFF', letterSpacing: -0.4 }}>
              Fişi çek, vergini kurtar.
            </Text>
            <Text style={[type.body, { color: c.onDeepMuted, marginTop: space.xs }]}>
              Gidero fişi okur, vergi açısından kontrol eder ve onaya gönderir.
            </Text>
          </Slip>

          <Text style={[type.title, { color: c.ink, marginBottom: space.lg }]}>
            {mode === 'signin' ? 'Giriş yapın' : mode === 'signup' ? 'Hesap oluşturun' : 'Şifrenizi yenileyin'}
          </Text>

          <View style={{ gap: space.lg }}>
            {mode === 'signup' && (
              <Field label="Ad soyad" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
            )}
            <Field
              label="E-posta"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            {mode === 'forgot' && (
              <Text style={[type.body, { color: c.muted }]}>E-postanızı yazın; yeni şifre belirlemeniz için bir bağlantı gönderelim.</Text>
            )}
            {mode !== 'forgot' && <Field
              label="Şifre"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
              hint={mode === 'signup' ? 'En az 6 karakter.' : undefined}
            />}
            {error && <Notice tone="bad" text={error} />}
            {info && <Notice tone="ok" text={info} />}
            <Button
              size="large"
              title={mode === 'signin' ? 'Giriş yap' : mode === 'signup' ? 'Hesap oluştur' : 'Yenileme bağlantısı gönder'}
              onPress={submit}
              loading={busy}
            />
            {mode === 'signin' && (
              <Button variant="plain" title="Şifremi unuttum" onPress={() => { setMode('forgot'); setError(null); setInfo(null); }} />
            )}
            <Button
              variant="plain"
              title={mode === 'signin' ? 'Hesabınız yok mu? Kaydolun' : 'Giriş ekranına dön'}
              onPress={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
                setInfo(null);
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.xl, paddingTop: space.xxl * 2, flexGrow: 1 },
});
