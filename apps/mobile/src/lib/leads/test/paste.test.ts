import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePasted } from '../paste.ts';

test('Excel başlığıyla yapıştırılan satırlar sütun adından okunur', () => {
  const rows = parsePasted('Şehir\tFirma\tE-posta\nİzmir\tDemir SMMM\tInfo@Demir.com\nAnkara\tKaya Müşavirlik\t');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { name: 'Demir SMMM', email: 'info@demir.com', city: 'İzmir', kind: 'bureau', source: 'csv' });
  assert.equal(rows[1].email, undefined);
});

test('başlıksız satırda sıra: ad, e-posta, şehir', () => {
  const rows = parsePasted('Ege Muhasebe; ege@ornek.com; Bursa', 'company');
  assert.equal(rows[0].city, 'Bursa');
  assert.equal(rows[0].kind, 'company');
});

test('yalnızca e-posta yazılırsa ad alan adından üretilir; boş satır atlanır', () => {
  const rows = parsePasted('ofis@yildizmusavirlik.com\n\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'yildizmusavirlik');
});
