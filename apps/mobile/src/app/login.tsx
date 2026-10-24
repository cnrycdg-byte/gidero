import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, Field, Notice } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { errorText, supabase, supabaseConfigured } from '@/lib/supabase';

export default function Login() {
  const c = useColors();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setInfo(null);
    const mail = email.trim().toLowerCase();
    if (!mail.includes('@')) return setError('Geçerli bir e-posta yazın.');
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
        if (!data.session) {
          setInfo('Hesabınız açıldı. E-postanıza gelen bağlantıya dokunarak doğrulayın, sonra buradan giriş yapın.');
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
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.sm, marginBottom: space.xl }}>
            <Text style={[styles.brand, { color: c.primary }]}>gidero</Text>
            <Text style={[type.title, { color: c.text }]}>
              {mode === 'signin' ? 'Tekrar hoş geldiniz' : 'Hesap oluşturun'}
            </Text>
            <Body muted>Fişinizi çekin, gerisini Gidero halletsin.</Body>
          </View>

          {!supabaseConfigured && (
            <Notice tone="bad" text="Uygulama sunucuya bağlanacak anahtarı içermiyor. Yöneticinize haber verin." />
          )}

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
            <Field
              label="Şifre"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
              hint={mode === 'signup' ? 'En az 6 karakter.' : undefined}
            />
            {error && <Notice tone="bad" text={error} />}
            {info && <Notice text={info} />}
            <Button title={mode === 'signin' ? 'Giriş yap' : 'Hesap oluştur'} onPress={submit} loading={busy} />
            <Button
              variant="ghost"
              title={mode === 'signin' ? 'Hesabınız yok mu? Kaydolun' : 'Hesabınız var mı? Giriş yapın'}
              onPress={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
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
  brand: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
});
