import { test } from 'node:test';
import assert from 'node:assert/strict';

import { brandPalette, contrast, dominantColor, normalizeHex } from '../colors.ts';

const base = {
  canvas: '#F4F6F5', paper: '#FFFFFF', pen: '#0B6E5F', penSoft: '#E6F1EE', onPen: '#FFFFFF',
  deep: '#0B3D35', onDeep: '#FFFFFF', onDeepMuted: '#9CC9BF', gold: '#F2A93B', red: '#B42318',
};
const dark = { ...base, canvas: '#0A1513', paper: '#13221F', pen: '#4FC2A8' };

test('Renk yazımı düzeltilir', () => {
  assert.equal(normalizeHex('c8102e'), '#C8102E');
  assert.equal(normalizeHex('#c10'), '#CC1100');
  assert.equal(normalizeHex('kirmizi'), null);
});

test('Marka yoksa palet değişmez', () => {
  assert.equal(brandPalette(base, { primary: null, accent: null }, 'light'), base);
});

test('Açık renkli marka bile okunur kalır (WCAG AA)', () => {
  for (const primary of ['#FFD700', '#00FFFF', '#C8102E', '#000000', '#FFFFFF']) {
    const p = brandPalette(base, { primary, accent: null }, 'light');
    assert.ok(contrast(p.pen, p.paper) >= 4.5, `${primary} metin`);
    assert.ok(contrast(p.onPen, p.pen) >= 4.5, `${primary} buton`);
    assert.ok(contrast(p.onDeep, p.deep) >= 4.5, `${primary} koyu alan`);
    const d = brandPalette(dark, { primary, accent: null }, 'dark');
    assert.ok(contrast(d.pen, d.paper) >= 4.5, `${primary} koyu tema metin`);
    assert.ok(contrast(d.onPen, d.pen) >= 4.5, `${primary} koyu tema buton`);
  }
});

test('Uyarı rengi markayla değişmez, vurgu rengi uygulanır', () => {
  const p = brandPalette(base, { primary: '#1F3A93', accent: '#F5B700' }, 'light');
  assert.equal(p.red, base.red);
  assert.equal(p.gold, '#F5B700');
});

test('Logonun baskın rengi bulunur, beyaz zemin sayılmaz', () => {
  const px: number[] = [];
  for (let i = 0; i < 100; i++) px.push(255, 255, 255, 255); // beyaz
  for (let i = 0; i < 30; i++) px.push(200, 16, 46, 255); // kırmızı
  for (let i = 0; i < 10; i++) px.push(0, 87, 184, 255); // mavi
  assert.equal(dominantColor(px), '#C8102E');
  assert.equal(dominantColor([255, 255, 255, 255]), null);
});
