import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { DemoBar } from '@/components/demo-bar';
import { NewPassword } from '@/components/new-password';
import { Loading } from '@/components/ui';
import { useColors, useScheme } from '@/constants/theme';
import { useStackOptions } from '@/lib/nav-options';
import { Sidebar } from '@/components/sidebar';
import { useWide } from '@/lib/layout';
import { QueueProvider } from '@/lib/queue';
import { listenForTaps, registerPush } from '@/lib/notifications';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const scheme = useScheme();
  const palette = useColors();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: palette.canvas, card: palette.canvas } };
  // Yazı tipi gömülmez, sistem fontu kullanılır (HIG Typography); açılış ekranı hemen kapanır
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <ThemeProvider value={navTheme}>
      <SessionProvider>
        <QueueProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <RootStack />
        </QueueProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

function RootStack() {
  const { ready, session, active, bureaus, platformAdmin, userId, recovery } = useSession();
  const mustChange = session?.user.user_metadata?.must_change_password === true || session?.user.user_metadata?.must_change_password === 'true';
  const c = useColors();
  const wide = useWide();
  const stackOptions = useStackOptions();
  useEffect(() => {
    if (userId) registerPush(userId);
  }, [userId]);
  useEffect(() => listenForTaps(), []);
  if (!ready) return <Loading />;
  if ((recovery || mustChange) && session) return <NewPassword temporary={mustChange && !recovery} />;

  const signedIn = !!session;
  // Ek süre de bittiyse (kilitli) şirket ekranları kapanır; yalnızca ana ekrandaki uyarı, abonelik ve ayarlar açık kalır
  const hasMembership = !!active;
  const hasCompany = hasMembership && (active.phase !== 'locked' || platformAdmin);
  const hasBureau = bureaus.length > 0;

  // Bilgisayarda: solda menü, sağda içerik (çok geniş ekranda içerik makul genişlikte kalır)
  const withRail = wide && signedIn && !mustChange;
  return (
    <View style={{ flex: 1, flexDirection: withRail ? 'row' : 'column', backgroundColor: c.canvas }}>
    {withRail && <Sidebar />}
    <View style={{ flex: 1 }}>
    <Stack screenOptions={stackOptions}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasMembership && !hasBureau && !platformAdmin}>
        <Stack.Screen name="onboarding" options={{ title: 'Hoş geldiniz', headerLargeTitle: true }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && hasCompany}>
        <Stack.Screen name="camera" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="new-report" options={{ title: 'Yeni rapor', presentation: 'modal' }} />
        <Stack.Screen name="report/[id]" options={{ title: '' }} />
        <Stack.Screen name="expense/[id]" options={{ title: 'Fiş' }} />
        <Stack.Screen name="team" options={{ title: 'Ekip' }} />
        <Stack.Screen name="categories" options={{ title: 'Gider grupları' }} />
        <Stack.Screen name="limits" options={{ title: 'Sınır durumu' }} />
        <Stack.Screen name="export" options={{ title: 'Muhasebe aktarımı' }} />
        <Stack.Screen name="bulk" options={{ title: 'Toplu yükleme' }} />
        <Stack.Screen name="approval-flow" options={{ title: 'Onay zinciri' }} />
        <Stack.Screen name="data-export" options={{ title: 'Verilerimi indir' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && (hasMembership || hasBureau)}>
        <Stack.Screen name="clients" options={{ title: 'Müşteri firmalar', headerLargeTitle: !hasCompany }} />
        <Stack.Screen name="subscription" options={{ title: 'Abonelik' }} />
        <Stack.Screen name="settings" options={{ title: 'Ayarlar' }} />

      </Stack.Protected>
      <Stack.Protected guard={signedIn && (hasCompany || hasBureau || platformAdmin)}>
        <Stack.Screen name="brand" options={{ title: 'Logo ve renkler' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && platformAdmin}>
        <Stack.Screen name="admin/index" options={{ title: 'Gidero Yönetim', headerLargeTitle: true }} />
        <Stack.Screen name="admin/account/[id]" options={{ title: 'Müşteri' }} />
        <Stack.Screen name="admin/company/[id]" options={{ title: 'Firma ayarları' }} />
        <Stack.Screen name="admin/orders" options={{ title: 'Siparişler' }} />
        <Stack.Screen name="admin/plans" options={{ title: 'Fiyatlar' }} />
        <Stack.Screen name="admin/plan-details" options={{ title: 'Paket ayrıntıları' }} />
        <Stack.Screen name="admin/campaigns" options={{ title: 'Kampanyalar' }} />
        <Stack.Screen name="admin/chats" options={{ title: 'Site sohbetleri' }} />
        <Stack.Screen name="admin/new-customer" options={{ title: 'Yeni müşteri' }} />
        <Stack.Screen name="admin/finance" options={{ title: 'Gelir ve gider' }} />
        <Stack.Screen name="admin/feedback" options={{ title: 'Geri bildirimler' }} />
        <Stack.Screen name="admin/ai" options={{ title: 'Yapay zekâ maliyeti' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="test" options={{ title: 'Test sürüşü' }} />
        <Stack.Screen name="notifications" options={{ title: 'Bildirimler' }} />
        {/* Kendi içinde biten kısa iş: sayfa (sheet) olarak açılır (HIG Sheets, Modality) */}
        <Stack.Screen name="feedback" options={{ title: 'Geri bildirim', presentation: 'modal' }} />
        <Stack.Screen name="tour" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack.Protected>
    </Stack>
    {signedIn && <DemoBar />}
    </View>
    </View>
  );
}
