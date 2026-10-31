// Yönetim paneli: Claude API kullanım ve maliyet raporu
import { supabase } from '@/lib/supabase';

export type AiDay = { day: string; cost: number; calls: number; receipts: number };
export type AiPrice = { model: string; input_per_mtok: number; output_per_mtok: number; cache_read_per_mtok: number; cache_write_per_mtok: number; updated_at: string };
export type AiReport = {
  usd_try: number;
  today: { cost: number; calls: number };
  yesterday: { cost: number; calls: number };
  month: { cost: number; calls: number; receipts: number };
  daily: AiDay[];
  by_model: { model: string; cost: number; calls: number; input: number; output: number }[];
  by_feature: { feature: 'receipt' | 'site_chat'; cost: number; calls: number }[];
  by_company: { company: string; cost: number; calls: number; receipts: number }[];
  prices: AiPrice[];
};

const num = (v: unknown) => Number(v ?? 0) || 0;

export async function aiReport(days = 30): Promise<AiReport> {
  const { data, error } = await supabase.rpc('admin_ai_usage', { p_days: days });
  if (error) throw error;
  const r = data as Record<string, any>;
  return {
    usd_try: num(r.usd_try) || 50,
    today: { cost: num(r.today?.cost), calls: num(r.today?.calls) },
    yesterday: { cost: num(r.yesterday?.cost), calls: num(r.yesterday?.calls) },
    month: { cost: num(r.month?.cost), calls: num(r.month?.calls), receipts: num(r.month?.receipts) },
    daily: (r.daily ?? []).map((d: any) => ({ day: String(d.day).slice(0, 10), cost: num(d.cost), calls: num(d.calls), receipts: num(d.receipts) })),
    by_model: (r.by_model ?? []).map((m: any) => ({ model: m.model, cost: num(m.cost), calls: num(m.calls), input: num(m.input), output: num(m.output) })),
    by_feature: (r.by_feature ?? []).map((f: any) => ({ feature: f.feature, cost: num(f.cost), calls: num(f.calls) })),
    by_company: (r.by_company ?? []).map((c: any) => ({ company: c.company, cost: num(c.cost), calls: num(c.calls), receipts: num(c.receipts) })),
    prices: (r.prices ?? []).map((p: any) => ({ ...p, input_per_mtok: num(p.input_per_mtok), output_per_mtok: num(p.output_per_mtok), cache_read_per_mtok: num(p.cache_read_per_mtok), cache_write_per_mtok: num(p.cache_write_per_mtok) })),
  };
}

export async function setUsdTry(rate: number) {
  const { error } = await supabase.rpc('admin_set_usd_try', { p_rate: rate });
  if (error) throw error;
}

export async function setAiPrice(p: { model: string; input: number; output: number; cacheRead: number; cacheWrite: number }) {
  const { error } = await supabase.rpc('admin_set_ai_price', { p_model: p.model, p_input: p.input, p_output: p.output, p_cache_read: p.cacheRead, p_cache_write: p.cacheWrite });
  if (error) throw error;
}

export type Tip = { tone: 'warn' | 'info' | 'ok'; title: string; text: string };

/**
 * Maliyet düşürme önerileri: rapordaki verilere bakar, yalnızca gerçekten işe yarayacak olanları söyler.
 * Eşikler bilinçli olarak sade tutuldu; veri büyüdükçe ayarlanabilir.
 */
export function savingTips(r: AiReport): Tip[] {
  const tips: Tip[] = [];
  const total = r.by_model.reduce((a, m) => a + m.cost, 0);
  const strong = r.by_model.filter((m) => m.model.includes('sonnet')).reduce((a, m) => a + m.cost, 0);
  const strongCalls = r.by_model.filter((m) => m.model.includes('sonnet')).reduce((a, m) => a + m.calls, 0);
  const receiptCalls = r.by_feature.find((f) => f.feature === 'receipt')?.calls ?? 0;
  const chat = r.by_feature.find((f) => f.feature === 'site_chat')?.cost ?? 0;
  const perReceiptTl = r.month.receipts ? (r.month.cost / r.month.receipts) * r.usd_try : 0;
  const callsPerReceipt = r.month.receipts ? receiptCalls / r.month.receipts : 0;

  if (total > 0 && strong / total > 0.4) {
    tips.push({
      tone: 'warn',
      title: `Maliyetin %${Math.round((strong / total) * 100)}'i ikinci okumadan (Sonnet) geliyor`,
      text: `Fişlerin ${strongCalls} tanesi ikinci kez, 20 kat pahalı modelle okundu. İkinci okumayı yalnızca tutar ya da KDV tutmadığında yapmak, maliyeti en çok düşürecek adım olur.`,
    });
  }
  if (callsPerReceipt > 1.6) {
    tips.push({
      tone: 'warn',
      title: `Fiş başına ${callsPerReceipt.toFixed(1)} çağrı yapılıyor`,
      text: 'Aynı fiş birden çok kez okunuyor ya da çoğu fiş ikinci modele gidiyor. Yeniden okuma düğmesinin ne sıklıkla kullanıldığına ve hangi uyarıların ikinci okumayı tetiklediğine bakın.',
    });
  }
  if (perReceiptTl > 0.3) {
    tips.push({
      tone: 'info',
      title: `Fiş başı ortalama ${perReceiptTl.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`,
      text: 'Hedef 0,15 TL altı. Fotoğraf çözünürlüğünü düşürmek görsel token\'larını azaltır; önce 20-30 gerçek fişle doğruluk testi yapıp sonra uygulayın.',
    });
  }
  if (total > 0 && chat / total > 0.2) {
    tips.push({
      tone: 'info',
      title: `Site sohbeti maliyetin %${Math.round((chat / total) * 100)}'i`,
      text: 'Sık sorulan sorulara hazır yanıt vermek ya da oturum başına mesaj sınırını düşürmek bu payı azaltır.',
    });
  }
  tips.push({
    tone: 'ok',
    title: 'Kullanıcıları tek fotoğrafta 5 fiş çekmeye yönlendirin',
    text: 'Beş fiş tek çağrıda okunduğunda fiş başı maliyet yaklaşık beşte bire iner. Tanıtım ve sitede bu özellik öne çıkarılıyor.',
  });
  return tips;
}
