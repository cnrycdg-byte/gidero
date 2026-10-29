// notify: bekleyen bildirimleri gönderir (telefon bildirimi + ayarlıysa e-posta).
//
// POST (Authorization: Bearer <oturum>) → { push, email }
// Uygulama onaya gönderme, onaylama ve iade işlemlerinden hemen sonra çağırır. Bildirim satırları veritabanında
// tetikleyiciyle üretildiği için bu fonksiyon yalnızca gönderir; kimin neyi alacağına karar vermez.
// E-posta için gizli ayarlar: RESEND_API_KEY ve NOTIFY_FROM (örn. "Gidero <bildirim@gidero.tr>"). Yoksa atlanır.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { pushMessages, sendEmail, sendPush, type Note } from '../_shared/notify/send.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const EMAIL_KINDS = new Set(['approval_needed', 'returned', 'ready_for_accounting']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Yalnızca POST' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const appUrl = Deno.env.get('APP_URL') ?? 'https://gidero.expo.app';

  // Çağıranın oturumu geçerli olmalı (verify_jwt açık); kimin çağırdığı gönderimi değiştirmez.
  const since = new Date(Date.now() - 864e5).toISOString();
  const result = { push: 0, email: 0 };

  // Telefon bildirimleri
  const { data: pending } = await db
    .from('notifications')
    .select('id, user_id, report_id, kind, title, body')
    .is('push_sent_at', null)
    .gte('created_at', since)
    .order('created_at')
    .limit(200);
  const notes = (pending ?? []) as Note[];
  if (notes.length) {
    const users = [...new Set(notes.map((n) => n.user_id))];
    const { data: toks } = await db.from('push_tokens').select('token, user_id').in('user_id', users);
    const tokens = new Map<string, string[]>();
    for (const t of toks ?? []) tokens.set(t.user_id, [...(tokens.get(t.user_id) ?? []), t.token]);
    try {
      const r = await sendPush(pushMessages(notes, tokens));
      result.push = r.sent;
      if (r.invalid.length) await db.from('push_tokens').delete().in('token', r.invalid);
    } catch (e) {
      console.error('notify push', e);
    }
    await db.from('notifications').update({ push_sent_at: new Date().toISOString() }).in('id', notes.map((n) => n.id));
  }

  // E-postalar
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NOTIFY_FROM');
  if (apiKey && from) {
    const { data: mails } = await db
      .from('notifications')
      .select('id, user_id, report_id, kind, title, body')
      .is('email_sent_at', null)
      .gte('created_at', since)
      .in('kind', [...EMAIL_KINDS])
      .order('created_at')
      .limit(50);
    // E-posta bildirimini kapatan kişilere gönderilmez
    const ids = [...new Set(((mails ?? []) as Note[]).map((n) => n.user_id))];
    const { data: prefs } = ids.length ? await db.from('profiles').select('id, email_notifications').in('id', ids) : { data: [] };
    const off = new Set((prefs ?? []).filter((p: { email_notifications: boolean }) => p.email_notifications === false).map((p: { id: string }) => p.id));
    for (const n of (mails ?? []) as Note[]) {
      if (off.has(n.user_id)) {
        await db.from('notifications').update({ email_sent_at: new Date().toISOString() }).eq('id', n.id);
        continue;
      }
      try {
        const { data: u } = await db.auth.admin.getUserById(n.user_id);
        if (u?.user?.email) {
          await sendEmail({ apiKey, from }, u.user.email, n, appUrl);
          result.email++;
        }
      } catch (e) {
        console.error('notify email', e);
      }
      await db.from('notifications').update({ email_sent_at: new Date().toISOString() }).eq('id', n.id);
    }
  }

  return json(200, result);
});
