// people: şirkete kişi ekleme ve ilk giriş (davet) bağlantısı.
//
// POST (Authorization: Bearer <oturum>)
//   { action: 'add', company_id, full_name, title, email?, roles, manager_id? } → { user_id, link }
//   { action: 'link', company_id, user_id }                                   → { link }
//   { action: 'owner_link', account_id, full_name? }                           → { link, email }   (Gidero yöneticisi)
// Bağlantı WhatsApp'tan iletilir; kişi tıklayınca kendi şifresini belirler. Yetki kontrolleri veritabanında,
// çağıranın kendi oturumuyla yapılır (şirket yöneticisi / Gidero yöneticisi).

import { clients, cors, EMAIL_RE, ensureUserLink, inviteUrl, json } from '../_shared/auth/clients.ts';

type Body = {
  action?: string;
  company_id?: string;
  account_id?: string;
  user_id?: string;
  full_name?: string;
  title?: string;
  email?: string;
  roles?: string[];
  manager_id?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Yalnızca POST' });
  const { admin, asCaller } = clients(req);
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return json(400, { error: 'İstek okunamadı.' });
  }

  try {
    if (b.action === 'add') {
      const company = String(b.company_id ?? '');
      const { data: ok } = await asCaller.rpc('can_manage_company', { p_company: company });
      if (ok !== true) return json(403, { error: 'Kişi eklemek için şirket yöneticisi olmalısınız.' });
      const name = String(b.full_name ?? '').trim();
      if (name.length < 2) return json(400, { error: 'Ad soyad yazın.' });

      const { data: co } = await admin.from('companies').select('account_id').eq('id', company).single();
      const { data: acc } = co ? await admin.from('accounts').select('is_demo').eq('id', co.account_id).single() : { data: null };
      const demo = !!acc?.is_demo;
      let email = String(b.email ?? '').trim().toLowerCase();
      if (!email && demo) email = `kisi-${crypto.randomUUID().slice(0, 8)}@test.gidero.app`;
      if (!EMAIL_RE.test(email)) return json(400, { error: 'Kişinin e-postasını yazın; giriş bu e-postayla yapılır.' });

      const { userId, tokenHash, created, signedIn } = await ensureUserLink(admin, email, name);
      if (demo && !created && !email.endsWith('@test.gidero.app')) {
        return json(400, { error: 'Test müşterisine gerçek bir kullanıcı eklenemez; uydurma bir e-posta yazın ya da boş bırakın.' });
      }
      const roles = Array.isArray(b.roles) && b.roles.length ? b.roles : ['employee'];
      const { error: addErr } = await asCaller.rpc('add_member', {
        p_company: company,
        p_email: email,
        p_roles: roles,
        p_manager: b.manager_id ?? null,
      });
      if (addErr) return json(400, { error: addErr.message });
      await asCaller.rpc('set_member_details', { p_company: company, p_user: userId, p_title: b.title ?? '', p_final_approver: false });
      // İsim boşsa (yeni kişi) yöneticinin yazdığı ad kullanılır; başka şirkette de çalışan kişinin adı değişmez
      await admin.from('profiles').update({ full_name: name }).eq('id', userId).eq('full_name', '');
      // Daha önce giriş yapmış kişiye bağlantı verilmez: kendi şifresiyle girer
      return json(200, { user_id: userId, email, link: signedIn ? null : inviteUrl(tokenHash), demo });
    }

    if (b.action === 'link') {
      const { data: email, error } = await asCaller.rpc('member_email', { p_company: b.company_id, p_user: b.user_id });
      if (error || !email) return json(403, { error: error?.message ?? 'Kişi bulunamadı.' });
      const { tokenHash, signedIn } = await ensureUserLink(admin, String(email), '');
      if (signedIn) {
        return json(400, { error: 'Bu kişi daha önce giriş yaptı. Şifresini unuttuysa giriş ekranındaki "Şifremi unuttum"u kullansın.' });
      }
      return json(200, { link: inviteUrl(tokenHash) });
    }

    if (b.action === 'owner_link') {
      const { data: email, error } = await asCaller.rpc('admin_owner_email', { p_account: b.account_id });
      if (error || !email) return json(403, { error: error?.message ?? 'Hesap sahibi bulunamadı.' });
      const name = String(b.full_name ?? '').trim();
      // Kişi yoksa açılır; bekleyen davet veritabanı tetikleyicisiyle hesaba bağlanır
      const { userId, tokenHash, signedIn } = await ensureUserLink(admin, String(email), name);
      if (name) await admin.from('profiles').update({ full_name: name }).eq('id', userId).eq('full_name', '');
      if (signedIn) {
        return json(200, { link: null, email, note: 'Hesap sahibi daha önce giriş yaptı; kendi şifresiyle girer.' });
      }
      return json(200, { link: inviteUrl(tokenHash), email });
    }

    return json(400, { error: 'Bilinmeyen işlem.' });
  } catch (e) {
    console.error('people', e);
    return json(500, { error: 'İşlem tamamlanamadı. Biraz sonra tekrar deneyin.' });
  }
});
