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

/**
 * Kişiyi açar (yoksa) ve tek kullanımlık şifre belirleme anahtarı üretir. E-posta gönderilmez.
 * GÜVENLİK: Anahtar yalnızca hiç giriş yapmamış kişi için kullanılabilir (signedIn=false). Daha önce giriş yapmış
 * birinin anahtarı başkasına verilirse hesabı ele geçirilir; çağıranlar bu durumda bağlantı döndürmez.
 */
export async function ensureUserLink(
  admin: SupabaseClient,
  email: string,
  fullName: string,
  type: 'recovery' | 'magiclink' = 'recovery',
): Promise<{ userId: string; tokenHash: string; created: boolean; signedIn: boolean }> {
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
  });
  const created = !createErr;
  if (createErr && !/already|registered|exists/i.test(createErr.message)) throw new Error(createErr.message);
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  if (error || !data?.user) throw new Error(error?.message ?? 'Bağlantı üretilemedi');
  return { userId: data.user.id, tokenHash: data.properties.hashed_token, created, signedIn: !!data.user.last_sign_in_at };
}

export const inviteUrl = (tokenHash: string) =>
  `${Deno.env.get('APP_URL') ?? 'https://gidero.expo.app'}/?davet=${encodeURIComponent(tokenHash)}`;

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
