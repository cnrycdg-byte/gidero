// Şirketin bütün verisini tek ZIP dosyasında indirir: Excel (raporlar, fişler, KDV, uyarılar, onay geçmişi) + fiş görselleri.
// Abonelik bitince 10 günlük ek sürede ve her zaman yönetici/muhasebeci için açıktır (veri taşınabilirliği).
import { zipSync } from 'fflate';

import { xlsx, slug } from '@/lib/accounting/formats';
import { PAYMENT_LABEL } from '@/lib/payment';
import { supabase } from '@/lib/supabase';
import { DOC_TYPE_LABEL, STATUS_LABEL } from '@/lib/types';

const PAGE = 1000;

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export type ArchiveProgress = (text: string) => void;

export async function buildArchive(companyId: string, companyName: string, progress: ArchiveProgress, withImages = true) {
  progress('Raporlar okunuyor…');
  type R = { id: string; title: string; period: string | null; status: string; total: number; owner_user_id: string; created_at: string; submitted_at: string | null; approved_at: string | null; paid_at: string | null };
  const reports = await all<R>((a, b) =>
    supabase.from('reports').select('id, title, period, status, total, owner_user_id, created_at, submitted_at, approved_at, paid_at').eq('company_id', companyId).order('created_at').range(a, b),
  );
  progress(`${reports.length} rapor; fişler okunuyor…`);
  type E = {
    id: string; report_id: string; doc_type: string; doc_date: string | null; doc_no: string | null; seller_name: string | null; seller_vkn: string | null;
    total: number; payment_method: keyof typeof PAYMENT_LABEL; description: string; attendees: string[]; plate: string | null; image_path: string | null;
    alcohol_amount: number | null; alcohol_decision: string | null; categories: { name: string } | null;
    expense_vat_lines: { rate: number; base: number; vat: number }[]; expense_flags: { severity: string; message: string }[];
  };
  const expenses = await all<E>((a, b) =>
    supabase
      .from('expenses')
      .select('id, report_id, doc_type, doc_date, doc_no, seller_name, seller_vkn, total, payment_method, description, attendees, plate, image_path, alcohol_amount, alcohol_decision, categories(name), expense_vat_lines(rate, base, vat), expense_flags(severity, message)')
      .eq('company_id', companyId)
      .order('created_at')
      .range(a, b),
  );
  type A = { report_id: string; action: string; note: string | null; created_at: string; actor_user_id: string };
  const actions = await all<A>((a, b) =>
    supabase.from('approval_actions').select('report_id, action, note, created_at, actor_user_id').eq('company_id', companyId).order('created_at').range(a, b),
  );
  const ids = [...new Set([...reports.map((r) => r.owner_user_id), ...actions.map((x) => x.actor_user_id)])];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids.slice(i, i + 200));
    ((data ?? []) as { id: string; full_name: string }[]).forEach((p) => names.set(p.id, p.full_name));
  }
  const rep = new Map(reports.map((r) => [r.id, r]));
  const d = (s: string | null | undefined) => (s ? s.slice(0, 10) : '');

  const files: Record<string, Uint8Array> = {};
  files['veriler.xlsx'] = xlsx([
    {
      name: 'Raporlar',
      widths: [34, 22, 10, 16, 14, 12, 12, 12, 12],
      rows: [
        ['Rapor', 'Sahibi', 'Dönem', 'Durum', 'Toplam', 'Oluşturma', 'Gönderim', 'Onay', 'Ödeme'],
        ...reports.map((r) => [r.title, names.get(r.owner_user_id) ?? '', r.period, STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status, Number(r.total), d(r.created_at), d(r.submitted_at), d(r.approved_at), d(r.paid_at)]),
      ],
    },
    {
      name: 'Fişler',
      widths: [30, 22, 12, 18, 16, 26, 14, 12, 12, 18, 30, 28, 12, 16, 40],
      rows: [
        ['Rapor', 'Sahibi', 'Tarih', 'Belge', 'Belge no', 'Satıcı', 'Satıcı VKN', 'Tutar', 'KDV', 'Gider grubu', 'Kimlerle', 'Açıklama', 'Plaka', 'Kim ödedi', 'Uyarılar'],
        ...expenses.map((e) => {
          const r = rep.get(e.report_id);
          return [
            r?.title ?? '', names.get(r?.owner_user_id ?? '') ?? '', e.doc_date, DOC_TYPE_LABEL[e.doc_type] ?? e.doc_type, e.doc_no, e.seller_name, e.seller_vkn,
            Number(e.total), (e.expense_vat_lines ?? []).reduce((a, l) => a + Number(l.vat), 0), e.categories?.name ?? '', (e.attendees ?? []).join(', '),
            e.description, e.plate, PAYMENT_LABEL[e.payment_method] ?? '',
            [e.alcohol_decision ? `Alkol: ${e.alcohol_decision}` : '', ...(e.expense_flags ?? []).filter((f) => f.severity !== 'info').map((f) => f.message)].filter(Boolean).join(' | '),
          ];
        }),
      ],
    },
    {
      name: 'KDV',
      widths: [26, 12, 8, 14, 14],
      rows: [
        ['Satıcı', 'Tarih', 'Oran %', 'Matrah', 'KDV'],
        ...expenses.flatMap((e) => (e.expense_vat_lines ?? []).map((l) => [e.seller_name, e.doc_date, Number(l.rate), Number(l.base), Number(l.vat)])),
      ],
    },
    {
      name: 'Onay geçmişi',
      widths: [32, 22, 22, 12, 40],
      rows: [
        ['Rapor', 'İşlem', 'Kim', 'Tarih', 'Not'],
        ...actions.map((x) => [rep.get(x.report_id)?.title ?? '', x.action, names.get(x.actor_user_id) ?? '', d(x.created_at), x.note]),
      ],
    },
  ]);

  if (withImages) {
    const withImg = expenses.filter((e) => e.image_path);
    let done = 0;
    for (let i = 0; i < withImg.length; i += 50) {
      const batch = withImg.slice(i, i + 50);
      const { data: urls } = await supabase.storage.from('receipts').createSignedUrls(batch.map((e) => e.image_path!), 600);
      await Promise.all(
        batch.map(async (e, j) => {
          const u = urls?.[j]?.signedUrl;
          if (!u) return;
          try {
            const res = await fetch(u);
            if (!res.ok) return;
            const bytes = new Uint8Array(await res.arrayBuffer());
            const ext = (e.image_path!.split('.').pop() || 'jpg').toLowerCase();
            const r = rep.get(e.report_id);
            const name = `fis-gorselleri/${slug(r?.title ?? 'rapor')}-${e.report_id.slice(0, 6)}/${e.doc_date ?? 'tarihsiz'}-${slug(e.seller_name ?? 'fis')}-${e.id.slice(0, 6)}.${ext}`;
            files[name] = bytes;
          } catch {
            // bir görsel inmezse arşivin geri kalanı yine oluşturulur
          }
        }),
      );
      done += batch.length;
      progress(`Fiş görselleri indiriliyor: ${done}/${withImg.length}`);
    }
  }
  progress('ZIP hazırlanıyor…');
  const zip = zipSync(files, { level: 0 });
  const today = new Date().toISOString().slice(0, 10);
  return { filename: `gidero-${slug(companyName)}-${today}.zip`, bytes: zip, counts: { reports: reports.length, expenses: expenses.length } };
}
