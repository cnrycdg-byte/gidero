// Toplu yükleme: dosyaları tanır, kişiye atar, rapora yükler.
import { unzipSync, strFromU8 } from 'fflate';

import { readReceipt, recheckExpense, uploadReceipt } from '../receipts';
import { supabase } from '../supabase';
import { matchPerson, normPlate, parseUblInvoice, parseWhatsAppChat, type Invoice } from './parse.ts';

export type Person = { user_id: string; full_name: string; vehicle_plates: string[] };

export type ItemKind = 'image' | 'pdf' | 'invoice';
export type ItemStatus = 'ready' | 'working' | 'done' | 'matched' | 'skipped' | 'error';

export type Item = {
  key: string;
  name: string;
  kind: ItemKind;
  blob: Blob;
  invoice?: Invoice;
  sender?: string; // WhatsApp gönderen adı
  sentAt?: string | null;
  assignee: string | null; // user_id; null = kişi seçilmedi
  reason: string; // kişinin neden seçildiği
  status: ItemStatus;
  message?: string;
  existingId?: string; // eşleşen kayıtlı masraf
};

const IMAGE = /\.(jpe?g|png|webp|heic)$/i;
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf' };
const ext = (n: string) => n.split('.').pop()?.toLowerCase() ?? '';
let seq = 0;
const key = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Seçilen dosyaları (ZIP içleri dahil) yükleme kalemlerine çevirir ve kişiyi tahmin eder. */
export async function expandFiles(files: File[], people: Person[]): Promise<{ items: Item[]; ignored: string[] }> {
  const items: Item[] = [];
  const ignored: string[] = [];
  const chat = new Map<string, { sender: string; sent_at: string | null }>();

  const add = (name: string, data: Uint8Array | Blob) => {
    const base = name.split('/').pop() ?? name;
    if (base.startsWith('.') || base.startsWith('__MACOSX')) return;
    const e = ext(base);
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: MIME[e] ?? 'application/octet-stream' });
    if (IMAGE.test(base)) items.push({ key: key(), name: base, kind: 'image', blob, assignee: null, reason: '', status: 'ready' });
    else if (e === 'pdf') items.push({ key: key(), name: base, kind: 'pdf', blob, assignee: null, reason: '', status: 'ready' });
    else if (e === 'xml') items.push({ key: key(), name: base, kind: 'invoice', blob, assignee: null, reason: '', status: 'ready' });
    else if (!/\.txt$/i.test(base)) ignored.push(base);
  };

  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [name, data] of Object.entries(entries)) {
        if (/(^|\/)_?chat\.txt$|WhatsApp.*\.txt$/i.test(name)) {
          for (const m of parseWhatsAppChat(strFromU8(data))) chat.set(m.file, { sender: m.sender, sent_at: m.sent_at });
        } else if (!name.endsWith('/')) add(name, data);
      }
    } else if (/\.txt$/i.test(f.name)) {
      for (const m of parseWhatsAppChat(await f.text())) chat.set(m.file, { sender: m.sender, sent_at: m.sent_at });
    } else add(f.name, f);
  }

  for (const it of items) {
    const c = chat.get(it.name);
    if (c) {
      it.sender = c.sender;
      it.sentAt = c.sent_at;
      const p = matchPerson(c.sender, people);
      if (p) {
        it.assignee = p.user_id;
        it.reason = `WhatsApp'tan ${c.sender} gönderdi`;
      } else it.reason = `WhatsApp'tan "${c.sender}" gönderdi; kişiyi seçin`;
    }
    if (it.kind === 'invoice') {
      const inv = parseUblInvoice(await it.blob.text());
      if (!inv) {
        it.status = 'error';
        it.message = 'Bu XML bir e-Fatura ya da e-Arşiv fatura değil.';
        continue;
      }
      it.invoice = inv;
      if (!it.assignee && inv.plate) {
        const p = people.find((x) => x.vehicle_plates.some((v) => normPlate(v) === normPlate(inv.plate)));
        if (p) {
          it.assignee = p.user_id;
          it.reason = `Faturadaki plaka ${inv.plate} ${p.full_name} kişisinin aracı`;
        }
      }
    }
  }
  return { items, ignored };
}

