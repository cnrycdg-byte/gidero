// Excel'den ya da e-posta listesinden yapıştırılan satırları firmaya çevirir.
// Sütunlar sekme, noktalı virgül ya da virgülle ayrılabilir. Başlık satırı varsa sütunlar adından tanınır;
// yoksa sıra: firma adı, e-posta, şehir, telefon, web sitesi.

export type PastedLead = { name: string; email?: string; city?: string; phone?: string; website?: string; kind: 'bureau' | 'company'; source: 'csv' };

const EMAIL = /[^@\s;,<>"]+@[^@\s;,<>"]+\.[^@\s;,<>"]+/;
const HEAD: Record<string, keyof PastedLead> = {
  firma: 'name', 'firma adı': 'name', unvan: 'name', ad: 'name', name: 'name', şirket: 'name',
  'e-posta': 'email', eposta: 'email', email: 'email', mail: 'email',
  şehir: 'city', il: 'city', city: 'city',
  telefon: 'phone', tel: 'phone', phone: 'phone',
  web: 'website', 'web sitesi': 'website', site: 'website', website: 'website',
};

function split(line: string): string[] {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  return line.split(sep).map((s) => s.trim().replace(/^"|"$/g, ''));
}

export function parsePasted(text: string, kind: PastedLead['kind'] = 'bureau'): PastedLead[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  let order: (keyof PastedLead)[] = ['name', 'email', 'city', 'phone', 'website'];
  const first = split(lines[0]).map((h) => h.toLocaleLowerCase('tr-TR'));
  if (first.some((h) => HEAD[h]) && !EMAIL.test(lines[0])) {
    order = first.map((h) => HEAD[h] ?? ('skip' as keyof PastedLead));
    lines.shift();
  }
  const out: PastedLead[] = [];
  for (const line of lines.slice(0, 1000)) {
    const cells = split(line);
    const row: PastedLead = { name: '', kind, source: 'csv' };
    cells.forEach((v, i) => {
      const k = order[i];
      if (v && (k === 'name' || k === 'email' || k === 'city' || k === 'phone' || k === 'website')) row[k] = v;
    });
    // Ad sütununa e-posta yazılmışsa (yalnızca e-posta listesi) firma adı alan adından üretilir
    if (row.name && EMAIL.test(row.name)) {
      row.email ??= row.name;
      row.name = '';
    }
    if (!row.email) row.email = cells.find((v) => EMAIL.test(v))?.match(EMAIL)?.[0];
    if (row.email) row.email = row.email.toLowerCase();
    if (!row.name && row.email) row.name = row.email.split('@')[1]!.split('.')[0]!;
    if (row.name && row.name.length >= 2) out.push(row);
  }
  return out;
}
