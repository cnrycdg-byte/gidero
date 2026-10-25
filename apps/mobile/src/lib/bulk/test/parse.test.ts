import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchPerson, normName, parseUblInvoice, parseWhatsAppChat } from '../parse.ts';

// GİB UBL-TR yapısında kısaltılmış örnek (imza ve satırlar dahil)
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><ds:Signature><cbc:ID>SIG</cbc:ID></ds:Signature></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>EARSIVFATURA</cbc:ProfileID>
  <cbc:ID>OPT2026000004521</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>8F1C2E4A-1B2C-4D5E-9F00-123456789ABC</cbc:UUID>
  <cbc:IssueDate>2026-10-19</cbc:IssueDate>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:Note>Plaka: 35 ABC 123 &amp; teşekkürler</cbc:Note>
  <cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>
  <cac:Signature><cbc:ID schemeID="VKN_TCKN">6470012345</cbc:ID></cac:Signature>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="VKN">6470012345</cbc:ID></cac:PartyIdentification>
    <cac:PartyIdentification><cbc:ID schemeID="MERSISNO">0647001234500017</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Opet Bornova Akaryakıt Ltd. Şti.</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Ege Dağıtım A.Ş.</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">358.40</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">1792.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">358.40</cbc:TaxAmount>
      <cbc:Percent>20</cbc:Percent>
      <cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">1792.00</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">2150.40</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="TRY">2150.40</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID>
    <cac:TaxTotal><cbc:TaxAmount currencyID="TRY">358.40</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="TRY">1792.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="TRY">358.40</cbc:TaxAmount><cbc:Percent>20</cbc:Percent><cac:TaxCategory><cac:TaxScheme><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  </cac:InvoiceLine>
</Invoice>`;

test('e-Arşiv XML okunur: ETTN, satıcı, alıcı, KDV, toplam, plaka', () => {
  const inv = parseUblInvoice(XML)!;
  assert.equal(inv.doc_type, 'e_arsiv');
  assert.equal(inv.ettn, '8F1C2E4A-1B2C-4D5E-9F00-123456789ABC');
  assert.equal(inv.doc_no, 'OPT2026000004521');
  assert.equal(inv.doc_date, '2026-10-19');
  assert.equal(inv.seller_vkn, '6470012345');
  assert.equal(inv.seller_name, 'Opet Bornova Akaryakıt Ltd. Şti.');
  assert.equal(inv.buyer_vkn, '1234567890');
  assert.equal(inv.total, 2150.4);
  assert.deepEqual(inv.vat_lines, [{ rate: 20, base: 1792, vat: 358.4 }], 'satır düzeyi KDV iki kez sayılmaz');
  assert.equal(inv.plate, '35ABC123');
  assert.equal(inv.notes[0], 'Plaka: 35 ABC 123 & teşekkürler');
});

test('e-Fatura profili ve şahıs satıcı', () => {
  const x = XML.replace('EARSIVFATURA', 'TICARIFATURA')
    .replace('<cbc:ID schemeID="VKN">6470012345</cbc:ID>', '<cbc:ID schemeID="TCKN">12345678901</cbc:ID>')
    .replace('<cac:PartyName><cbc:Name>Opet Bornova Akaryakıt Ltd. Şti.</cbc:Name></cac:PartyName>', '<cac:Person><cbc:FirstName>Ali</cbc:FirstName><cbc:FamilyName>Kaya</cbc:FamilyName></cac:Person>');
  const inv = parseUblInvoice(x)!;
  assert.equal(inv.doc_type, 'e_fatura');
  assert.equal(inv.seller_vkn, '12345678901');
  assert.equal(inv.seller_name, 'Ali Kaya');
});

test('fatura olmayan XML reddedilir', () => {
  assert.equal(parseUblInvoice('<ApplicationResponse></ApplicationResponse>'), null);
});

test('WhatsApp iOS ve Android dışa aktarımı okunur', () => {
  const ios = '[25.10.2026 14:03:12] Ahmet Yılmaz: ‎<ek: 00000012-PHOTO-2026-10-25-14-03-12.jpg>\n[25.10.2026 14:04:01] Ahmet Yılmaz: Bu dünkü yemek';
  const android = '25.10.2026 14:03 - Ayşe Demir: IMG-20261025-WA0003.jpg (dosya ekli)\n25.10.2026 14:05 - Ayşe Demir: fatura.pdf (dosya ekli)';
  assert.deepEqual(parseWhatsAppChat(ios), [{ file: '00000012-PHOTO-2026-10-25-14-03-12.jpg', sender: 'Ahmet Yılmaz', sent_at: '2026-10-25T14:03:00' }]);
  const a = parseWhatsAppChat(android);
  assert.equal(a.length, 2);
  assert.equal(a[0].file, 'IMG-20261025-WA0003.jpg');
  assert.equal(a[1].file, 'fatura.pdf');
  assert.equal(a[1].sender, 'Ayşe Demir');
});

test('gönderen adı şirketteki kişiyle eşleşir', () => {
  const people = [{ full_name: 'Ayşe Demir' }, { full_name: 'Ahmet Yılmaz' }, { full_name: 'Ahmet Kaya' }];
  assert.equal(normName('AYŞE  Demir'), 'ayse demir');
  assert.equal(matchPerson('Ayse demir', people)?.full_name, 'Ayşe Demir');
  assert.equal(matchPerson('Ahmet Yılmaz', people)?.full_name, 'Ahmet Yılmaz');
  assert.equal(matchPerson('Ahmet', people), null, 'iki Ahmet varsa tahmin edilmez');
  assert.equal(matchPerson('+90 532 111 22 33', people), null);
});
