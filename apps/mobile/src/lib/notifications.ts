import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type AppNotification = {
  id: number;
  report_id: string | null;
  kind: 'approval_needed' | 'approved' | 'returned' | 'ready_for_accounting';
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

if (Platform.OS !== 'web') {
  // Uygulama açıkken de bildirimi göster
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
}

/** Telefonu bildirim alacak şekilde kaydeder. İzin verilmezse sessizce geçer. */
export async function registerPush(userId: string) {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Gidero', importance: Notifications.AndroidImportance.HIGH });
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase
      .from('push_tokens')
      .upsert({ token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: 'token' });
  } catch {
    // Expo Go'da Android uzaktan bildirimi desteklemez; uygulama içi bildirim listesi yine çalışır.
  }
}

/** Bildirime dokunulunca ilgili raporu açar. */
export function listenForTaps() {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const reportId = r.notification.request.content.data?.report_id;
    if (typeof reportId === 'string') router.push({ pathname: '/report/[id]', params: { id: reportId } });
  });
  return () => sub.remove();
}

/** Onay işlemlerinden sonra bekleyen bildirimleri gönderir (hata olsa da akışı durdurmaz). */
export function sendPending() {
  supabase.functions.invoke('notify', { body: {} }).catch(() => {});
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, report_id, kind, title, body, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function unreadCount(): Promise<number> {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  return count ?? 0;
}

export async function markRead(ids?: number[]) {
  await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null });
}
