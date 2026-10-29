// demo-login: test müşterilerindeki kişilere şifresiz geçiş ve test verilerini sıfırlama.
//
// POST (Authorization: Bearer <oturum>)
//   { action: 'login', user_id } → { token_hash }   (istemci verifyOtp ile oturum açar)
//   { action: 'reset' }          → { accounts, companies, users }
// Yalnızca Gidero yöneticisinin oturumuyla çağrılır; hedef kişi yalnızca test müşterilerine bağlı olmalıdır.
// Gerçek bir kullanıcının oturumu bu fonksiyonla asla üretilmez.

import { clients, cors, json } from '../_shared/auth/clients.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Yalnızca POST' });
  const { admin, asCaller } = clients(req);
  let b: { action?: string; user_id?: string } = {};
  try {
    b = await req.json();
  } catch {
    return json(400, { error: 'İstek okunamadı.' });
  }

  try {
    if (b.action === 'login') {
      // Yetki ve hedef kontrolü veritabanında: yalnızca Gidero yöneticisi, yalnızca test müşterisine bağlı kişiye
      const { data: may } = await asCaller.rpc('demo_can_login', { p_target: b.user_id ?? null });
      if (may !== true) return json(403, { error: 'Bu kişiye şifresiz geçilemez: yalnızca test müşterilerindeki kişilere, yönetici hesabından geçilir.' });
      const { data: u, error: ue } = await admin.auth.admin.getUserById(String(b.user_id));
      if (ue || !u?.user?.email) return json(400, { error: 'Kişi bulunamadı.' });
      const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
      if (le || !link) throw new Error(le?.message ?? 'Bağlantı üretilemedi');
      return json(200, { token_hash: link.properties.hashed_token });
    }

    if (b.action === 'reset') {
      const { data, error } = await asCaller.rpc('demo_reset');
      if (error) return json(403, { error: error.message });
      const r = data as { accounts: number; companies: number; user_ids: string[] };
      let users = 0;
      for (const id of r.user_ids ?? []) {
        const { error: de } = await admin.auth.admin.deleteUser(id);
        if (!de) users++;
      }
      return json(200, { accounts: r.accounts, companies: r.companies, users });
    }

    return json(400, { error: 'Bilinmeyen işlem.' });
  } catch (e) {
    console.error('demo-login', e);
    return json(500, { error: 'İşlem tamamlanamadı. Biraz sonra tekrar deneyin.' });
  }
});
