// Yevmiye kayıtlarını muhasebe programlarının içeri aktarım dosyalarına çevirir.
// Excel: döküm + yevmiye sayfaları (her programa elle de aktarılabilir).
// Luca ve Logo: TASLAK şablonlar. Pilot müşterinin programından alınmış gerçek örnek dosyayla
// doğrulanana kadar arayüzde "deneme" olarak gösterilir (muhasebe-aktarim skill'i).

import { strToU8, zipSync } from 'fflate';

import { DOC_TYPE_LABEL, type JournalEntry, type ReportInput } from './journal.ts';

export type ExportFile = { filename: string; mime: string; bytes: Uint8Array };

/** GG.AA.YYYY */
export function trDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** 1234.5 → "1234,50" (binlik ayırıcı yok; programlar içeri alırken karışmasın) */
export function trNumber(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

// ---------------------------------------------------------------------------
// Excel (xlsx): bağımlılıksız küçük yazıcı, satır içi metin hücreleri
// ---------------------------------------------------------------------------
type Cell = string | number | null;

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function colName(i: number) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(rows: Cell[][], widths: number[]) {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${colName(c)}${r + 1}`;
          const style = r === 0 ? ' s="1"' : typeof v === 'number' ? ' s="2"' : '';
          if (v === null || v === '') return '';
          if (typeof v === 'number') return `<c r="${ref}"${style}><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

export function xlsx(sheets: { name: string; rows: Cell[][]; widths: number[] }[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((s, i) => `<sheet name="${xmlEscape(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows, s.widths));
  });
  return zipSync(files, { level: 6 });
}

/** Excel döküm: her fiş bir satır + yevmiye sayfası */
export function excelExport(reports: ReportInput[], entries: JournalEntry[], company: string, label: string): ExportFile {
  const dokum: Cell[][] = [[
    'Çalışan', 'Rapor', 'Belge tarihi', 'Belge türü', 'Belge no', 'Satıcı', 'Satıcı VKN', 'Gider grubu', 'Hesap',
    'Matrah', 'KDV', 'Toplam', 'Ödeme', 'Açıklama', 'Kimlerle', 'Uyarılar',
  ]];
  const PAY: Record<string, string> = { personal: 'Çalışan ödedi', company_card: 'Şirket kartı', cash_advance: 'Avans', cash: 'Kasa' };
  for (const r of reports) {
    for (const e of r.expenses) {
      const vat = e.vat_lines.reduce((a, v) => a + v.vat, 0);
      dokum.push([
        r.owner_name, r.title, e.doc_date ? trDate(e.doc_date) : '', DOC_TYPE_LABEL[e.doc_type] ?? e.doc_type, e.doc_no ?? '',
        e.seller_name ?? '', e.seller_vkn ?? '', e.category?.name ?? '', e.category?.expense_account ?? '',
        Math.round((e.total - vat) * 100) / 100, Math.round(vat * 100) / 100, e.total, PAY[e.payment_method] ?? e.payment_method,
        e.description, e.attendees.join(', '), e.flag_messages.join(' | '),
      ]);
    }
  }
  const yevmiye: Cell[][] = [['Fiş no', 'Fiş tarihi', 'Hesap kodu', 'Açıklama', 'Borç', 'Alacak', 'Belge türü', 'Belge no', 'Belge tarihi']];
  entries.forEach((en, i) => {
    for (const l of en.lines) {
      yevmiye.push([i + 1, trDate(en.entry_date), l.account_code, l.description, l.debit || null, l.credit || null, l.doc_type, l.doc_no, l.doc_date ? trDate(l.doc_date) : '']);
    }
  });
  const uyari: Cell[][] = [['Rapor', 'Uyarı']];
  entries.forEach((en) => en.warnings.forEach((w) => uyari.push([en.description, w])));

  const sheets = [
    { name: 'Döküm', rows: dokum, widths: [18, 22, 12, 16, 16, 24, 13, 18, 12, 12, 10, 12, 14, 28, 24, 50] },
    { name: 'Yevmiye', rows: yevmiye, widths: [8, 12, 14, 50, 12, 12, 10, 18, 12] },
  ];
  if (uyari.length > 1) sheets.push({ name: 'Kontrol', rows: uyari, widths: [30, 80] });
  return {
    filename: `gidero-${slug(company)}-${label}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: xlsx(sheets),
  };
}

// ---------------------------------------------------------------------------
// Luca: Fiş İşlemleri > Excel Veri Aktarımı için noktalı virgüllü CSV (TASLAK)
// ---------------------------------------------------------------------------
const csvCell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function lucaExport(entries: JournalEntry[], company: string, label: string): ExportFile {
  const rows = [['Fiş No', 'Fiş Tarihi', 'Fiş Açıklama', 'Hesap Kodu', 'Evrak No', 'Evrak Tarihi', 'Detay Açıklama', 'Borç', 'Alacak', 'Belge Türü']];
  entries.forEach((en, i) => {
    for (const l of en.lines) {
      rows.push([
        String(i + 1), trDate(en.entry_date), en.description, l.account_code, l.doc_no, l.doc_date ? trDate(l.doc_date) : '',
        l.description, l.debit ? trNumber(l.debit) : '0,00', l.credit ? trNumber(l.credit) : '0,00', l.doc_type,
      ]);
    }
  });
  const text = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
  return { filename: `gidero-luca-${slug(company)}-${label}.csv`, mime: 'text/csv;charset=utf-8', bytes: strToU8(text) };
}

// ---------------------------------------------------------------------------
// Logo Tiger / Go: Araçlar > Veri aktarımı (içeri) > Muhasebe fişleri, XML (TASLAK)
// ---------------------------------------------------------------------------
export function logoExport(entries: JournalEntry[], company: string, label: string): ExportFile {
  const x = (s: string) => xmlEscape(s);
  const vouchers = entries
    .map((en, i) => {
      const debit = en.lines.reduce((a, l) => a + l.debit, 0);
      const credit = en.lines.reduce((a, l) => a + l.credit, 0);
      const tx = en.lines
        .map(
          (l, j) => `      <TRANSACTION>
        <TYPE>${l.debit ? 0 : 1}</TYPE>
        <GL_CODE>${x(l.account_code)}</GL_CODE>
        <DEBIT>${l.debit.toFixed(2)}</DEBIT>
        <CREDIT>${l.credit.toFixed(2)}</CREDIT>
        <LINENO>${j + 1}</LINENO>
        <DESCRIPTION>${x(l.description.slice(0, 250))}</DESCRIPTION>
        <DOC_NUMBER>${x(l.doc_no)}</DOC_NUMBER>
        <DOC_DATE>${l.doc_date ? trDate(l.doc_date) : ''}</DOC_DATE>
        <DOC_TYPE>${x(l.doc_type)}</DOC_TYPE>
      </TRANSACTION>`,
        )
        .join('\n');
      return `  <GL_VOUCHER DBOP="INS">
    <TYPE>4</TYPE>
    <NUMBER>GIDERO-${en.period.replace('-', '')}-${String(i + 1).padStart(4, '0')}</NUMBER>
    <DATE>${trDate(en.entry_date)}</DATE>
    <NOTES1>${x(en.description.slice(0, 50))}</NOTES1>
    <TOTAL_DEBIT>${debit.toFixed(2)}</TOTAL_DEBIT>
    <TOTAL_CREDIT>${credit.toFixed(2)}</TOTAL_CREDIT>
    <TRANSACTIONS>
${tx}
    </TRANSACTIONS>
  </GL_VOUCHER>`;
    })
    .join('\n');
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n<GL_VOUCHERS>\n${vouchers}\n</GL_VOUCHERS>\n`;
  return { filename: `gidero-logo-${slug(company)}-${label}.xml`, mime: 'application/xml', bytes: strToU8(text) };
}

export function slug(s: string) {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  return s
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
