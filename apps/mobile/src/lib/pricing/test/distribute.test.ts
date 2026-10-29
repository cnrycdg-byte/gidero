import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTiers, distribute, parseThresholds, priceFor } from '../distribute.ts';

test('kademe başlangıçları yazıdan okunur, sıralanır, en az adetin altı atılır', () => {
  assert.deepEqual(parseThresholds('50, 10;25 10 2', 3), [10, 25, 50]);
});

test('en yüksek ve en düşük fiyat arasına dağıtılır, fiyat hiç yükselmez', () => {
  for (const curve of ['even', 'early', 'late'] as const) {
    const p = distribute(299, 185, [10, 25, 50, 100, 250], curve);
    assert.equal(p[0], 299);
    assert.equal(p.at(-1), 185);
    for (let i = 1; i < p.length; i++) assert.ok(p[i] <= p[i - 1], curve);
  }
  assert.deepEqual(distribute(300, 200, [10, 20], 'even'), [300, 250, 200]);
  assert.ok(distribute(300, 200, [10, 20, 30, 40], 'early')[1] < distribute(300, 200, [10, 20, 30, 40], 'late')[1]);
});

test('kademe satırları adet aralığı, aylık ve yıllık fiyatla oluşur', () => {
  const tiers = buildTiers([300, 250, 200], [10, 20], 3, 240);
  assert.deepEqual(tiers.map((t) => [t.from, t.to]), [[3, 9], [10, 19], [20, null]]);
  assert.equal(tiers[1].monthly, 250);
  assert.equal(tiers[0].yearly, 240);
  assert.ok(Math.abs(tiers[2].yearly - 160) < 0.05);
  assert.equal(priceFor(tiers, 15, 'month'), 250);
  assert.equal(priceFor(tiers, 1, 'month'), 300);
});
