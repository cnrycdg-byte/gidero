// Raporu fiş görselleriyle birlikte yazdırır ya da PDF olarak verir.
// Bilgisayarda tarayıcının yazdırma penceresi açılır ("PDF olarak kaydet" de buradan); telefonda PDF oluşturulup
// paylaşım menüsü açılır ya da doğrudan yazıcıya gönderilir.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { dateText, money } from '@/lib/format';
import { PAYMENT_LABEL, paymentSummary, rejectedAlcohol, type PaymentMethod } from '@/lib/payment';
import { formatPlate } from '@/lib/plate';
import { supabase } from '@/lib/supabase';
import { DOC_TYPE_LABEL, STATUS_LABEL, type ReportStatus } from '@/lib/types';

import { reportHtml, type PrintData, type PrintImage } from './html';
import { imageSize, type Density } from './layout';

const ACTION_LABEL: Record<string, string> = {
  submitted: 'Onaya gönderildi',
  approved: 'Onaylandı',
  returned: 'İade edildi',
  auto_approved: 'Kendiliğinden onaylandı',
  booked_without_approval: 'Onaysız kayda alındı',
};

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

type Exp = {
  id: string; doc_type: string; doc_date: string | null; doc_no: string | null; seller_name: string | null; total: number;
  payment_method: PaymentMethod; description: string | null; attendees: string[] | null; plate: string | null; image_path: string | null;
  alcohol_present: boolean | null; alcohol_amount: number | null; alcohol_decision: string | null;
  einvoice_confirmed_at: string | null; photo_part: number | null; photo_parts: number | null; created_at: string;
  categories: { name: string } | null; expense_vat_lines: { vat: number }[]; expense_flags: { code: string; severity: string; message: string }[];
};

export type PrintProgress = (text: string) => void;

