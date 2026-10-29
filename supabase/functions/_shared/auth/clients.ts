// Sunucu fonksiyonları için ortak: CORS, JSON yanıt, çağıranın oturumuyla ve service role ile istemci
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

export function clients(req: Request): { admin: SupabaseClient; asCaller: SupabaseClient } {
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Çağıranın yetkisiyle: veritabanındaki RLS ve yetki kontrolleri aynen işler
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? 'sb_publishable_tz56pGEoFDj3yqakGr1uNg_LgaBdNij', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  return { admin, asCaller };
}

/** Kişiyi açar (e-posta doğrulanmış, şifresiz). E-posta gönderilmez. */
export async function createUser(admin: SupabaseClient, email: string, fullName: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
  });
  if (error || !data?.user) throw new Error(error?.message ?? 'Kişi açılamadı');
  return data.user.id;
}

/**
 * Tek kullanımlık şifre belirleme anahtarı. GÜVENLİK: yalnızca veritabanının izin verdiği kişi için çağrılır
 * (yeni açılan ya da can_issue_invite onaylı); başka birinin anahtarı verilirse hesabı ele geçirilir.
 */
export async function recoveryToken(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data) throw new Error(error?.message ?? 'Bağlantı üretilemedi');
  return data.properties.hashed_token;
}

export type InviteTarget = { user_id: string | null; has_password: boolean; pending_owner_invite: boolean };
export async function inviteTarget(admin: SupabaseClient, email: string): Promise<InviteTarget> {
  const { data, error } = await admin.rpc('invite_target', { p_email: email });
  if (error) throw new Error(error.message);
  return data as InviteTarget;
}

export const inviteUrl = (tokenHash: string) =>
  `${Deno.env.get('APP_URL') ?? 'https://gidero.expo.app'}/?davet=${encodeURIComponent(tokenHash)}`;

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
