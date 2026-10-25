import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Loading } from '@/components/ui';
import { fonts, useColors } from '@/constants/theme';
import { QueueProvider } from '@/lib/queue';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });
  const fontsReady = fontsLoaded || !!fontError;
  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);
  if (!fontsReady) return null;

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <QueueProvider>
          <StatusBar style="auto" />
          <RootStack />
        </QueueProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

function RootStack() {
  const { ready, session, active, bureaus, platformAdmin } = useSession();
  const c = useColors();
  if (!ready) return <Loading />;

  const signedIn = !!session;
  const hasCompany = !!active;
  const hasBureau = bureaus.length > 0;

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: c.pen,
        headerTitleStyle: { color: c.ink, fontFamily: fonts.display, fontSize: 18 },
        headerLargeTitleStyle: { color: c.ink, fontFamily: fonts.displayHeavy },
        contentStyle: { backgroundColor: c.canvas },
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: c.canvas },
      }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasCompany && !hasBureau}>
        <Stack.Screen name="onboarding" options={{ title: 'Hoş geldiniz', headerLargeTitle: true }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && hasCompany}>
        <Stack.Screen name="index" options={{ title: '' }} />
        <Stack.Screen name="camera" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="new-report" options={{ title: 'Yeni rapor', presentation: 'modal' }} />
        <Stack.Screen name="report/[id]" options={{ title: '' }} />
        <Stack.Screen name="expense/[id]" options={{ title: 'Fiş' }} />
        <Stack.Screen name="approvals" options={{ title: 'Onayınızı bekleyenler' }} />
        <Stack.Screen name="team" options={{ title: 'Ekip' }} />
        <Stack.Screen name="categories" options={{ title: 'Gider grupları' }} />
        <Stack.Screen name="limits" options={{ title: 'Sınır durumu' }} />
        <Stack.Screen name="export" options={{ title: 'Muhasebe aktarımı' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && (hasCompany || hasBureau)}>
        <Stack.Screen name="clients" options={{ title: 'Müşteri firmalar', headerLargeTitle: !hasCompany }} />
        <Stack.Screen name="subscription" options={{ title: 'Abonelik' }} />
        <Stack.Screen name="settings" options={{ title: 'Ayarlar' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && platformAdmin}>
        <Stack.Screen name="admin/index" options={{ title: 'Gidero Yönetim', headerLargeTitle: true }} />
        <Stack.Screen name="admin/account/[id]" options={{ title: 'Müşteri' }} />
        <Stack.Screen name="admin/orders" options={{ title: 'Siparişler' }} />
        <Stack.Screen name="admin/plans" options={{ title: 'Paketler' }} />
        <Stack.Screen name="admin/campaigns" options={{ title: 'Kampanyalar' }} />
        <Stack.Screen name="admin/chats" options={{ title: 'Site sohbetleri' }} />
      </Stack.Protected>
    </Stack>
  );
}
