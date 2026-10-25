import { supabase } from '../supabase';
import type { CompanySettings, ExpenseInput, ReportInput } from './journal.ts';

export type ExportableReport = ReportInput & { status: string; total: number; owner_user_id: string };

export type ExportBatch = {
  id: string;
  format: 'excel' | 'luca' | 'logo';
  created_at: string;
  report_ids: string[];
  expense_count: number;
  total: number;
};

const COMPANY_COLS =
  'legal_name, accounting_software, car_kkeg_vat_deductible, account_personnel, account_card, account_advance, account_cash, account_vat, vat_accounts, account_kkeg';

export async function loadCompanySettings(companyId: string): Promise<CompanySettings & { accounting_software: string | null }> {
  const { data, error } = await supabase.from('companies').select(COMPANY_COLS).eq('id', companyId).single();
  if (error) throw error;
  return { ...(data as any), vat_accounts: (data as any).vat_accounts ?? {} };
}

export async function saveCompanySettings(companyId: string, settings: Partial<CompanySettings> & { accounting_software?: string }) {
  const { error } = await supabase.rpc('set_accounting_settings', { p_company: companyId, p_settings: settings });
  if (error) throw error;
}

/** Onaylanmış (ya da istenirse aktarılmış) raporları fişleriyle birlikte yükler. */
export async function loadReports(companyId: string, opts: { period?: string | null; statuses: string[]; ids?: string[] }) {
  let q = supabase
    .from('reports')
    .select('id, title, period, status, total, owner_user_id, approved_at')
    .eq('company_id', companyId)
    .in('status', opts.statuses)
    .order('approved_at', { ascending: true });
  if (opts.period) q = q.eq('period', opts.period);
  if (opts.ids) q = q.in('id', opts.ids);
  const { data: reports, error } = await q;
  if (error) throw error;
  if (!reports?.length) return [] as ExportableReport[];

  const ids = reports.map((r) => r.id);
  const owners = [...new Set(reports.map((r) => r.owner_user_id))];
  const [exp, people, mem] = await Promise.all([
    supabase
      .from('expenses')
      .select(
        'id, report_id, doc_date, doc_type, doc_no, ettn, seller_name, seller_vkn, total, payment_method, description, attendees, ' +
          'categories(name, expense_account, tax_rule, kkeg_ratio), expense_vat_lines(rate, base, vat), expense_flags(code, message)',
      )
      .in('report_id', ids)
      .order('doc_date', { ascending: true }),
    supabase.from('profiles').select('id, full_name').in('id', owners),
    supabase.from('memberships').select('user_id, personnel_account_code').eq('company_id', companyId).in('user_id', owners),
  ]);
  if (exp.error) throw exp.error;
  const names = new Map((people.data ?? []).map((p: any) => [p.id, p.full_name || 'Çalışan']));
  const accounts = new Map((mem.data ?? []).map((m: any) => [m.user_id, m.personnel_account_code]));

  const byReport = new Map<string, ExpenseInput[]>();
  for (const e of (exp.data ?? []) as any[]) {
    const list = byReport.get(e.report_id) ?? [];
    list.push({
      id: e.id,
      doc_date: e.doc_date,
      doc_type: e.doc_type,
      doc_no: e.doc_no,
      ettn: e.ettn,
      seller_name: e.seller_name,
      seller_vkn: e.seller_vkn,
      total: Number(e.total),
      payment_method: e.payment_method,
      description: e.description ?? '',
      attendees: e.attendees ?? [],
      category: e.categories
        ? { ...e.categories, kkeg_ratio: e.categories.kkeg_ratio == null ? null : Number(e.categories.kkeg_ratio) }
        : null,
      vat_lines: (e.expense_vat_lines ?? []).map((v: any) => ({ rate: Number(v.rate), base: Number(v.base), vat: Number(v.vat) })),
      flag_codes: (e.expense_flags ?? []).map((f: any) => f.code),
      flag_messages: (e.expense_flags ?? []).map((f: any) => f.message),
    });
    byReport.set(e.report_id, list);
  }

  return reports.map((r) => ({
    id: r.id,
    title: r.title,
    period: r.period,
    status: r.status,
    total: Number(r.total),
    owner_user_id: r.owner_user_id,
    owner_name: names.get(r.owner_user_id) ?? 'Çalışan',
    owner_personnel_account: accounts.get(r.owner_user_id) ?? null,
    approved_at: r.approved_at,
    expenses: byReport.get(r.id) ?? [],
  })) as ExportableReport[];
}

export async function markExported(companyId: string, reportIds: string[], format: 'excel' | 'luca' | 'logo') {
  const { data, error } = await supabase.rpc('mark_exported', { p_company: companyId, p_report_ids: reportIds, p_format: format });
  if (error) throw error;
  return data as string;
}

export async function loadBatches(companyId: string): Promise<ExportBatch[]> {
  const { data, error } = await supabase
    .from('export_batches')
    .select('id, format, created_at, report_ids, expense_count, total')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((b: any) => ({ ...b, total: Number(b.total) }));
}
