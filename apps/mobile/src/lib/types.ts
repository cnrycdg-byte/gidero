export type ReportStatus = 'draft' | 'pending' | 'returned' | 'approved' | 'booked' | 'exported' | 'paid';

export type Company = {
  id: string;
  legal_name: string;
  tax_number: string;
  brand_primary?: string | null;
  brand_accent?: string | null;
  logo_path?: string | null;
};
export type Membership = {
  company_id: string;
  roles: string[];
  vehicle_plates: string[];
  bureau_account_id: string | null;
  /** Faturalanan hesap (büroya bağlı firmada büro) */
  billing_account_id: string | null;
  /** Abonelik aktif mi (deneme veya ödenmiş dönem) */
  company_active: boolean;
  /** active: geçerli; grace: bitti, 10 gün salt okunur ve veri indirilebilir; locked: kilitli */
  phase?: 'active' | 'grace' | 'locked';
  companies: Company;
};

export type Report = {
  id: string;
  company_id: string;
  owner_user_id: string;
  created_by: string;
  title: string;
  period: string | null;
  status: ReportStatus;
  total: number;
  current_approver_ids: string[];
  submitted_at: string | null;
  created_at: string;
};

export type VatLine = { id?: string; rate: number; base: number; vat: number };
export type Flag = { id: string; code: string; severity: 'info' | 'warning' | 'critical'; message: string; legal_ref: string | null };

export type Expense = {
  id: string;
  payment_method: 'personal' | 'company_card' | 'cash_advance' | 'cash';
  company_id: string;
  report_id: string;
  created_by: string;
  doc_type: string;
  seller_name: string | null;
  seller_vkn: string | null;
  doc_date: string | null;
  doc_no: string | null;
  plate: string | null;
  total: number;
  read_total: number | null;
  read_source: 'qr' | 'ai' | 'user' | null;
  category_id: string | null;
  description: string;
  attendees: string[];
  image_path: string | null;
  created_at: string;
  checked_at?: string | null;
  alcohol_present?: boolean;
  alcohol_amount?: number | null;
  alcohol_items?: string[];
  alcohol_decision?: 'accepted' | 'rejected' | 'kkeg' | null;
  alcohol_decided_by?: string | null;
  /** Bilgi fişi: çalışanın e-Arşiv faturası onayı */
  einvoice_confirmed_at?: string | null;
  einvoice_confirmed_by?: string | null;
  ettn?: string | null;
  /** Tek fotoğrafta birden çok fiş: bu kaydın sırası ve fotoğraftaki fiş sayısı */
  photo_part?: number | null;
  photo_parts?: number | null;
  photo_position?: string | null;
  expense_vat_lines?: VatLine[];
  expense_flags?: Flag[];
};

export type Category = { id: string; name: string; tax_rule: string; attendees_required: boolean; default_vat_rate: number | null };

export const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: 'Taslak',
  pending: 'Onay bekliyor',
  returned: 'İade edildi',
  approved: 'Onaylandı',
  booked: 'Muhasebeleşti',
  exported: 'Aktarıldı',
  paid: 'Ödendi',
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  e_fatura: 'e-Fatura',
  e_arsiv: 'e-Arşiv fatura',
  okc_fis: 'Yazar kasa fişi',
  akaryakit_okc: 'Akaryakıt fişi',
  serbest_meslek: 'Serbest meslek makbuzu',
  gider_pusulasi: 'Gider pusulası',
  bilet: 'Bilet',
  yurtdisi_fatura: 'Yurt dışı fatura',
  dekont: 'Banka dekontu',
  bilgi_fisi: 'Bilgi fişi (asıl belge e-Arşiv fatura)',
  no_document: 'Belgesiz',
  unknown: 'Belge türü belirsiz',
};

export function statusTone(s: ReportStatus) {
  if (s === 'approved' || s === 'booked' || s === 'exported') return 'ok' as const;
  if (s === 'pending') return 'info' as const;
  if (s === 'returned') return 'bad' as const;
  return 'neutral' as const;
}

export const ROLE_LABEL: Record<string, string> = {
  employee: 'Çalışan',
  approver: 'Onaylayıcı',
  accountant: 'Muhasebeci',
  admin: 'Şirket yöneticisi',
  auditor: 'Denetçi',
  payer: 'Ödeme yetkilisi',
  cost_center_owner: 'Masraf merkezi sorumlusu',
};
