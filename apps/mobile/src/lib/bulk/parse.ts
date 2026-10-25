// Toplu yükleme için dosya çözümleyiciler (saf, bağımlılıksız; testleri test/parse.test.ts).
// - e-Fatura / e-Arşiv UBL-TR XML'inden masraf alanları
// - WhatsApp "Sohbeti dışa aktar" metninden: hangi fotoğrafı kim, ne zaman gönderdi
// - Gönderen adını şirketteki kişiyle eşleştirme

export type VatLine = { rate: number; base: number; vat: number };

export type Invoice = {
  doc_type: 'e_fatura' | 'e_arsiv';
  ettn: string | null;
  doc_no: string | null;
  doc_date: string | null; // YYYY-MM-DD
  seller_name: string | null;
  seller_vkn: string | null;
  buyer_name: string | null;
  buyer_vkn: string | null;
  currency: string;
  total: number | null;
  vat_lines: VatLine[];
  accommodation_tax: number;
  plate: string | null;
  notes: string[];
};

const tag = (name: string) => `(?:[A-Za-z0-9_]+:)?${name}`;
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')
    .trim();

/** <X ...>...</X> bloklarının içi */
function blocks(xml: string, name: string): string[] {
  const re = new RegExp(`<${tag(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag(name)}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]);
}
function first(xml: string, name: string): string | null {
  const b = blocks(xml, name)[0];
  return b === undefined ? null : decode(b);
}
function withAttr(xml: string, name: string): { attrs: string; text: string }[] {
  const re = new RegExp(`<${tag(name)}(\\s[^>]*)?>([\\s\\S]*?)</${tag(name)}>`, 'g');
  return [...xml.matchAll(re)].map((m) => ({ attrs: m[1] ?? '', text: decode(m[2]) }));
}
const num = (s: string | null) => {
  if (s == null || s === '') return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

function party(xml: string, name: string) {
  const p = blocks(xml, name)[0] ?? '';
  let id: string | null = null;
  for (const x of withAttr(p, 'ID')) {
    if (/schemeID\s*=\s*"(VKN|TCKN)"/i.test(x.attrs)) {
      id = x.text.replace(/\D/g, '');
      break;
    }
  }
  const org = first(blocks(p, 'PartyName')[0] ?? '', 'Name');
  const person = blocks(p, 'Person')[0];
  const personName = person ? [first(person, 'FirstName'), first(person, 'FamilyName')].filter(Boolean).join(' ') : null;
  return { vkn: id, name: org || personName || null };
}

const PLATE = /\b(0[1-9]|[1-7][0-9]|8[01])\s?([A-ZÇĞİÖŞÜ]{1,3})\s?(\d{2,5})\b/;

/** UBL-TR fatura XML'ini çözer; fatura değilse null döner. */
export function parseUblInvoice(raw: string): Invoice | null {
  if (!/<(?:[A-Za-z0-9_]+:)?Invoice[\s>]/.test(raw)) return null;
  // İmza ve uzantılar iç içe ID/UUID taşır; önce at
  const xml = raw.replace(new RegExp(`<${tag('UBLExtensions')}[\\s\\S]*?</${tag('UBLExtensions')}>`, 'g'), '')
    .replace(new RegExp(`<${tag('Signature')}[\\s\\S]*?</${tag('Signature')}>`, 'g'), '');
  const head = xml.split(new RegExp(`<${tag('AccountingSupplierParty')}`))[0];

  const profile = (first(head, 'ProfileID') ?? '').toUpperCase();
  const seller = party(xml, 'AccountingSupplierParty');
  const buyer = party(xml, 'AccountingCustomerParty');

  const vat = new Map<number, VatLine>();
  let accommodation = 0;
  const totals = blocks(xml, 'TaxTotal');
  // Belge düzeyi vergi toplamı satır düzeyinden sonra gelir; satırları (InvoiceLine) çıkarıp belge düzeyine bak
  const docLevel = xml.replace(new RegExp(`<${tag('InvoiceLine')}[\\s\\S]*?</${tag('InvoiceLine')}>`, 'g'), '');
  for (const t of blocks(docLevel, 'TaxTotal').length ? blocks(docLevel, 'TaxTotal') : totals) {
    for (const sub of blocks(t, 'TaxSubtotal')) {
      const code = first(blocks(sub, 'TaxScheme')[0] ?? sub, 'TaxTypeCode') ?? '0015';
      const amount = num(first(sub, 'TaxAmount')) ?? 0;
      if (code === '0015') {
        const rate = num(first(sub, 'Percent')) ?? 0;
        const line = vat.get(rate) ?? { rate, base: 0, vat: 0 };
        line.base = Math.round((line.base + (num(first(sub, 'TaxableAmount')) ?? 0)) * 100) / 100;
        line.vat = Math.round((line.vat + amount) * 100) / 100;
        vat.set(rate, line);
      } else if (code === '0059') {
        accommodation += amount;
      }
    }
  }

  const monetary = blocks(docLevel, 'LegalMonetaryTotal')[0] ?? '';
  const payable = withAttr(monetary, 'PayableAmount')[0];
  const notes = withAttr(head, 'Note').map((n) => n.text).filter(Boolean);
  const plateMatch = notes.join(' ').toLocaleUpperCase('tr-TR').match(PLATE);

  return {
    doc_type: profile === 'EARSIVFATURA' ? 'e_arsiv' : 'e_fatura',
    ettn: first(head, 'UUID'),
    doc_no: first(head, 'ID'),
    doc_date: first(head, 'IssueDate'),
    seller_name: seller.name,
    seller_vkn: seller.vkn,
    buyer_name: buyer.name,
    buyer_vkn: buyer.vkn,
    currency: (payable?.attrs.match(/currencyID\s*=\s*"([A-Z]{3})"/)?.[1] ?? first(head, 'DocumentCurrencyCode') ?? 'TRY').toUpperCase(),
    total: num(payable?.text ?? null),
    vat_lines: [...vat.values()].filter((v) => v.base > 0 || v.vat > 0),
    accommodation_tax: Math.round(accommodation * 100) / 100,
    plate: plateMatch ? `${plateMatch[1]}${plateMatch[2]}${plateMatch[3]}` : null,
    notes,
  };
}

// ---------------------------------------------------------------------------
// WhatsApp sohbet dışa aktarımı
// ---------------------------------------------------------------------------
export type ChatMedia = { file: string; sender: string; sent_at: string | null };

const MEDIA = /([\w.\- ]+\.(?:jpe?g|png|heic|webp|pdf|xml))/i;
// iOS:     [25.10.2026 14:03:12] Ahmet Yılmaz: <ek: 00000012-PHOTO-2026-10-25-14-03-12.jpg>
// Android: 25.10.2026 14:03 - Ahmet Yılmaz: IMG-20261025-WA0003.jpg (dosya ekli)
const LINE = /^‎?\[?(\d{1,2})[./](\d{1,2})[./](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\]?\s*(?:-\s*)?([^:]{1,60}):\s*(.*)$/;

export function parseWhatsAppChat(text: string): ChatMedia[] {
  const out: ChatMedia[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[‎‏‪-‮]/g, '');
    const m = LINE.exec(line);
    if (!m) continue;
    const media = MEDIA.exec(m[7]);
    if (!media) continue;
    const [, d, mo, y, h, mi, sender] = m;
    const year = y.length === 2 ? `20${y}` : y;
    out.push({
      file: media[1].trim(),
      sender: sender.trim(),
      sent_at: `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:00`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ad eşleştirme
// ---------------------------------------------------------------------------
export function normName(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** WhatsApp'taki gönderen adını şirketteki kişiyle eşleştirir; emin değilse null. */
export function matchPerson<T extends { full_name: string }>(sender: string, people: T[]): T | null {
  const s = normName(sender);
  if (!s) return null;
  const exact = people.filter((p) => normName(p.full_name) === s);
  if (exact.length === 1) return exact[0];
  const words = s.split(' ');
  const scored = people
    .map((p) => {
      const pw = normName(p.full_name).split(' ');
      const hit = words.filter((w) => w.length > 1 && pw.includes(w)).length;
      return { p, hit, all: hit === words.length || hit === pw.length };
    })
    .filter((x) => x.hit > 0 && x.all);
  if (scored.length === 1) return scored[0].p;
  return null;
}

/** Plaka metnini karşılaştırma biçimine getirir: "35 abc 123" → "35ABC123" */
export function normPlate(s: string | null | undefined): string {
  return (s ?? '').toLocaleUpperCase('tr-TR').replace(/[^0-9A-ZÇĞİÖŞÜ]/g, '');
}
