import { supabase } from './supabase';

export type Contact = { id: string; full_name: string; org_name: string; use_count: number };

/** "Ayşe Demir" + "ABC Ltd" → "Ayşe Demir (ABC Ltd)" */
export function formatPerson(name: string, org: string): string {
  const n = name.trim();
  const o = org.trim();
  return o ? `${n} (${o})` : n;
}

/** "Ayşe Demir (ABC Ltd)" → { full_name, org_name } */
export function parsePerson(text: string): { full_name: string; org_name: string } {
  const m = text.trim().match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return m ? { full_name: m[1].trim(), org_name: m[2].trim() } : { full_name: text.trim(), org_name: '' };
}

/** Kişinin kendi rehberinde ada veya firmaya göre arar; en sık ve en son kullanılanlar önce */
export async function searchContacts(companyId: string, q: string): Promise<Contact[]> {
  const term = q.trim().replace(/[%,()]/g, ' ').trim();
  let query = supabase
    .from('contacts')
    .select('id, full_name, org_name, use_count')
    .eq('company_id', companyId)
    .order('use_count', { ascending: false })
    .order('last_used_at', { ascending: false })
    .limit(6);
  if (term) query = query.or(`full_name.ilike.%${term}%,org_name.ilike.%${term}%`);
  const { data } = await query;
  return (data ?? []) as Contact[];
}

/** Firma adı önerileri (rehberdeki firmalardan) */
export async function searchOrgs(companyId: string, q: string): Promise<string[]> {
  const term = q.trim().replace(/[%,()]/g, ' ').trim();
  if (!term) return [];
  const { data } = await supabase
    .from('contacts')
    .select('org_name')
    .eq('company_id', companyId)
    .ilike('org_name', `%${term}%`)
    .order('use_count', { ascending: false })
    .limit(20);
  return [...new Set((data ?? []).map((r: { org_name: string }) => r.org_name).filter(Boolean))].slice(0, 5);
}

export async function rememberContacts(companyId: string, people: string[]) {
  if (!people.length) return;
  await supabase.rpc('remember_contacts', { p_company: companyId, p_people: people.map(parsePerson) });
}