/** Rapor, fişler ve görsellerden yazdırma verisini hazırlar */
export async function loadPrintData(reportId: string, progress: PrintProgress = () => {}): Promise<PrintData> {
  progress('Rapor hazırlanıyor…');
  const { data: r, error } = await supabase
    .from('reports')
    .select('id, company_id, title, period, status, total, owner_user_id, created_at, submitted_at, approved_at, paid_at')
    .eq('id', reportId)
    .single();
  if (error || !r) throw error ?? new Error('Rapor bulunamadı.');
  const [{ data: company }, { data: exps, error: e2 }, { data: acts }] = await Promise.all([
    supabase.from('companies').select('legal_name, tax_number').eq('id', r.company_id).single(),
    supabase
      .from('expenses')
      .select(
        'id, doc_type, doc_date, doc_no, seller_name, total, payment_method, description, attendees, plate, image_path, alcohol_present, alcohol_amount, alcohol_decision, einvoice_confirmed_at, photo_part, photo_parts, created_at, categories(name), expense_vat_lines(vat), expense_flags(code, severity, message)',
      )
      .eq('report_id', reportId)
      .order('created_at', { ascending: true }),
    supabase.from('approval_actions').select('action, note, created_at, actor_user_id').eq('report_id', reportId).order('created_at'),
  ]);
  if (e2) throw e2;
  const expenses = ((exps ?? []) as unknown as Exp[]).sort((a, b) =>
    (a.doc_date ?? a.created_at.slice(0, 10)).localeCompare(b.doc_date ?? b.created_at.slice(0, 10)) || a.created_at.localeCompare(b.created_at),
  );
  const actions = (acts ?? []) as { action: string; note: string | null; created_at: string; actor_user_id: string }[];
  const ids = [...new Set([r.owner_user_id, ...actions.map((a) => a.actor_user_id)])];
  const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids);
  const name = new Map(((people ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name || 'Kullanıcı']));

  const no = new Map(expenses.map((e, i) => [e.id, i + 1]));
  const rows = expenses.map((e) => {
    const vat = (e.expense_vat_lines ?? []).reduce((a, l) => a + Number(l.vat), 0);
    const notes: string[] = [];
    if (e.doc_type === 'bilgi_fisi') notes.push(e.einvoice_confirmed_at ? 'Bilgi fişi: çalışan e-Arşiv faturasının şirket adına geldiğini onayladı.' : 'Bilgi fişi: e-Arşiv faturası onayı yok.');
    if (e.alcohol_present) {
      const a = money(Number(e.alcohol_amount ?? 0));
      notes.push(
        e.alcohol_decision === 'rejected' ? `Alkol ${a}: reddedildi, ödenmez.` : e.alcohol_decision === 'kkeg' ? `Alkol ${a}: KKEG.` : e.alcohol_decision === 'accepted' ? `Alkol ${a}: normal gider.` : `Alkol ${a}: karar bekliyor.`,
      );
    }
    for (const f of e.expense_flags ?? []) {
      if (f.severity !== 'info' && !['alcohol', 'alcohol_decided', 'info_slip'].includes(f.code)) notes.push(f.message);
    }
    const extra = [e.attendees?.length ? `Kimlerle: ${e.attendees.join(', ')}` : '', e.plate ? `Plaka ${formatPlate(e.plate)}` : '', e.description ?? ''].filter(Boolean);
    return {
      no: String(no.get(e.id)),
      date: dateText(e.doc_date),
      seller: e.seller_name || DOC_TYPE_LABEL[e.doc_type] || 'Fiş',
      docType: [DOC_TYPE_LABEL[e.doc_type] ?? '', e.doc_no ? `No ${e.doc_no}` : '', ...extra].filter(Boolean).join(', '),
      category: e.categories?.name ?? 'Grup seçilmemiş',
      payment: PAYMENT_LABEL[e.payment_method] ?? '',
      vat: vat ? money(vat) : '',
      total: money(Number(e.total)),
      notes,
    };
  });

  // Görseller: aynı fotoğrafı paylaşan fişler (tek fotoğrafta birden çok fiş) bir kez basılır
  const byPath = new Map<string, Exp[]>();
  for (const e of expenses) if (e.image_path) byPath.set(e.image_path, [...(byPath.get(e.image_path) ?? []), e]);
  const paths = [...byPath.keys()];
  const images: PrintImage[] = [];
  const attachments: string[] = [];
  let done = 0;
  for (let i = 0; i < paths.length; i += 40) {
    const batch = paths.slice(i, i + 40);
    const { data: urls } = await supabase.storage.from('receipts').createSignedUrls(batch, 600);
    await Promise.all(
      batch.map(async (p, j) => {
        const group = byPath.get(p)!;
        const label = group.map((e) => `#${no.get(e.id)}`).join(', ');
        const first = group[0];
        const caption = `${label} ${first.seller_name ?? ''} ${dateText(first.doc_date)} ${group.length === 1 ? money(Number(first.total)) : `(${group.length} fiş aynı fotoğrafta)`}`.replace(/\s+/g, ' ').trim();
        const u = urls?.[j]?.signedUrl;
        try {
          if (!u) throw new Error('adres yok');
          const res = await fetch(u);
          if (!res.ok) throw new Error(String(res.status));
          const bytes = new Uint8Array(await res.arrayBuffer());
          const size = imageSize(bytes);
          const mime = res.headers.get('content-type') || 'image/jpeg';
          if (!size || mime.includes('pdf')) {
            attachments.push(`${label} ${first.seller_name ?? 'Belge'}: PDF ya da görüntü olmayan dosya; uygulamadan ayrıca açıp yazdırın.`);
            return;
          }
          images.push({ id: p, src: `data:${mime};base64,${toBase64(bytes)}`, w: size.w, h: size.h, caption, wide: ['e_fatura', 'e_arsiv', 'yurtdisi_fatura', 'serbest_meslek'].includes(first.doc_type) });
        } catch {
          attachments.push(`${label} ${first.seller_name ?? 'Belge'}: görsel indirilemedi.`);
        }
      }),
    );
    done += batch.length;
    progress(`Fiş görselleri hazırlanıyor: ${done}/${paths.length}`);
  }
  // Görsel sırası tablodaki numaralarla aynı olsun
  const order = new Map(paths.map((p) => [p, Math.min(...byPath.get(p)!.map((e) => no.get(e.id)!))]));
  images.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  const pay = paymentSummary(expenses);
  const rej = rejectedAlcohol(expenses);
  const vatTotal = expenses.reduce((a, e) => a + (e.expense_vat_lines ?? []).reduce((s, l) => s + Number(l.vat), 0), 0);
  const totals = [
    { label: 'Rapor toplamı', value: money(Number(r.total)) },
    { label: 'KDV toplamı', value: money(vatTotal) },
    ...(pay.company_card ? [{ label: 'Şirket kartıyla ödenen', value: money(pay.company_card) }] : []),
    ...(pay.cash_advance ? [{ label: 'İş avansından', value: money(pay.cash_advance) }] : []),
    ...(pay.cash ? [{ label: 'Şirket kasasından', value: money(pay.cash) }] : []),
    ...(rej ? [{ label: 'Reddedilen alkol', value: `-${money(rej)}` }] : []),
    { label: 'Çalışana ödenecek', value: money(pay.personal), strong: true },
  ];

  const me = (await supabase.auth.getUser()).data.user?.id;
  const meName = me ? (name.get(me) ?? (await supabase.from('profiles').select('full_name').eq('id', me).maybeSingle()).data?.full_name ?? '') : '';
  return {
    company: company?.legal_name ?? '',
    companyTax: company?.tax_number ?? '',
    title: r.title,
    owner: name.get(r.owner_user_id) ?? '',
    period: r.period ?? '',
    status: STATUS_LABEL[r.status as ReportStatus] ?? r.status,
    facts: [
      { label: 'Oluşturma', value: when(r.created_at) },
      { label: 'Onaya gönderim', value: when(r.submitted_at) || 'Gönderilmedi' },
      { label: 'Onay', value: when(r.approved_at) || 'Bekliyor' },
      { label: 'Ödeme', value: when(r.paid_at) || 'Ödenmedi' },
    ],
    history: actions.map((a) => ({ label: ACTION_LABEL[a.action] ?? a.action, who: name.get(a.actor_user_id) ?? '', when: when(a.created_at), note: a.note })),
    rows,
    totals,
    images,
    attachments,
    generated: `Gidero ile ${when(new Date().toISOString())} tarihinde${meName ? ` ${meName} tarafından` : ''} oluşturuldu`,
  };
}

