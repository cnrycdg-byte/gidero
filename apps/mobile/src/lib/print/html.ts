// Rapor çıktısı: ilk sayfalarda rapor özeti (onay geçmişi, fiş tablosu, toplamlar), ardından fiş görselleri
// A4 sayfalara sığdırılmış hâlde. Saf fonksiyon: veriyi alır, yazdırılacak HTML'i döndürür.
import { layoutImages, type Density } from './layout.ts';

export type PrintRow = {
  no: string;
  date: string;
  seller: string;
  docType: string;
  category: string;
  payment: string;
  vat: string;
  total: string;
  notes: string[];
};

export type PrintImage = { id: string; src: string; w: number; h: number; caption: string; wide?: boolean };

export type PrintData = {
  company: string;
  companyTax: string;
  title: string;
  owner: string;
  period: string;
  status: string;
  facts: { label: string; value: string }[];
  history: { label: string; who: string; when: string; note: string | null }[];
  rows: PrintRow[];
  totals: { label: string; value: string; strong?: boolean }[];
  images: PrintImage[];
  /** Görseli basılamayan ekler (PDF gibi) */
  attachments: string[];
  generated: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const mm = (n: number) => `${Math.round(n * 100) / 100}mm`;

export function reportHtml(d: PrintData, density: Density): string {
  const pages = layoutImages(d.images.map((i) => ({ id: i.id, w: i.w, h: i.h, wide: i.wide })), { density });
  const byId = new Map(d.images.map((i) => [i.id, i]));
  const imagePages = pages
    .map((p, n) => {
      const items = p.items
        .map((it) => {
          const img = byId.get(it.id)!;
          const left = it.x + (it.boxW - it.w) / 2;
          return `<figure style="left:${mm(left)};top:${mm(it.y)};width:${mm(it.w)}"><img src="${img.src}" style="width:${mm(it.w)};height:${mm(it.h)}" alt=""><figcaption>${esc(img.caption)}</figcaption></figure>`;
        })
        .join('');
      return `<section class="sheet"><div class="sheet-head">${esc(d.title)} · fiş görselleri ${n + 1}/${pages.length}</div><div class="area">${items}</div></section>`;
    })
    .join('');

  const rows = d.rows
    .map(
      (r) => `<tr><td class="n">${esc(r.no)}</td><td>${esc(r.date)}</td><td><b>${esc(r.seller)}</b><div class="sub">${esc(r.docType)}</div>${r.notes.map((x) => `<div class="note">${esc(x)}</div>`).join('')}</td><td>${esc(r.category)}</td><td>${esc(r.payment)}</td><td class="num">${esc(r.vat)}</td><td class="num">${esc(r.total)}</td></tr>`,
    )
    .join('');

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>
@page { size: A4; margin: 10mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font: 9pt/1.35 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14201D; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-size: 16pt; margin: 0 0 1mm; }
.top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 0.4mm solid #0B6E5F; padding-bottom: 3mm; margin-bottom: 4mm; }
.muted, .sub { color: #5A6865; }
.sub { font-size: 8pt; }
.facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm 6mm; margin-bottom: 4mm; }
.facts div span { display: block; font-size: 7.5pt; color: #5A6865; }
h2 { font-size: 10.5pt; margin: 5mm 0 2mm; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 7.5pt; color: #5A6865; font-weight: 600; border-bottom: 0.3mm solid #B9C6C1; padding: 1.5mm 1.5mm; }
td { border-bottom: 0.2mm solid #DCE3E0; padding: 1.2mm 1.5mm; vertical-align: top; }
tr { break-inside: avoid; }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.n { width: 8mm; color: #5A6865; }
.note { font-size: 8pt; color: #9A4A0A; }
.after { display: flex; gap: 10mm; align-items: flex-end; margin-top: 3mm; break-inside: avoid; }
.totals { width: 80mm; flex: none; }
.totals td { border: 0; padding: 0.8mm 1.5mm; }
.totals .strong td { font-weight: 700; border-top: 0.3mm solid #14201D; padding-top: 1.5mm; }
.hist td { font-size: 8.5pt; }
.foot { margin-top: 6mm; font-size: 7.5pt; color: #5A6865; }
.sign { flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; font-size: 8pt; color: #5A6865; padding-top: 12mm; }
.sign div { border-top: 0.2mm solid #B9C6C1; padding-top: 1.5mm; }
.sheet { width: 190mm; height: 277mm; position: relative; break-before: page; page-break-before: always; overflow: hidden; }
.sheet-head { position: absolute; top: 0; left: 0; right: 0; height: 4mm; font-size: 7pt; color: #5A6865; }
.area { position: absolute; top: 5mm; left: 0; width: 190mm; height: 272mm; }
figure { position: absolute; margin: 0; }
figure img { display: block; object-fit: contain; border: 0.2mm solid #DCE3E0; }
figcaption { font-size: 6.8pt; line-height: 4mm; height: 4.6mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #14201D; }
</style></head><body>
<header class="top"><div><h1>${esc(d.title)}</h1><div class="muted">${esc(d.owner)} · ${esc(d.period)} · ${esc(d.status)}</div></div><div style="text-align:right"><b>${esc(d.company)}</b><div class="muted">VKN ${esc(d.companyTax)}</div></div></header>
<div class="facts">${d.facts.map((f) => `<div><span>${esc(f.label)}</span>${esc(f.value)}</div>`).join('')}</div>
<h2>Fişler (${d.rows.length})</h2>
<table><thead><tr><th>No</th><th>Tarih</th><th>Satıcı ve belge</th><th>Gider grubu</th><th>Kim ödedi</th><th class="num">KDV</th><th class="num">Tutar</th></tr></thead><tbody>${rows}</tbody></table>
<div class="after"><div class="sign"><div>Hazırlayan</div><div>Onaylayan</div><div>Muhasebe</div></div><table class="totals">${d.totals.map((t) => `<tr class="${t.strong ? 'strong' : ''}"><td>${esc(t.label)}</td><td class="num">${esc(t.value)}</td></tr>`).join('')}</table></div>
${d.history.length ? `<h2>Onay geçmişi</h2><table class="hist"><tbody>${d.history.map((h) => `<tr><td style="width:38mm">${esc(h.when)}</td><td style="width:42mm">${esc(h.label)}</td><td>${esc(h.who)}${h.note ? `<div class="sub">${esc(h.note)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
${d.attachments.length ? `<h2>Ayrıca yazdırılacak ekler</h2><div class="sub">${d.attachments.map(esc).join('<br>')}</div>` : ''}
<div class="foot">${esc(d.generated)}. Fiş görselleri sonraki sayfalarda, tablodaki numaralarla eşleşir.</div>
${imagePages}
</body></html>`;
}
