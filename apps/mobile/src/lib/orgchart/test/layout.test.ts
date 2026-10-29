import assert from 'node:assert/strict';
import { test } from 'node:test';

import { layoutOrg, NODE_H } from '../layout.ts';

const P = (id: string, m: string | null) => ({ user_id: id, manager_user_id: m });

test('her kişi yöneticisinin altında, bağlantı çizgisi yöneticisine gider', () => {
  const people = [P('gm', null), P('d1', 'gm'), P('d2', 'gm'), P('m1', 'd1'), P('e1', 'm1'), P('e2', 'm1'), P('m2', 'd1')];
  const { boxes, edges } = layoutOrg(people, (p) => p.user_id);
  assert.equal(boxes.size, 7);
  for (const p of people) {
    if (!p.manager_user_id) continue;
    assert.ok(boxes.get(p.user_id)!.y > boxes.get(p.manager_user_id)!.y, `${p.user_id} yöneticisinin altında`);
    assert.ok(edges.some((e) => e.from === p.user_id && e.to === p.manager_user_id), `${p.user_id} çizgisi`);
  }
});

test('yalnızca çalışanlardan oluşan grup alt alta dizilir', () => {
  const { boxes } = layoutOrg([P('m', null), P('a', 'm'), P('b', 'm'), P('c', 'm')], (p) => p.user_id);
  const xs = new Set(['a', 'b', 'c'].map((k) => boxes.get(k)!.x));
  assert.equal(xs.size, 1);
  assert.equal(boxes.get('b')!.y - boxes.get('a')!.y > NODE_H, true);
});

test('dallar ayrı renk anahtarı alır, kök dalsızdır', () => {
  const { boxes } = layoutOrg([P('gm', null), P('d1', 'gm'), P('d2', 'gm'), P('x', 'd1'), P('y', 'd2'), P('z', 'd2')], (p) => p.user_id);
  assert.equal(boxes.get('gm')!.branch, '');
  assert.equal(boxes.get('x')!.branch, 'd1');
  assert.equal(boxes.get('z')!.branch, 'd2');
});

test('döngü olsa bile çökmeden herkes yerleşir', () => {
  const { boxes } = layoutOrg([P('a', 'b'), P('b', 'a')], (p) => p.user_id);
  assert.equal(boxes.size, 2);
});
