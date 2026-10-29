// Masrafı kim ödedi: muhasebede alacak hesabını belirler (çalışana borç, kredi kartı, avans, kasa).
export type PaymentMethod = 'personal' | 'company_card' | 'cash_advance' | 'cash';

export const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; hint: string }[] = [
  { key: 'personal', label: 'Kendi cebimden', hint: 'Tutar size geri ödenir.' },
  { key: 'company_card', label: 'Şirket kartı', hint: 'Şirketin kredi kartıyla ödendi; size ödeme yapılmaz.' },
  { key: 'cash_advance', label: 'İş avansından', hint: 'Aldığınız avanstan düşülür.' },
  { key: 'cash', label: 'Şirket kasasından', hint: 'Şirket kasasından nakit ödendi.' },
];

export const PAYMENT_LABEL: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_OPTIONS.map((o) => [o.key, o.label]),
) as Record<PaymentMethod, string>;

/** Rapor özetinde: çalışana ödenecek tutar ve diğer ödeme yollarının toplamları */
export function paymentSummary(
  expenses: { total: number | string; payment_method: PaymentMethod; alcohol_amount?: number | string | null; alcohol_decision?: string | null }[],
) {
  const by: Record<PaymentMethod, number> = { personal: 0, company_card: 0, cash_advance: 0, cash: 0 };
  for (const e of expenses) {
    const total = Number(e.total) || 0;
    // Muhasebenin reddettiği alkol tutarı çalışana ödenmez
    const cut = e.alcohol_decision === 'rejected' ? Math.min(Number(e.alcohol_amount) || 0, total) : 0;
    const m = e.payment_method ?? 'personal';
    by[m] += m === 'personal' ? Math.round((total - cut) * 100) / 100 : total;
  }
  return by;
}

/** Reddedilen alkol toplamı (rapor özetinde ayrı satır olarak gösterilir) */
export function rejectedAlcohol(expenses: { total: number | string; alcohol_amount?: number | string | null; alcohol_decision?: string | null }[]) {
  return expenses.reduce(
    (a, e) => a + (e.alcohol_decision === 'rejected' ? Math.min(Number(e.alcohol_amount) || 0, Number(e.total) || 0) : 0),
    0,
  );
}
