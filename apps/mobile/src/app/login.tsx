import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Notice, Perforation, Slip } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { errorText, supabase } from '@/lib/supabase';

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
          <Slip style={{ marginBottom: space.xxl }}>
            <Text style={[styles.brand, { color: c.pen }]}>gidero</Text>
            <Perforation />
            <Text style={[type.body, { color: c.ink }]}>Fişi çekin. Gidero okusun, kontrol etsin, onaya göndersin.</Text>
          </Slip>

          <Text style={[type.title, { color: c.ink, marginBottom: space.lg }]}>
            {mode === 'signin' ? 'Giriş yapın' : 'Hesap oluşturun'}
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
            {info && <Notice tone="ok" text={info} />}
            <Button size="large" title={mode === 'signin' ? 'Giriş yap' : 'Hesap oluştur'} onPress={submit} loading={busy} />
            <Button
              variant="plain"
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
  brand: { fontSize: 34, fontWeight: '800', letterSpacing: -1.2 },
});
