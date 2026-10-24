// Fiş okuma hattının ortak tipleri. Deno (Edge Function) ve Node (testler) ile uyumlu; dış bağımlılık yok.

export type DocType =
  | "e_fatura" | "e_arsiv" | "okc_fis" | "akaryakit_okc" | "serbest_meslek" | "gider_pusulasi"
  | "bilet" | "yurtdisi_fatura" | "dekont" | "no_document" | "unknown";

export type FieldSource = "qr" | "ai" | "user";

export interface VatLine {
  rate: number;
  base: number;
  vat: number;
}

export interface ReceiptFields {
  readable: boolean;
  doc_type: DocType;
  seller_name: string | null;
  seller_vkn: string | null;
  buyer_name: string | null;
  buyer_vkn: string | null;
  date: string | null;      // YYYY-MM-DD
  time: string | null;      // HH:MM
  doc_no: string | null;
  ettn: string | null;
  z_no: string | null;
  plate: string | null;
  currency: string;
  total: number | null;
  vat_lines: VatLine[];
  other_taxes: { type: "konaklama" | "otv" | "diger"; amount: number }[];
  confidence: { total: number; date: number; doc_no: number; vat: number };
}

export interface ReadResult {
  fields: ReceiptFields;
  source: FieldSource;           // toplamın kaynağı
  model: string | null;          // okuyan model, karekodda null
  attempts: { model: string; ok: boolean; issues: string[] }[];
}

export type Severity = "info" | "warning" | "critical";

export interface Flag {
  code: string;
  severity: Severity;
  message: string;
  legal_ref?: string;
}

export type TaxRule =
  | "standard" | "meal" | "representation" | "accommodation" | "fuel" | "car_running"
  | "car_rent" | "travel" | "kkeg" | "mileage" | "per_diem";

// Vergi motorunun girdisi: okunan alanlar + şirket ayarları + yıl parametreleri + bağlam
export interface TaxContext {
  fields: ReceiptFields;
  entered_total: number | null;            // kullanıcının kaydettiği tutar
  read_total: number | null;               // okunan tutar
  company_tax_number: string;
  company: { car_kkeg_vat_deductible: boolean; okc_vat_policy: "cautious" | "flexible" };
  category: { tax_rule: TaxRule; attendees_required: boolean } | null;
  attendees: string[];
  params: Record<string, unknown>;         // tax_parameters: key -> value (belge yılı)
  same_day_same_seller_total: number;      // aynı gün, aynı satıcı, aynı kullanıcı, bu belge hariç
  duplicate_of: string[];                  // olası mükerrer masraf kimlikleri
  owner_plates?: string[] | null;
  /** Gider grubu sınırı: kişinin bu dönemde bu gruptaki diğer harcamaları (bu fiş hariç) */
  limit?: { category: string; amount: number; period: "month" | "quarter" | "half" | "year"; used_other: number } | null;          // masraf sahibinin kartındaki araç plakaları (normalize); null = bilinmiyor
  today: string;                           // YYYY-MM-DD
}
