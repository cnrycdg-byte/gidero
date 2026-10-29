import { test } from 'node:test';
import assert from 'node:assert/strict';

import { imageSize, layoutImages, spanFor } from '../layout.ts';

const receipt = (id: string, h = 1800) => ({ id, w: 600, h }); // dar yazar kasa fişi
const invoice = (id: string) => ({ id, w: 1240, h: 1754, wide: true }); // A4 fatura

test('sıkı yerleşimde kısa fişler bir A4 sayfaya çok sayıda sığar', () => {
  const pages = layoutImages(Array.from({ length: 8 }, (_, i) => receipt(String(i), 1200)), { density: 'tight' });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].items.length, 8);
});

test('görseller sayfa dışına taşmaz, üst üste binmez', () => {
  const items = [receipt('a'), invoice('b'), receipt('c', 4000), receipt('d'), invoice('e'), receipt('f', 900), receipt('g')];
  for (const density of ['tight', 'normal', 'large'] as const) {
    const pages = layoutImages(items, { density });
    assert.equal(pages.flatMap((p) => p.items).length, items.length);
    for (const p of pages) {
      for (const a of p.items) {
        assert.ok(a.x >= 0 && a.x + a.boxW <= 190.01, `${density} genişlik`);
        assert.ok(a.y >= 0 && a.y + a.h + 5 <= 277.01, `${density} yükseklik`);
        for (const b of p.items) {
          if (a === b) continue;
          const overlap = a.x < b.x + b.boxW && b.x < a.x + a.boxW && a.y < b.y + b.h + 5 && b.y < a.y + a.h + 5;
          assert.ok(!overlap, `${density}: ${a.id} ile ${b.id} üst üste`);
        }
      }
    }
  }
});

test('fatura yarım sayfa, yatay belge tam genişlik kaplar; çok uzun fiş sayfaya sığdırılır', () => {
  assert.equal(spanFor(0.33, 4), 1);
  assert.equal(spanFor(0.8, 4), 1);
  assert.equal(spanFor(0.707, 4, true), 2);
  assert.equal(spanFor(1.4, 4), 4);
  const [p] = layoutImages([receipt('uzun', 9000)], { density: 'large' });
  assert.ok(p.items[0].h <= 272);
});

test('yoğunluk azaldıkça sayfa sayısı artar', () => {
  const items = Array.from({ length: 12 }, (_, i) => receipt(String(i)));
  const n = (d: 'tight' | 'normal' | 'large') => layoutImages(items, { density: d }).length;
  assert.ok(n('tight') <= n('normal') && n('normal') <= n('large'));
});

test('görsel boyutu dosya başlığından okunur', () => {
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 640);
  new DataView(png.buffer).setUint32(20, 1280);
  assert.deepEqual(imageSize(png), { w: 640, h: 1280 });
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x00, 0x02, 0x80, 0x03]);
  assert.deepEqual(imageSize(jpg), { w: 640, h: 1280 });
  assert.equal(imageSize(new Uint8Array([1, 2, 3])), null);
});
