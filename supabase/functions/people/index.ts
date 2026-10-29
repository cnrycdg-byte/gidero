// people: şirkete kişi ekleme ve ilk giriş (davet) bağlantısı.
//
// POST (Authorization: Bearer <oturum>)
//   { action: 'add', company_id, full_name, title, email?, roles, manager_id? } → { user_id, link|null }
//   { action: 'link', company_id, user_id }                                   → { link }
//   { action: 'owner_link', account_id, full_name? }                           → { link|null, email }   (Gidero yöneticisi)
//   { action: 'add_staff', account_id, full_name, email, company_ids? }        → { user_id, link|null } (büro sahibi)
//   { action: 'staff_link', account_id, user_id }                              → { link }               (büro sahibi)
// Bağlantı yalnızca yeni açılan kişiye ya da şifresini hiç belirlememiş ve yalnızca çağıranın yönettiği
// şirketlerde olan kişiye verilir (veritabanı: can_issue_invite). Başkasının hesabına bağlantı verilmez.

import { clients, cors, createUser, EMAIL_RE, inviteTarget, inviteUrl, json, recoveryToken } from '../_shared/auth/clients.ts';

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
  company_ids?: string[];
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

      const { data: co } = await admin.from('companies').select('account_id, bureau_account_id').eq('id', company).single();
      const { data: acc } = co
        ? await admin.from('accounts').select('is_demo').eq('id', co.bureau_account_id ?? co.account_id).single()
        : { data: null };
      const demo = !!acc?.is_demo;
      let email = String(b.email ?? '').trim().toLowerCase();
      if (!email && demo) email = `kisi-${crypto.randomUUID().slice(0, 8)}@test.gidero.app`;
      if (!EMAIL_RE.test(email)) return json(400, { error: 'Kişinin e-postasını yazın; giriş bu e-postayla yapılır.' });

      // Önce kontrol, sonra kişi açma
      const target = await inviteTarget(admin, email);
      if (target.pending_owner_invite) {
        return json(400, { error: 'Bu e-posta bir müşteri hesabının sahibi olarak davet edilmiş; başka bir e-posta kullanın.' });
      }
      let userId = target.user_id;
      let created = false;
      if (!userId) {
        userId = await createUser(admin, email, name);
        created = true;
      }
      const roles = Array.isArray(b.roles) && b.roles.length ? b.roles : ['employee'];
      const { error: addErr } = await asCaller.rpc('add_member', {
        p_company: company,
        p_email: email,
        p_roles: roles,
        p_manager: b.manager_id ?? null,
      });
      if (addErr) {
        if (created) await admin.auth.admin.deleteUser(userId);
        return json(400, { error: addErr.message });
      }
      const { error: detErr } = await asCaller.rpc('set_member_details', {
        p_company: company,
        p_user: userId,
        p_title: b.title ?? '',
        p_final_approver: false,
      });
      if (!created) await admin.from('profiles').update({ full_name: name }).eq('id', userId).eq('full_name', '');

      let link: string | null = null;
      if (!demo) {
        const { data: may } = await asCaller.rpc('can_issue_invite', { p_company: company, p_user: userId });
        if (created || may === true) link = inviteUrl(await recoveryToken(admin, email));
      }
      return json(200, { user_id: userId, email, link, demo, warning: detErr ? 'Ünvan kaydedilemedi; kişiye dokunup tekrar yazın.' : null });
    }

    if (b.action === 'link') {
      const { data: may } = await asCaller.rpc('can_issue_invite', { p_company: b.company_id, p_user: b.user_id });
      if (may !== true) {
        return json(400, {
          error: 'Bu kişiye bağlantı verilemez: şifresini belirlemiş ya da başka bir şirkette de çalışıyor. Şifresini unuttuysa giriş ekranındaki "Şifremi unuttum"u kullansın.',
        });
      }
      const { data: u, error } = await admin.auth.admin.getUserById(String(b.user_id));
      if (error || !u?.user?.email) return json(400, { error: 'Kişi bulunamadı.' });
      return json(200, { link: inviteUrl(await recoveryToken(admin, u.user.email)) });
    }

    if (b.action === 'add_staff') {
      const account = String(b.account_id ?? '');
      const { data: ok } = await asCaller.rpc('can_manage_bureau', { p_account: account });
      if (ok !== true) return json(403, { error: 'Büroya muhasebeciyi yalnızca büro sahibi ekleyebilir.' });
      const name = String(b.full_name ?? '').trim();
      if (name.length < 2) return json(400, { error: 'Muhasebecinin adını soyadını yazın.' });
      const { data: acc } = await admin.from('accounts').select('is_demo').eq('id', account).single();
      let email = String(b.email ?? '').trim().toLowerCase();
      if (!email && acc?.is_demo) email = `muhasebe-${crypto.randomUUID().slice(0, 8)}@test.gidero.app`;
      if (!EMAIL_RE.test(email)) return json(400, { error: 'Muhasebecinin e-postasını yazın; giriş bu e-postayla yapılır.' });

      const target = await inviteTarget(admin, email);
      if (target.pending_owner_invite) {
        return json(400, { error: 'Bu e-posta bir müşteri hesabının sahibi olarak davet edilmiş; başka bir e-posta kullanın.' });
      }
      let userId = target.user_id;
      let created = false;
      if (!userId) {
        userId = await createUser(admin, email, name);
        created = true;
      }
      const { error: addErr } = await asCaller.rpc('bureau_add_staff', { p_account: account, p_email: email });
      if (addErr) {
        if (created) await admin.auth.admin.deleteUser(userId);
        return json(400, { error: addErr.message });
      }
      if (!created) await admin.from('profiles').update({ full_name: name }).eq('id', userId).eq('full_name', '');
      for (const company of b.company_ids ?? []) {
        await asCaller.rpc('bureau_assign', { p_account: account, p_user: userId, p_company: company, p_assigned: true });
      }
      let link: string | null = null;
      if (!acc?.is_demo) {
        const { data: may } = await asCaller.rpc('can_issue_bureau_invite', { p_account: account, p_user: userId });
        if (created || may === true) link = inviteUrl(await recoveryToken(admin, email));
      }
      return json(200, { user_id: userId, email, link, demo: !!acc?.is_demo });
    }

    if (b.action === 'staff_link') {
      const { data: may } = await asCaller.rpc('can_issue_bureau_invite', { p_account: b.account_id, p_user: b.user_id });
      if (may !== true) {
        return json(400, { error: 'Bu kişiye bağlantı verilemez: şifresini belirlemiş. Şifresini unuttuysa giriş ekranındaki "Şifremi unuttum"u kullansın.' });
      }
      const { data: u, error } = await admin.auth.admin.getUserById(String(b.user_id));
      if (error || !u?.user?.email) return json(400, { error: 'Kişi bulunamadı.' });
      return json(200, { link: inviteUrl(await recoveryToken(admin, u.user.email)) });
    }

    if (b.action === 'owner_link') {
      const { data: email, error } = await asCaller.rpc('admin_owner_email', { p_account: b.account_id });
      if (error || !email) return json(403, { error: error?.message ?? 'Hesap sahibi bulunamadı.' });
      const name = String(b.full_name ?? '').trim();
      const target = await inviteTarget(admin, String(email));
      if (target.has_password) {
        return json(200, { link: null, email, note: 'Hesap sahibi şifresini belirlemiş; kendi şifresiyle girer.' });
      }
      // Kişi yoksa açılır; bekleyen davet veritabanı tetikleyicisiyle hesaba bağlanır
      const userId = target.user_id ?? (await createUser(admin, String(email), name));
      if (name) await admin.from('profiles').update({ full_name: name }).eq('id', userId).eq('full_name', '');
      return json(200, { link: inviteUrl(await recoveryToken(admin, String(email))), email });
    }

    return json(400, { error: 'Bilinmeyen işlem.' });
  } catch (e) {
    console.error('people', e);
    return json(500, { error: 'İşlem tamamlanamadı. Biraz sonra tekrar deneyin.' });
  }
});
