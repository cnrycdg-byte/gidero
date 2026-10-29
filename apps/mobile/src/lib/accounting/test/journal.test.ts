import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';

import { buildEntry, totals, type CompanySettings, type ExpenseInput, type ReportInput } from '../journal.ts';
import { excelExport, logoExport, lucaExport, trDate, trNumber } from '../formats.ts';

const company: CompanySettings = {
  legal_name: 'Ege Dağıtım A.Ş.',
  account_personnel: '335',
  account_card: '309',
  account_advance: '195',
  account_cash: '100',
  account_vat: '191',
  vat_accounts: { '20': '191.20', '10': '191.10' },
  account_kkeg: '689',
  car_kkeg_vat_deductible: false,
};

const exp = (over: Partial<ExpenseInput>): ExpenseInput => ({
  id: 'e', doc_date: '2026-10-19', doc_type: 'e_arsiv', doc_no: 'GIB1', ettn: null, seller_name: 'Satıcı', seller_vkn: null,
  total: 0, payment_method: 'personal', description: '', attendees: [], category: null, vat_lines: [], flag_codes: [], flag_messages: [],
  ...over,
});

const report = (expenses: ExpenseInput[], personnel: string | null = '335.0042'): ReportInput => ({
  id: 'r1', title: 'Ekim 2026 masrafları', period: '2026-10', owner_name: 'Ayşe Demir', owner_personnel_account: personnel,
  approved_at: '2026-10-31T10:00:00Z', expenses,
});

const meal = { name: 'Yemek', expense_account: '770.01', tax_rule: 'meal', kkeg_ratio: null };
const fuel = { name: 'Akaryakıt', expense_account: '770.04', tax_rule: 'fuel', kkeg_ratio: 30 };

test('KDV ayrılır, personel hesabına alacak yazılır (skill örneği)', () => {
  const en = buildEntry(report([exp({ total: 1100, category: meal, vat_lines: [{ rate: 10, base: 1000, vat: 100 }] })]), company);
  assert.deepEqual(en.lines.map((l) => [l.account_code, l.debit, l.credit]), [
    ['770.01', 1000, 0],
    ['191.10', 100, 0],
    ['335.0042', 0, 1100],
  ]);
  assert.deepEqual(totals(en), { debit: 1100, credit: 1100 });
  assert.equal(en.warnings.length, 0);
});

test('Yazar kasa fişinde indirilemeyen KDV gidere eklenir', () => {
  const en = buildEntry(report([exp({ doc_type: 'okc_fis', total: 1100, category: meal, vat_lines: [{ rate: 10, base: 1000, vat: 100 }], flag_codes: ['okc_vat_not_deductible'] })]), company);
  assert.deepEqual(en.lines.map((l) => [l.account_code, l.debit, l.credit]), [['770.01', 1100, 0], ['335.0042', 0, 1100]]);
});

test('Binek araç: %30 KKEG, KKEG payının KDV\'si de indirilmez', () => {
  const en = buildEntry(report([exp({ total: 2150.4, category: fuel, vat_lines: [{ rate: 20, base: 1792, vat: 358.4 }] })]), company);
  const by = Object.fromEntries(en.lines.map((l) => [l.account_code, l.debit || -l.credit]));
  assert.equal(by['770.04'], 1254.4); // 1792 × %70
  assert.equal(by['689'], 537.6 + 107.52); // 1792 × %30 + 358,40 × %30
  assert.equal(by['191.20'], 250.88);
  assert.equal(by['335.0042'], -2150.4);
  assert.deepEqual(totals(en), { debit: 2150.4, credit: 2150.4 });
});

test('Şirket kartı ve kuruş yuvarlaması dengede kalır', () => {
  const en = buildEntry(report([
    exp({ id: 'a', total: 33.33, category: { ...fuel, kkeg_ratio: 30 }, vat_lines: [{ rate: 20, base: 27.78, vat: 5.55 }], payment_method: 'company_card' }),
    exp({ id: 'b', total: 10.01, category: meal, vat_lines: [{ rate: 10, base: 9.1, vat: 0.91 }] }),
  ], null), company);
  const t = totals(en);
  assert.equal(t.debit, t.credit);
  assert.ok(en.lines.some((l) => l.account_code === '309' && l.credit === 33.33));
  assert.ok(en.lines.some((l) => l.account_code === '335' && l.credit === 10.01), 'Personel alt hesabı yoksa şirketin 335 hesabı');
});

