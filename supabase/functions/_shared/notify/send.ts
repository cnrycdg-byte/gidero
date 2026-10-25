// Bildirim gönderimi: Expo telefon bildirimi ve (ayarlıysa) Resend ile e-posta. Saf yardımcılar test edilir.

export type Note = { id: number; user_id: string; report_id: string | null; kind: string; title: string; body: string };
export type PushMessage = { to: string; title: string; body: string; sound: 'default'; data: Record<string, unknown> };

type Fetch = typeof fetch;

export function pushMessages(notes: Note[], tokens: Map<string, string[]>): PushMessage[] {
  const out: PushMessage[] = [];
  for (const n of notes) {
    for (const to of tokens.get(n.user_id) ?? []) {
      out.push({ to, title: n.title, body: n.body, sound: 'default', data: { report_id: n.report_id, kind: n.kind } });
    }
  }
  return out;
}

/** Expo push servisine 100'erli gönderir; geçersiz (uygulaması silinmiş) adresleri döndürür. */
export async function sendPush(messages: PushMessage[], fetchImpl: Fetch = fetch): Promise<{ invalid: string[]; sent: number }> {
  const invalid: string[] = [];
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetchImpl('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`Expo push ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    (data.data ?? []).forEach((t: { status: string; details?: { error?: string } }, j: number) => {
      if (t.status === 'ok') sent++;
      else if (t.details?.error === 'DeviceNotRegistered') invalid.push(chunk[j].to);
    });
  }
  return { invalid, sent };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function emailHtml(n: Note, appUrl: string): string {
  const link = n.report_id ? `${appUrl}/report/${n.report_id}` : appUrl;
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#F4F6F5;font-family:-apple-system,Segoe UI,sans-serif;color:#16211F">
<div style="max-width:480px;margin:24px auto;background:#fff;border-radius:16px;padding:28px">
<div style="font-weight:700;font-size:20px;color:#0B3D35;margin-bottom:16px">gidero</div>
<h1 style="font-size:20px;margin:0 0 8px">${esc(n.title)}</h1>
<p style="font-size:16px;line-height:1.5;color:#4A5856;margin:0 0 24px">${esc(n.body)}</p>
<a href="${link}" style="display:inline-block;background:#0B6E5F;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Raporu aç</a>
<p style="font-size:12px;color:#8A9693;margin:24px 0 0">Bu e-postayı Gidero'daki hesabınızla ilgili bir işlem olduğu için aldınız.</p>
</div></body></html>`;
}

export async function sendEmail(
  cfg: { apiKey: string; from: string },
  to: string,
  n: Note,
  appUrl: string,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ from: cfg.from, to: [to], subject: `Gidero: ${n.title}`, html: emailHtml(n, appUrl), text: `${n.title}\n\n${n.body}` }),
  });
  if (!res.ok) throw new Error(`E-posta ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
