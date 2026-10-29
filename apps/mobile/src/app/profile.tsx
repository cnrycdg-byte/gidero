import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { radius, setThemePref, space, type, useColors, useThemePref, type ThemePref } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { useDemo } from '@/lib/demo';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { ROLE_LABEL } from '@/lib/types';
import { bankFromIban, fetchBank, formatIban, ibanError, saveBank } from '@/lib/bank';

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'system', label: 'Telefonun ayarı' },
  { key: 'light', label: 'Açık' },
  { key: 'dark', label: 'Koyu' },
];

// Hesabım: kişisel bilgiler, şifre, e-posta, görünüm, bildirimler, oturum
export default function Profile() {
  const c = useColors();
  const { session, userId, active, bureaus, platformAdmin } = useSession();
  const demo = useDemo(userId);
  const pref = useThemePref();
  const email = session?.user.email ?? '';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [section, setSection] = useState<'password' | 'email' | null>(null);
  const [current, setCurrent] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('full_name, phone, email_notifications').eq('id', userId).maybeSingle();
    setName(data?.full_name ?? '');
    setPhone(data?.phone ?? '');
    setNotifyEmail(data?.email_notifications ?? true);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function run(key: string, f: () => Promise<string | void>) {
    setBusy(key);
    setError(null);
    setInfo(null);
    try {
      const msg = await f();
      if (msg) setInfo(msg);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const saveInfo = () =>
    run('info', async () => {
      if (name.trim().length < 2) throw new Error('Adınızı ve soyadınızı yazın.');
      const { error: e } = await supabase.from('profiles').update({ full_name: name.trim(), phone: phone.trim() || null }).eq('id', userId!);
      if (e) throw e;
      await supabase.auth.updateUser({ data: { full_name: name.trim() } });
      return 'Bilgileriniz kaydedildi.';
    });

  const changePassword = () =>
    run('password', async () => {
      if (p1.length < 8) throw new Error('Yeni şifre en az 8 karakter olmalı.');
      if (p1 !== p2) throw new Error('Yeni şifreler aynı değil.');
      // Mevcut şifre doğrulanır (başkası açık bırakılmış oturumdan şifre değiştiremesin)
      const { error: e0 } = await supabase.auth.signInWithPassword({ email, password: current });
      if (e0) throw new Error('Mevcut şifreniz yanlış.');
      const { error: e } = await supabase.auth.updateUser({ password: p1 });
      if (e) throw e;
      // Diğer cihazlardaki oturumlar kapanır (şifre başkasındaysa artık kullanamaz)
      await supabase.auth.signOut({ scope: 'others' }).catch(() => null);
      setCurrent('');
      setP1('');
      setP2('');
      setSection(null);
      return 'Şifreniz değiştirildi. Diğer cihazlardaki oturumlarınız kapatıldı.';
    });

  const changeEmail = () =>
    run('email', async () => {
      const v = newEmail.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error('Geçerli bir e-posta yazın.');
      const redirect = typeof window !== 'undefined' && window.location ? `${window.location.origin}/` : 'https://gidero.expo.app/';
      const { error: e } = await supabase.auth.updateUser({ email: v }, { emailRedirectTo: redirect });
      if (e) throw e;
      setNewEmail('');
      setSection(null);
      return `${v} adresine doğrulama bağlantısı gönderildi. Bağlantıya dokununca e-postanız değişir; o zamana kadar ${email} ile girmeye devam edin.`;
    });

  const toggleNotify = (v: boolean) => {
    setNotifyEmail(v);
    supabase
      .from('profiles')
      .update({ email_notifications: v })
      .eq('id', userId!)
      .then(({ error: e }) => e && setError(errorText(e)));
  };

  const roles = active ? active.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ') : bureaus.length ? 'Büro' : '';
  const chip = (on: boolean) => [styles.chip, { backgroundColor: on ? c.pen : c.paper }];

  return (
    <Page>
      <View style={[styles.hero, { backgroundColor: c.deep }]}>
        <Text style={[type.title, { color: c.onDeep }]}>{name || email}</Text>
        <Text style={[type.small, { color: c.onDeepMuted }]}>{email}</Text>
        {active || bureaus.length ? (
          <Text style={[type.small, { color: c.onDeepMuted }]}>
            {[active?.companies.legal_name ?? bureaus[0]?.name, roles].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>

      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}

      <SectionTitle title="Kişisel bilgiler" />
      <View style={[styles.box, { backgroundColor: c.paper }]}>
        <Field label="Ad soyad" value={name} onChangeText={setName} autoComplete="name" />
        <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05xx xxx xx xx" hint="Yöneticiniz size buradan ulaşabilir." />
        <Button title="Kaydet" onPress={saveInfo} loading={busy === 'info'} />
      </View>

      {active && userId ? <MyBank companyId={active.company_id} userId={userId} company={active.companies.legal_name} /> : null}

      <SectionTitle title="Giriş ve güvenlik" />
      <Group>
        <Row icon="settings" title="Şifremi değiştir" subtitle="Mevcut şifrenizle yeni şifre belirleyin" onPress={() => setSection(section === 'password' ? null : 'password')} />
        <Row icon="send" title="E-postamı değiştir" subtitle={email} onPress={() => setSection(section === 'email' ? null : 'email')} />
      </Group>
      {section === 'password' && (
        <View style={[styles.box, { backgroundColor: c.paper }]}>
          <Field label="Mevcut şifre" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
          <Field label="Yeni şifre" value={p1} onChangeText={setP1} secureTextEntry autoComplete="new-password" hint="En az 8 karakter; harf ve rakam karışık olsun." />
          <Field label="Yeni şifre (tekrar)" value={p2} onChangeText={setP2} secureTextEntry autoComplete="new-password" />
          <Button title="Şifreyi değiştir" onPress={changePassword} loading={busy === 'password'} />
          <Text style={[type.small, { color: c.muted }]}>Mevcut şifrenizi hatırlamıyorsanız çıkış yapıp giriş ekranındaki "Şifremi unuttum"u kullanın.</Text>
        </View>
      )}
      {section === 'email' && (
        <View style={[styles.box, { backgroundColor: c.paper }]}>
          <Field label="Yeni e-posta" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" />
          <Button title="Doğrulama bağlantısı gönder" onPress={changeEmail} loading={busy === 'email'} />
        </View>
      )}

      <SectionTitle title="Görünüm" />
      <View style={styles.chips}>
        {THEMES.map((t) => (
          <Pressable key={t.key} onPress={() => setThemePref(t.key)} style={chip(pref === t.key)}>
            <Text style={{ color: pref === t.key ? c.onPen : c.ink, fontWeight: pref === t.key ? '600' : '400' }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Bildirimler" />
      <View style={[styles.box, { backgroundColor: c.paper }]}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: c.ink }]}>E-posta bildirimleri</Text>
            <Text style={[type.small, { color: c.muted }]}>Onayınızı bekleyen rapor, iade, onay ve ödeme haberleri e-postanıza da gelsin.</Text>
          </View>
          <Switch value={notifyEmail} onValueChange={toggleNotify} />
        </View>
        <Text style={[type.small, { color: c.muted }]}>Telefon bildirimleri telefonunuzun ayarlarından açılıp kapanır.</Text>
      </View>

      <SectionTitle title="Kısayollar" />
      <Group>
        {(active || bureaus.length > 0) && <Row icon="settings" title="Şirket ve ayarlar" subtitle="Şirketler, araçlarım, abonelik, ekip" onPress={() => router.push('/settings')} />}
        <Row icon="inbox" title="Bildirimler" onPress={() => router.push('/notifications')} />
        {(active || bureaus.length > 0) && <Row icon="doc" title="Uygulamayı tanıt" subtitle="Fiş girme, onay ve takip: kısa tanıtımı yeniden izleyin" onPress={() => router.push({ pathname: '/tour', params: { all: '1' } })} />}
        {platformAdmin && <Row icon="settings" title="Gidero Yönetim Paneli" onPress={() => router.push('/admin')} />}
        {(platformAdmin || demo.testMode) && <Row icon="team" title="Test sürüşü" onPress={() => router.push('/test')} />}
      </Group>

      <SectionTitle title="Oturum" />
      <Group>
        <Row icon="logout" iconColor={c.red} iconBg={c.redSoft} title="Çıkış yap" chevron={false} onPress={() => supabase.auth.signOut({ scope: 'local' })} />
        <Row
          icon="logout"
          iconColor={c.red}
          iconBg={c.redSoft}
          title="Tüm cihazlardan çıkış yap"
          subtitle="Telefonunuzu kaybettiyseniz ya da şifrenizi başkası öğrendiyse"
          chevron={false}
          onPress={() => confirm('Tüm cihazlardan çıkılsın mı?', 'Bu cihaz dahil her yerde oturumunuz kapanır.', 'Çıkış yap', () => supabase.auth.signOut({ scope: 'global' }))}
        />
      </Group>
      <Text style={[type.small, { color: c.faint, textAlign: 'center' }]}>
        {`Gidero ${Constants.expoConfig?.version ?? ''}. Hesabınızın ve verilerinizin silinmesini istiyorsanız yöneticinize ya da destek@gidero.tr adresine yazın.`}
      </Text>
    </Page>
  );
}

/** Kişinin masraf ödemesinin yapılacağı hesap (şirket bazında) */
function MyBank({ companyId, userId, company }: { companyId: string; userId: string; company: string }) {
  const c = useColors();
  const [iban, setIban] = useState('');
  const [bank, setBank] = useState('');
  const [holder, setHolder] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  useFocusEffect(
    useCallback(() => {
      fetchBank(companyId, userId).then(({ info }) => {
        setIban(formatIban(info?.iban));
        setBank(info?.bank_name ?? '');
        setHolder(info?.account_holder ?? '');
      });
    }, [companyId, userId]),
  );
  async function save() {
    const e = ibanError(iban);
    if (e) return setMsg({ tone: 'bad', text: e });
    setBusy(true);
    try {
      await saveBank(companyId, userId, { iban, bank, holder });
      setMsg({ tone: 'ok', text: 'Banka bilginiz kaydedildi.' });
    } catch (err) {
      setMsg({ tone: 'bad', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionTitle title="Masraf ödemem için banka bilgim" />
      <View style={[styles.box, { backgroundColor: c.paper }]}>
        <Text style={[type.small, { color: c.muted }]}>{`${company} masraflarınızı bu hesaba öder. Yalnızca muhasebe ve ödeme yetkilisi görür.`}</Text>
        <Field
          label="IBAN"
          value={iban}
          onChangeText={(v) => {
            setIban(v);
            const b = bankFromIban(v);
            if (b && !bank) setBank(b);
          }}
          autoCapitalize="characters"
          placeholder="TR00 0000 0000 0000 0000 0000 00"
          hint={ibanError(iban) ?? undefined}
        />
        <Field label="Banka" value={bank} onChangeText={setBank} />
        <Field label="Hesap sahibi" value={holder} onChangeText={setHolder} />
        {msg && <Notice tone={msg.tone} text={msg.text} />}
        <Button title="Kaydet" onPress={save} loading={busy} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: space.xl, gap: 4 },
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