/** Web: gizli çerçevede yazdırma penceresi (Hedef: "PDF olarak kaydet" ile PDF iner) */
function printInBrowser(html: string) {
  return new Promise<void>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) return reject(new Error('Yazdırma penceresi açılamadı.'));
    doc.open();
    doc.write(html);
    doc.close();
    const imgs = Array.from(doc.images);
    Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((ok) => ((im.onload = ok), (im.onerror = ok))))))
      .then(() => {
        win.focus();
        win.print();
        setTimeout(() => frame.remove(), 60_000);
        resolve();
      })
      .catch(reject);
  });
}

const fileName = (title: string) =>
  `${title.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/gi, '-').replace(/^-|-$/g, '') || 'rapor'}.pdf`;

/** Raporu yazdırır (telefonda yazıcı seçilir; bilgisayarda yazdırma penceresi açılır) */
export async function printReport(reportId: string, density: Density, progress?: PrintProgress) {
  const data = await loadPrintData(reportId, progress);
  const html = reportHtml(data, density);
  progress?.('Yazdırma açılıyor…');
  if (Platform.OS === 'web') return printInBrowser(html);
  await Print.printAsync({ html, width: 595, height: 842, margins: { left: 28, right: 28, top: 28, bottom: 28 } });
}

/** Raporu PDF olarak verir: telefonda paylaşım menüsü, bilgisayarda yazdırma penceresinden "PDF olarak kaydet" */
export async function shareReportPdf(reportId: string, density: Density, progress?: PrintProgress) {
  const data = await loadPrintData(reportId, progress);
  const html = reportHtml(data, density);
  progress?.('PDF oluşturuluyor…');
  if (Platform.OS === 'web') return printInBrowser(html);
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842, margins: { left: 28, right: 28, top: 28, bottom: 28 } });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: fileName(data.title) });
}