test('Gider grubu yoksa uyarı verilir ve 770 kullanılır', () => {
  const en = buildEntry(report([exp({ total: 50 })]), company);
  assert.equal(en.lines[0].account_code, '770');
  assert.match(en.warnings[0], /gider grubu/);
});

test('Biçimler: tarih ve sayı Türkçe yazılır', () => {
  assert.equal(trDate('2026-10-05'), '05.10.2026');
  assert.equal(trNumber(1792), '1792,00');
});

test('Excel, Luca ve Logo dosyaları üretilir', () => {
  const r = report([exp({ total: 1100, category: meal, vat_lines: [{ rate: 10, base: 1000, vat: 100 }], description: 'Müşteri & yemek' })]);
  const en = buildEntry(r, company);
  const x = excelExport([r], [en], company.legal_name, '2026-10');
  const files = unzipSync(x.bytes);
  assert.ok(files['xl/worksheets/sheet1.xml'] && files['xl/worksheets/sheet2.xml']);
  assert.match(strFromU8(files['xl/worksheets/sheet1.xml']), /Müşteri &amp; yemek/);
  assert.equal(x.filename, 'gidero-ege-dagitim-a-s-2026-10.xlsx');

  const lb = lucaExport([en], company.legal_name, '2026-10').bytes;
  assert.deepEqual([...lb.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM ile başlar (Excel Türkçe karakterleri doğru açar)');
  const l = strFromU8(lb).replace(/^﻿/, '');
  assert.ok(l.startsWith('Fiş No;Fiş Tarihi'));
  assert.match(l, /770\.01;GIB1;19\.10\.2026;.*;1000,00;0,00;Fatura/);

  const g = strFromU8(logoExport([en], company.legal_name, '2026-10').bytes);
  assert.match(g, /<GL_CODE>191\.10<\/GL_CODE>/);
  assert.match(g, /<TOTAL_DEBIT>1100\.00<\/TOTAL_DEBIT>/);
});

test('Reddedilen alkol gider yazılmaz; kendi cebinden ödendiyse çalışana ödenmez', () => {
  const e = { total: 1100, category: meal, vat_lines: [{ rate: 10, base: 1000, vat: 100 }], alcohol_amount: 330, alcohol_decision: 'rejected' as const };
  const en = buildEntry(report([exp(e)]), company);
  assert.deepEqual(en.lines.map((l) => [l.account_code, l.debit, l.credit]), [
    ['770.01', 700, 0],
    ['191.10', 70, 0],
    ['335.0042', 0, 770],
  ]);
  assert.ok(en.warnings.some((w) => w.includes('alkol')));
  const card = buildEntry(report([exp({ ...e, payment_method: 'company_card' })]), company);
  assert.deepEqual(totals(card), { debit: 1100, credit: 1100 });
  assert.ok(card.lines.some((l) => l.account_code === '335.0042' && l.debit === 330), 'Şirket kartıyla ödenen alkol çalışandan alacak olur');
  const ok = buildEntry(report([exp({ ...e, alcohol_decision: 'accepted' })]), company);
  assert.deepEqual(totals(ok), { debit: 1100, credit: 1100 });
});

test('Alkol KKEG: tutar 689 hesabına yazılır, KDV indirilmez, çalışana tamamı ödenir', () => {
  const en = buildEntry(report([exp({ total: 1100, category: meal, vat_lines: [{ rate: 10, base: 1000, vat: 100 }], alcohol_amount: 330, alcohol_decision: 'kkeg' })]), company);
  const by = Object.fromEntries(en.lines.map((l) => [l.account_code, l.debit || -l.credit]));
  assert.equal(by['770.01'], 700);
  assert.equal(by['191.10'], 70);
  assert.equal(by['689'], 330);
  assert.equal(by['335.0042'], -1100);
  assert.deepEqual(totals(en), { debit: 1100, credit: 1100 });
});
