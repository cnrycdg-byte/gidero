import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pendingPages, sectionsFor } from '../index.ts';

test('rollere göre tanıtım bölümleri', () => {
  assert.deepEqual(sectionsFor({ roles: ['employee'], bureau: false, hasCompany: true }), ['basics']);
  assert.deepEqual(sectionsFor({ roles: ['employee', 'approver', 'admin'], bureau: false, hasCompany: true }), ['basics', 'approver', 'admin']);
  assert.deepEqual(sectionsFor({ roles: [], bureau: true, hasCompany: false }), ['basics', 'bureau']);
});

test('görülen bölüm tekrar gösterilmez, yeni rolün bölümü gösterilir', () => {
  const s = sectionsFor({ roles: ['employee', 'payer'], bureau: false, hasCompany: true });
  assert.ok(pendingPages(s, []).length > 5);
  assert.deepEqual(pendingPages(s, ['basics']).map((p) => p.key), ['payer']);
  assert.equal(pendingPages(s, ['basics', 'payer']).length, 0);
  assert.ok(pendingPages(s, ['basics', 'payer'], true).length > 5);
});