/** Faturaları şirkette zaten kayıtlı masraflarla eşleştirir (ETTN ya da satıcı + tarih + tutar). */
export async function matchExisting(companyId: string, items: Item[], people: Person[]) {
  const invs = items.filter((i) => i.invoice && i.status === 'ready');
  if (!invs.length) return;
  const ettns = invs.map((i) => i.invoice!.ettn).filter(Boolean) as string[];
  const vkns = [...new Set(invs.map((i) => i.invoice!.seller_vkn).filter(Boolean) as string[])];
  const rows: any[] = [];
  if (ettns.length) {
    const { data } = await supabase.from('expenses').select('id, ettn, seller_vkn, total, doc_date, reports(owner_user_id)').eq('company_id', companyId).in('ettn', ettns.map((e) => e.toLowerCase()));
    rows.push(...(data ?? []));
  }
  if (vkns.length) {
    const { data } = await supabase.from('expenses').select('id, ettn, seller_vkn, total, doc_date, reports(owner_user_id)').eq('company_id', companyId).in('seller_vkn', vkns);
    rows.push(...(data ?? []));
  }
  // Görseli olmayan (elle yazılmış) masraflar: VKN yazılmamış olabilir; tarih + tutar tek kayda uyuyorsa eşleşir
  const dates = [...new Set(invs.map((i) => i.invoice!.doc_date).filter(Boolean) as string[])];
  const noImage: any[] = [];
  if (dates.length) {
    const { data } = await supabase.from('expenses').select('id, ettn, seller_vkn, total, doc_date, reports(owner_user_id)').eq('company_id', companyId).is('image_path', null).is('ettn', null).in('doc_date', dates);
    noImage.push(...(data ?? []));
  }
  const name = (uid: string) => people.find((p) => p.user_id === uid)?.full_name ?? 'bir çalışan';
  for (const it of invs) {
    const inv = it.invoice!;
    const hit =
      rows.find((r) => r.ettn && inv.ettn && String(r.ettn).toLowerCase() === inv.ettn.toLowerCase()) ??
      rows.find((r) => r.seller_vkn === inv.seller_vkn && r.doc_date === inv.doc_date && Math.abs(Number(r.total) - (inv.total ?? -1)) < 0.01) ??
      uniqueMatch(noImage.filter((r) => (!r.seller_vkn || r.seller_vkn === inv.seller_vkn) && r.doc_date === inv.doc_date && Math.abs(Number(r.total) - (inv.total ?? -1)) < 0.01));
    if (hit) {
      it.existingId = hit.id;
      it.status = 'matched';
      it.assignee = hit.reports?.owner_user_id ?? it.assignee;
      it.message = hit.ettn ? `Zaten kayıtlı: ${name(hit.reports?.owner_user_id)} bu faturayı yüklemiş.` : `${name(hit.reports?.owner_user_id)} kişisinin fişiyle eşleşti; fatura bilgisi fişe eklenecek.`;
    }
  }
}

