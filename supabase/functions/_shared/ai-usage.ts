// Claude API kullanımını ai_usage tablosuna yazar (maliyet veritabanında, fiyat tablosundan hesaplanır).
// Kayıt başarısız olursa asıl işi bozmaz; yalnızca günlüğe yazılır.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ApiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export type UsageRow = {
  feature: "receipt" | "site_chat" | "lead_search";
  model: string;
  usage?: ApiUsage | null;
  company_id?: string | null;
  user_id?: string | null;
  expense_id?: string | null;
  web_searches?: number;
};

export function toRow(r: UsageRow) {
  const u = r.usage ?? {};
  return {
    feature: r.feature,
    model: r.model,
    company_id: r.company_id ?? null,
    user_id: r.user_id ?? null,
    expense_id: r.expense_id ?? null,
    input_tokens: Math.max(0, Math.round(u.input_tokens ?? 0)),
    output_tokens: Math.max(0, Math.round(u.output_tokens ?? 0)),
    cache_read_tokens: Math.max(0, Math.round(u.cache_read_input_tokens ?? 0)),
    cache_write_tokens: Math.max(0, Math.round(u.cache_creation_input_tokens ?? 0)),
    web_searches: Math.max(0, Math.round(r.web_searches ?? 0)),
  };
}

// deno-lint-ignore no-explicit-any
export async function logUsage(admin: SupabaseClient<any, any, any>, rows: UsageRow[]) {
  const list = rows.filter((r) => r.usage);
  if (!list.length) return;
  const { error } = await admin.from("ai_usage").insert(list.map(toRow));
  if (error) console.error("ai_usage insert", error.message);
}
