// Onaylanmış raporlardan yevmiye kaydı üretimi (muhasebe-aktarim skill'indeki iç format).
// Saf fonksiyonlar: veritabanı ya da React bağımlılığı yok; birim testleri test/journal.test.ts.
// Para hesabı kuruş (tam sayı) ile yapılır; yuvarlama HALF_UP, 2 hane.

export type VatLine = { rate: number; base: number; vat: number };

export type ExpenseInput = {
  id: string;
  doc_date: string | null; // YYYY-MM-DD
  doc_type: string;
  doc_no: string | null;
  ettn: string | null;
  seller_name: string | null;
  seller_vkn: string | null;
  total: number;
  payment_method: 'personal' | 'company_card' | 'cash_advance' | 'cash';
  description: string;
  attendees: string[];
  category: { name: string; expense_account: string; tax_rule: string; kkeg_ratio: number | null } | null;
  vat_lines: VatLine[];
  flag_codes: string[];
  flag_messages: string[];
  /** Muhasebe reddettiyse alkol tutarı gider yazılmaz ve çalışana ödenmez */
  alcohol_amount?: number | null;
  alcohol_decision?: 'accepted' | 'rejected' | 'kkeg' | null;
};

export type ReportInput = {
  id: string;
  title: string;
  period: string | null;
  owner_name: string;
  owner_personnel_account: string | null;
  approved_at: string | null;
  expenses: ExpenseInput[];
};

export type CompanySettings = {
  legal_name: string;
  account_personnel: string;
  account_card: string;
  account_advance: string;
  account_cash: string;
  account_vat: string;
  vat_accounts: Record<string, string>;
  account_kkeg: string;
  car_kkeg_vat_deductible: boolean;
};

export type JournalLine = {
  account_code: string;
  debit: number;
  credit: number;
  description: string;
  doc_type: string;
  doc_no: string;
  doc_date: string;
  vat_rate?: number;
  kkeg?: boolean;
  expense_id?: string;
};

export type JournalEntry = {
  report_id: string;
  entry_date: string; // YYYY-MM-DD
  period: string;
  description: string;
  lines: JournalLine[];
  warnings: string[];
};

// KDV'nin indirilemeyeceğini gösteren uyarılar (vergi kuralları read-receipt fonksiyonunda üretilir)
const NO_VAT_DEDUCTION = new Set(['okc_vat_not_deductible', 'vat_deadline_passed', 'not_tax_document']);
const FALLBACK_EXPENSE_ACCOUNT = '770';

const kurus = (tl: number) => Math.round((tl + Number.EPSILON) * 100);
const tl = (k: number) => k / 100;
/** a * pct / 100, kuruş cinsinden, HALF_UP */
const share = (k: number, pct: number) => Math.round((k * pct) / 100 + Number.EPSILON * Math.sign(k));

export const DOC_TYPE_LABEL: Record<string, string> = {
  e_fatura: 'e-Fatura',
  e_arsiv: 'e-Arşiv fatura',
  okc_fis: 'Yazar kasa fişi',
  akaryakit_okc: 'Akaryakıt fişi',
  serbest_meslek: 'Serbest meslek makbuzu',
  gider_pusulasi: 'Gider pusulası',
  bilet: 'Bilet',
  yurtdisi_fatura: 'Yurt dışı fatura',
  dekont: 'Dekont',
  unknown: 'Belge',
};

/** e-Defter belge türü: fatura, çek, senet, makbuz, navlun, diğer */
export function eDefterDocType(docType: string): string {
  if (docType === 'e_fatura' || docType === 'e_arsiv' || docType === 'yurtdisi_fatura') return 'Fatura';
  if (docType === 'serbest_meslek' || docType === 'gider_pusulasi') return 'Makbuz';
  return 'Diğer';
}

function paymentAccount(method: ExpenseInput['payment_method'], report: ReportInput, c: CompanySettings) {
  switch (method) {
    case 'company_card':
      return c.account_card;
    case 'cash_advance':
      return c.account_advance;
    case 'cash':
      return c.account_cash;
    default:
      return report.owner_personnel_account || c.account_personnel;
  }
}

function vatAccount(rate: number, c: CompanySettings) {
  const key = String(Number(rate));
  return c.vat_accounts[key] || c.account_vat;
}

