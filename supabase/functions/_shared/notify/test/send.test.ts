import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailHtml, pushMessages, sendPush, type Note } from '../send.ts';

const n: Note = { id: 1, user_id: 'u1', report_id: 'r1', kind: 'approval_needed', title: 'Onayınızı bekleyen rapor', body: 'Ayşe <Demir>: Ekim, 1.234,50 TL' };

test('her cihaza bir bildirim hazırlanır', () => {
  const m = pushMessages([n, { ...n, id: 2, user_id: 'u2' }], new Map([['u1', ['t1', 't2']]]));
  assert.equal(m.length, 2);
  assert.deepEqual(m[0].data, { report_id: 'r1', kind: 'approval_needed' });
});

test('uygulaması silinmiş cihaz adresleri ayıklanır', async () => {
  const fake = (async () =>
    new Response(JSON.stringify({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }), { status: 200 })) as unknown as typeof fetch;
  const r = await sendPush(pushMessages([n], new Map([['u1', ['t1', 't2']]])), fake);
  assert.deepEqual(r, { invalid: ['t2'], sent: 1 });
});

test('e-posta metni kaçışlanır ve rapora bağlanır', () => {
  const h = emailHtml(n, 'https://gidero.expo.app');
  assert.match(h, /Ayşe &lt;Demir&gt;/);
  assert.match(h, /https:\/\/gidero\.expo\.app\/report\/r1/);
});
