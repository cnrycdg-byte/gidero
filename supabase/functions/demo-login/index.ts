// demo-login: test müşterilerindeki kişilere şifresiz geçiş ve test verilerini sıfırlama.
//
// POST (Authorization: Bearer <oturum>)
//   { action: 'login', user_id } → { token_hash }   (istemci verifyOtp ile oturum açar)
//   { action: 'reset' }          → { accounts, companies, users }
// Yalnızca Gidero yöneticisi ve test kişileri çağırabilir; hedef kişi yalnızca test müşterilerine bağlı olmalıdır.
// Gerçek bir kullanıcının oturumu bu fonksiyonla asla üretilmez.

import { clients, cors, json } from '../_shared/auth/clients.ts';

type Person = { user_id: string };
type Account = { people: Person[] };

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
      // Yetki ve hedef kontrolü veritabanında: listede olmayan kişiye geçilemez
      const { data, error } = await asCaller.rpc('demo_people');
      if (error) return json(403, { error: 'Test modu yalnızca Gidero yöneticisine açıktır.' });
      const ids = new Set(((data ?? []) as Account[]).flatMap((a) => a.people.map((p) => p.user_id)));
      if (!b.user_id || !ids.has(b.user_id)) return json(400, { error: 'Bu kişi bir test müşterisinde değil.' });
      const { data: u, error: ue } = await admin.auth.admin.getUserById(b.user_id);
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