/** Bir raporu tek mahsup fişine çevirir: her fiş için gider ve KDV borç satırları, ödeme hesabına alacak. */
export function buildEntry(report: ReportInput, c: CompanySettings): JournalEntry {
  const lines: JournalLine[] = [];
  const warnings: string[] = [];
  const credits = new Map<string, number>(); // hesap → kuruş

  for (const e of report.expenses) {
    const paid = kurus(e.total);
    // Reddedilen alkol: gider ve KDV'den orantılı düşülür
    const alc = Math.min(Math.max(kurus(e.alcohol_amount ?? 0), 0), paid);
    const rejected = e.alcohol_decision === 'rejected' ? alc : 0;
    // KKEG kararı: alkol tutarı (KDV dahil) vergiden düşülmeyen gidere yazılır, çalışana ödenir
    const alcKkeg = e.alcohol_decision === 'kkeg' ? alc : 0;
    const total = paid - rejected - alcKkeg;
    const scale = (k: number) => (paid > 0 && total < paid ? Math.round((k * total) / paid) : k);
    const doc = {
      doc_type: eDefterDocType(e.doc_type),
      doc_no: e.doc_no ?? '',
      doc_date: e.doc_date ?? '',
      expense_id: e.id,
    };
    const what = [e.seller_name || DOC_TYPE_LABEL[e.doc_type] || 'Belge', e.doc_no, e.description].filter(Boolean).join(', ');
    const desc = `${report.owner_name}: ${what}`;

    if (!e.category) warnings.push(`${what}: gider grubu seçilmemiş, ${FALLBACK_EXPENSE_ACCOUNT} hesabına yazıldı.`);
    if (!e.doc_date) warnings.push(`${what}: belge tarihi yok.`);
    const expenseAccount = e.category?.expense_account || FALLBACK_EXPENSE_ACCOUNT;

    const wholeKkeg = e.flag_codes.includes('kkeg') || e.category?.tax_rule === 'kkeg';
    const vatDeductible = !e.flag_codes.some((f) => NO_VAT_DEDUCTION.has(f));
    const ratio = wholeKkeg ? 100 : (e.category?.kkeg_ratio ?? 0);

    // KDV satırları: indirilebiliyorsa 191'e, indirilemiyorsa gidere eklenir
    const vatLines = e.vat_lines.map((v) => ({ rate: v.rate, vat: scale(kurus(v.vat)) }));
    if (rejected > 0) {
      warnings.push(
        e.payment_method === 'personal'
          ? `${what}: reddedilen alkol (${tl(rejected).toFixed(2)} TL) gider yazılmadı ve çalışana ödenmez.`
          : `${what}: reddedilen alkol (${tl(rejected).toFixed(2)} TL) gider yazılmadı; çalışandan alacak olarak kaydedildi.`,
      );
    }
    const vatSum = vatLines.reduce((a, v) => a + v.vat, 0);
    let base = total - vatSum; // matrah; konaklama vergisi ve yuvarlama farkı da gidere kalır
    if (base < 0) {
      warnings.push(`${what}: KDV toplamı fiş tutarını aşıyor, KDV ayrılmadı.`);
      base = total;
      vatLines.length = 0;
    }

    let expenseDebit = base;
    let kkegDebit = alcKkeg;
    const vatDebits: { rate: number; amount: number }[] = [];

    if (ratio > 0) {
      const kBase = share(base, ratio);
      expenseDebit -= kBase;
      kkegDebit += kBase;
    }
    for (const v of vatLines.length ? vatLines : []) {
      if (!vatDeductible || wholeKkeg) {
        // indirilemeyen KDV gider (ya da KKEG) olur
        if (wholeKkeg) kkegDebit += v.vat;
        else {
          const k = ratio > 0 ? share(v.vat, ratio) : 0;
          kkegDebit += k;
          expenseDebit += v.vat - k;
        }
        continue;
      }
      const kVat = ratio > 0 && !c.car_kkeg_vat_deductible ? share(v.vat, ratio) : 0;
      kkegDebit += kVat;
      vatDebits.push({ rate: v.rate, amount: v.vat - kVat });
    }

    if (expenseDebit > 0) lines.push({ account_code: expenseAccount, debit: tl(expenseDebit), credit: 0, description: desc, ...doc });
    if (kkegDebit > 0) {
      lines.push({ account_code: c.account_kkeg, debit: tl(kkegDebit), credit: 0, description: `${desc} (KKEG)`, kkeg: true, ...doc });
    }
    for (const v of vatDebits) {
      if (v.amount > 0) {
        lines.push({ account_code: vatAccount(v.rate, c), debit: tl(v.amount), credit: 0, description: `${desc} (KDV %${v.rate})`, vat_rate: v.rate, ...doc });
      }
    }
    const pay = paymentAccount(e.payment_method, report, c);
    if (e.payment_method === 'personal') {
      credits.set(pay, (credits.get(pay) ?? 0) + paid - rejected);
    } else {
      credits.set(pay, (credits.get(pay) ?? 0) + paid);
      if (rejected > 0) {
        const personnel = report.owner_personnel_account || c.account_personnel;
        lines.push({ account_code: personnel, debit: tl(rejected), credit: 0, description: `${desc} (reddedilen alkol, çalışandan alınacak)`, ...doc });
      }
    }
  }

  const date = report.approved_at?.slice(0, 10) || lastDayOfPeriod(report.period) || new Date().toISOString().slice(0, 10);
  for (const [account, amount] of credits) {
    lines.push({
      account_code: account,
      debit: 0,
      credit: tl(amount),
      description: `${report.owner_name}: ${report.title}`,
      doc_type: 'Diğer',
      doc_no: '',
      doc_date: date,
    });
  }

  const d = lines.reduce((a, l) => a + kurus(l.debit), 0);
  const cr = lines.reduce((a, l) => a + kurus(l.credit), 0);
  if (d !== cr) warnings.push(`Borç ve alacak eşit değil (${tl(d)} / ${tl(cr)}).`);

  return {
    report_id: report.id,
    entry_date: date,
    period: report.period ?? date.slice(0, 7),
    description: `${report.owner_name}, ${report.title}`,
    lines,
    warnings,
  };
}

export function lastDayOfPeriod(period: string | null): string | null {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return null;
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export function totals(entry: JournalEntry) {
  return {
    debit: tl(entry.lines.reduce((a, l) => a + kurus(l.debit), 0)),
    credit: tl(entry.lines.reduce((a, l) => a + kurus(l.credit), 0)),
  };
}
