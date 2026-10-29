import * as Clipboard from 'expo-clipboard';

import { supabase } from '@/lib/supabase';

export type BankInfo = { iban: string | null; bank_name: string | null; account_holder: string | null };

/** "TR330006100519786457841326" → "TR33 0006 1005 1978 6457 8413 26" */
export function formatIban(iban: string | null | undefined): string {
  if (!iban) return '';
  return iban.replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}

/** TR IBAN doğrulaması (26 karakter, mod 97); boşsa geçerli sayılır */
export function ibanError(input: string): string | null {
  const s = input.replace(/\s/g, '').toUpperCase();
  if (!s) return null;
  if (!/^TR\d{24}$/.test(s)) return 'IBAN TR ile başlayan 26 karakter olmalı.';
  const moved = s.slice(4) + s.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (const d of digits) r = (r * 10 + Number(d)) % 97;
  return r === 1 ? null : 'IBAN hatalı görünüyor; rakamları kontrol edin.';
}

export async function copyText(text: string) {
  await Clipboard.setStringAsync(text);
}

/** Kişinin banka bilgisi: kendisi, muhasebeci ve ödeme yetkilisi görür; yönetici yalnızca kayıtlı olup olmadığını */
export async function fetchBank(companyId: string, userId: string): Promise<{ info: BankInfo | null; saved: boolean }> {
  const { data } = await supabase
    .from('member_bank')
    .select('iban, bank_name, account_holder')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (data) return { info: data as BankInfo, saved: !!(data as BankInfo).iban };
  const { data: saved } = await supabase.rpc('member_bank_saved', { p_company: companyId, p_user: userId });
  return { info: null, saved: !!saved };
}

export async function saveBank(companyId: string, userId: string, b: { iban: string; bank: string; holder: string }) {
  const { error } = await supabase.rpc('set_member_bank', {
    p_company: companyId,
    p_user: userId,
    p_iban: b.iban.replace(/\s/g, '').toUpperCase() || null,
    p_bank: b.bank.trim() || null,
    p_holder: b.holder.trim() || null,
  });
  if (error) throw error;
}

/** Türkiye'deki IBAN'ın 5-9. hanesi banka kodudur; yaygın bankaların adı önerilir */
const BANKS: Record<string, string> = {
  '00010': 'Ziraat Bankası', '00012': 'Halkbank', '00015': 'VakıfBank', '00046': 'Akbank', '00062': 'Garanti BBVA',
  '00064': 'İş Bankası', '00067': 'Yapı Kredi', '00111': 'QNB', '00032': 'TEB', '00134': 'Denizbank',
  '00099': 'ING', '00123': 'HSBC', '00059': 'Şekerbank', '00206': 'Türkiye Finans', '00205': 'Kuveyt Türk',
  '00209': 'Ziraat Katılım', '00210': 'Vakıf Katılım', '00203': 'Albaraka', '00146': 'Odeabank', '00135': 'Anadolubank',
  '00124': 'Alternatifbank', '00125': 'Burgan Bank', '00143': 'Aktif Bank'
};
export function bankFromIban(iban: string): string | null {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (s.length < 9) return null;
  return BANKS[s.slice(4, 9)] ?? null;
}