/** Birden çok aday varsa yanlış kişiye bağlamamak için eşleştirme yapılmaz */
function uniqueMatch<T>(list: T[]): T | undefined {
  return list.length === 1 ? list[0] : undefined;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** Kişinin o dönemdeki açık raporunu bulur, yoksa açar (muhasebeci başkası adına açabilir). */
export async function ensureReportFor(companyId: string, ownerId: string, creatorId: string, period: string): Promise<string> {
  const { data: found } = await supabase
    .from('reports')
    .select('id')
    .eq('company_id', companyId)
    .eq('owner_user_id', ownerId)
    .eq('created_by', creatorId)
    .eq('period', period)
    .in('status', ['draft', 'returned'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (found?.length) return found[0].id as string;
  const title = `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)} masrafları`;
  const { data, error } = await supabase
    .from('reports')
    .insert({ company_id: companyId, owner_user_id: ownerId, created_by: creatorId, title, period })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Bir kalemi yükler; fotoğraf ve PDF okunur, e-Fatura doğrudan kaydedilir. */
export async function processItem(it: Item, ctx: { companyId: string; me: string; period: string; payment: string }): Promise<Partial<Item>> {
  if (it.status === 'matched' && it.existingId && it.invoice) {
    // Fotoğrafı yüklenmiş fişe fatura bilgisini ekle (rapor düzenlenebiliyorsa)
    const inv = it.invoice;
    const { data } = await supabase
      .from('expenses')
      .update({ ettn: inv.ettn?.toLowerCase() ?? null, doc_type: inv.doc_type, doc_no: inv.doc_no, buyer_vkn: inv.buyer_vkn, seller_vkn: inv.seller_vkn })
      .eq('id', it.existingId)
      .is('ettn', null)
      .select('id');
    if (data?.length) await recheckExpense(it.existingId);
    return { status: 'done', message: data?.length ? 'Fatura bilgisi kayıtlı fişe eklendi.' : it.message };
  }
  if (!it.assignee) return { status: 'error', message: 'Kişi seçilmedi.' };

  const date = it.invoice?.doc_date ?? it.sentAt?.slice(0, 10) ?? null;
  const period = date ? date.slice(0, 7) : ctx.period;
  const reportId = await ensureReportFor(ctx.companyId, it.assignee, ctx.me, period);

  if (it.kind === 'image') {
    const uri = URL.createObjectURL(it.blob);
    try {
      const id = await uploadReceipt({ uri, companyId: ctx.companyId, reportId, userId: ctx.me });
      await supabase.from('expenses').update({ payment_method: ctx.payment }).eq('id', id);
      const r = await readReceipt(id);
      return { status: 'done', message: r.error ?? 'Okundu.' };
    } finally {
      URL.revokeObjectURL(uri);
    }
  }

  if (it.kind === 'pdf') {
    const path = `${ctx.companyId}/${reportId}/${randomId()}.pdf`;
    const { error: upErr } = await supabase.storage.from('receipts').upload(path, it.blob, { contentType: 'application/pdf', upsert: false });
    if (upErr) throw upErr;
    const { data: exp, error } = await supabase
      .from('expenses')
      .insert({ company_id: ctx.companyId, report_id: reportId, created_by: ctx.me, total: 0, image_path: path, payment_method: ctx.payment })
      .select('id')
      .single();
    if (error) throw error;
    const r = await readReceipt(exp.id);
    return { status: 'done', message: r.error ?? 'Okundu.' };
  }

  // e-Fatura / e-Arşiv: bilgiler XML'den kesin olarak gelir, okumaya gerek yok
  const inv = it.invoice!;
  if (inv.total == null) return { status: 'error', message: 'Faturada ödenecek tutar bulunamadı.' };
  const { data: exp, error } = await supabase
    .from('expenses')
    .insert({
      company_id: ctx.companyId,
      report_id: reportId,
      created_by: ctx.me,
      doc_type: inv.doc_type,
      seller_name: inv.seller_name,
      seller_vkn: inv.seller_vkn,
      buyer_vkn: inv.buyer_vkn,
      doc_date: inv.doc_date,
      doc_no: inv.doc_no,
      ettn: inv.ettn?.toLowerCase() ?? null,
      plate: inv.plate,
      currency: inv.currency.slice(0, 3),
      total: inv.total,
      read_total: inv.total,
      read_source: 'qr',
      description: inv.notes.join(' ').slice(0, 300),
      payment_method: ctx.payment,
    })
    .select('id')
    .single();
  if (error) throw error;
  if (inv.vat_lines.length) {
    const { error: vErr } = await supabase
      .from('expense_vat_lines')
      .insert(inv.vat_lines.map((v) => ({ expense_id: exp.id, company_id: ctx.companyId, rate: v.rate, base: v.base, vat: v.vat })));
    if (vErr) throw vErr;
  }
  await recheckExpense(exp.id);
  return { status: 'done', message: 'Fatura kaydedildi, vergi kontrolü yapıldı.' };
}
