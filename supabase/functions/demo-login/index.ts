// demo-login: test modunda şifre girmeden deneme kişisine geçiş.
//
// POST (Authorization: Bearer <oturum>)
//   { action: 'prepare' }            → { personas: [{ key, name, email }] }   (tüm deneme kişilerini açar)
//   { action: 'login', persona }     → { token_hash, email, name }             (istemci verifyOtp ile oturum açar)
// Yalnızca Gidero yöneticisi ve deneme kişileri çağırabilir. Deneme kişileri yalnızca diğer deneme kişilerine
// geçebilir; gerçek bir kullanıcının oturumu bu fonksiyonla asla üretilmez.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { findPersona, PERSONAS, type Persona } from '../_shared/demo/personas.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Yalnızca POST' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: me, error: meErr } = await db.auth.getUser(jwt);
  if (meErr || !me?.user) return json(401, { error: 'Oturum bulunamadı. Yeniden giriş yapın.' });
  const caller = me.user.id;
  const [{ data: admin }, { data: demo }] = await Promise.all([
    db.from('platform_admins').select('user_id').eq('user_id', caller).maybeSingle(),
    db.from('demo_users').select('user_id').eq('user_id', caller).maybeSingle(),
  ]);
  if (!admin && !demo) return json(403, { error: 'Test modu yalnızca Gidero yöneticisine açıktır.' });

  let body: { action?: string; persona?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'İstek okunamadı.' });
  }

  // Kişiyi açar (yoksa) ve tek kullanımlık giriş anahtarı üretir. E-posta gönderilmez.
  async function ensure(p: Persona) {
    const { data: row } = await db.from('demo_users').select('user_id').eq('persona', p.key).maybeSingle();
    if (!row) {
      await db.auth.admin.createUser({
        email: p.email,
        email_confirm: true,
        password: `${crypto.randomUUID()}Aa1!`,
        user_metadata: { full_name: p.name },
      }); // zaten varsa hata verir; aşağıdaki bağlantı üretimi kişiyi yine bulur
    }
    const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: p.email });
    if (error || !link?.user) throw new Error(error?.message ?? 'Giriş bağlantısı üretilemedi');
    if (!row) {
      const { error: e1 } = await db
        .from('demo_users')
        .upsert({ user_id: link.user.id, persona: p.key, email: p.email, full_name: p.name }, { onConflict: 'user_id' });
      if (e1) throw new Error(e1.message);
      await db.from('profiles').upsert({ id: link.user.id, full_name: p.name }, { onConflict: 'id' });
    }
    return link.properties.hashed_token;
  }

  try {
    if (body.action === 'prepare') {
      for (const p of PERSONAS) await ensure(p);
      return json(200, { personas: PERSONAS });
    }
    if (body.action === 'login') {
      const p = findPersona(body.persona);
      if (!p) return json(400, { error: 'Bu deneme kişisi yok.' });
      const token_hash = await ensure(p);
      return json(200, { token_hash, email: p.email, name: p.name });
    }
    return json(400, { error: 'Bilinmeyen işlem.' });
  } catch (e) {
    console.error('demo-login', e);
    return json(500, { error: 'Deneme kişisine geçilemedi. Biraz sonra tekrar deneyin.' });
  }
});
