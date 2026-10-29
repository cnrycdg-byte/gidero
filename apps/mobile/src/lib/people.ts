import { functionError } from './demo';
import { supabase } from './supabase';

// Kişi ekleme ve ilk giriş (davet) bağlantısı: sunucu fonksiyonu "people"

export async function addPerson(p: {
  companyId: string;
  fullName: string;
  title: string;
  email: string;
  roles: string[];
  managerId: string | null;
}): Promise<{ user_id: string; email: string; link: string | null; demo: boolean; warning?: string | null }> {
  const { data, error } = await supabase.functions.invoke('people', {
    body: { action: 'add', company_id: p.companyId, full_name: p.fullName, title: p.title, email: p.email, roles: p.roles, manager_id: p.managerId },
  });
  if (error) throw await functionError(error);
  return data;
}

export async function memberLink(companyId: string, userId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('people', { body: { action: 'link', company_id: companyId, user_id: userId } });
  if (error) throw await functionError(error);
  return (data as { link: string }).link;
}

export async function ownerLink(accountId: string, fullName?: string): Promise<{ link: string | null; email: string; note?: string }> {
  const { data, error } = await supabase.functions.invoke('people', { body: { action: 'owner_link', account_id: accountId, full_name: fullName ?? '' } });
  if (error) throw await functionError(error);
  return data;
}

export async function addBureauStaff(p: { accountId: string; fullName: string; email: string; companyIds: string[] }): Promise<{ user_id: string; link: string | null; demo: boolean }> {
  const { data, error } = await supabase.functions.invoke('people', {
    body: { action: 'add_staff', account_id: p.accountId, full_name: p.fullName, email: p.email, company_ids: p.companyIds },
  });
  if (error) throw await functionError(error);
  return data;
}

export async function staffLink(accountId: string, userId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('people', { body: { action: 'staff_link', account_id: accountId, user_id: userId } });
  if (error) throw await functionError(error);
  return (data as { link: string }).link;
}
