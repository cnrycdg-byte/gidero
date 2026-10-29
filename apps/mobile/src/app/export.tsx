import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { excelExport, logoExport, lucaExport } from '@/lib/accounting/formats.ts';
import { buildEntry, type CompanySettings } from '@/lib/accounting/journal.ts';
import {
  loadBatches,
  loadCompanySettings,
  loadReports,
  markExported,
  saveCompanySettings,
  type ExportBatch,
  type ExportableReport,
} from '@/lib/accounting/load.ts';
import { saveFile } from '@/lib/download';
import { dateText, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';

type Format = 'excel' | 'luca' | 'logo';
const FORMAT_LABEL: Record<Format, string> = { excel: 'Excel döküm', luca: 'Luca dosyası', logo: 'Logo XML' };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function lastPeriods(n: number) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
  });
}
const periodLabel = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

// Muhasebeci: onaylanmış raporları döküm ve aktarım dosyası olarak alır, sonra "aktarıldı" diye kilitler.
export default function ExportScreen() {
  const c = useColors();
  const { active, hasRole } = useSession();
  const canUse = hasRole('admin') || hasRole('accountant');
  const periods = useMemo(() => lastPeriods(6), []);
  const [period, setPeriod] = useState<string | null>(periods[1] ?? null);
  const [reports, setReports] = useState<ExportableReport[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<(CompanySettings & { accounting_software: string | null }) | null>(null);
  const [batches, setBatches] = useState<ExportBatch[]>([]);
  const [lastFormat, setLastFormat] = useState<Format | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active || !canUse) return;
    setLoading(true);
    setError(null);
    try {
      const [r, s, b] = await Promise.all([
        loadReports(active.company_id, { period, statuses: ['approved', 'booked'] }),
        loadCompanySettings(active.company_id),
        loadBatches(active.company_id),
      ]);
      setReports(r);
      setSelected(new Set(r.map((x) => x.id)));
      setSettings(s);
      setBatches(b);
      setConfirming(false);
      setLastFormat(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [active, canUse, period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const chosen = reports.filter((r) => selected.has(r.id));
  const entries = useMemo(() => (settings ? chosen.map((r) => buildEntry(r, settings)) : []), [chosen, settings]);
  const warnings = entries.flatMap((e) => e.warnings.map((w) => `${e.description}: ${w}`));
  const fisCount = chosen.reduce((a, r) => a + r.expenses.length, 0);
  const total = chosen.reduce((a, r) => a + r.total, 0);
  const label = period ?? 'tum';

  if (!canUse) {
    return (
      <Page>
        <Notice tone="info" text="Muhasebe aktarımını yalnızca muhasebeci ya da yönetici yapabilir." />
      </Page>
    );
  }

  async function download(f: Format, list = chosen, ents = entries) {
    if (!settings || !list.length) return;
    setError(null);
    setDone(null);
    try {
      const file =
        f === 'excel'
          ? excelExport(list, ents, settings.legal_name, label)
          : f === 'luca'
            ? lucaExport(ents, settings.legal_name, label)
            : logoExport(ents, settings.legal_name, label);
      await saveFile(file.filename, file.mime, file.bytes);
      setLastFormat(f);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function lock() {
    if (!active || !lastFormat || !chosen.length) return;
    setBusy(true);
    setError(null);
    try {
      await markExported(active.company_id, chosen.map((r) => r.id), lastFormat);
      setDone(`${chosen.length} rapor aktarıldı olarak işaretlendi. Bu raporlar artık değiştirilemez.`);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function redownload(b: ExportBatch) {
    if (!active || !settings) return;
    try {
      const list = await loadReports(active.company_id, { statuses: ['exported'], ids: b.report_ids });
      await download(b.format, list, list.map((r) => buildEntry(r, settings)));
    } catch (e) {
      setError(errorText(e));
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setConfirming(false);
  }

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      <Text style={[type.body, { color: c.muted }]}>
        Onaylanmış raporlar burada. Dosyayı indirip muhasebe programınıza aktarın, ardından aktarıldı olarak işaretleyin.
      </Text>
      {error && <Notice tone="bad" text={error} />}
      {done && <Notice tone="ok" text={done} />}

      <View style={styles.chips}>
        {[...periods, null].map((p) => {
          const on = p === period;
          return (
            <Pressable key={p ?? 'all'} onPress={() => setPeriod(p)} style={[styles.chip, { backgroundColor: on ? c.pen : c.paper }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{p ? periodLabel(p) : 'Tüm dönemler'}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle title={`Aktarılmayı bekleyen raporlar (${reports.length})`} />
      {reports.length === 0 && !loading ? (
        <Text style={[type.body, { color: c.muted }]}>Bu dönemde aktarılmayı bekleyen onaylı rapor yok.</Text>
      ) : (
        <Group>
          {reports.map((r) => {
            const on = selected.has(r.id);
            const alcohol = r.expenses.filter((e) => e.flag_codes.includes('alcohol')).length;
            const flags = r.expenses.reduce((a, e) => a + e.flag_codes.filter((f) => f !== 'alcohol').length, 0);
            return (
              <Row
                key={r.id}
                icon={on ? 'checkCircle' : 'doc'}
                iconColor={on ? c.pen : c.faint}
                title={`${r.owner_name}, ${r.title}`}
                subtitle={`${r.expenses.length} fiş${flags ? `, ${flags} uyarı` : ''}${alcohol ? `, ${alcohol} fişte alkol kararı bekliyor` : ''}${r.approved_at ? `, onay ${dateText(r.approved_at)}` : ''}`}
                value={money(r.total)}
                onPress={() => toggle(r.id)}
                chevron={false}
              />
            );
          })}
        </Group>
      )}

      {chosen.length > 0 && (
        <View style={[styles.summary, { backgroundColor: c.paper }]}>
          <Text style={[type.bodyStrong, { color: c.ink }]}>{`${chosen.length} rapor, ${fisCount} fiş, ${money(total)}`}</Text>
          {warnings.length > 0 && (
            <Notice tone="warn" text={`Kontrol edin: ${warnings.slice(0, 3).join(' ')}${warnings.length > 3 ? ` (+${warnings.length - 3} uyarı daha, Excel'in Kontrol sayfasında)` : ''}`} />
          )}
          <View style={styles.buttons}>
            <Button title="Excel döküm indir" onPress={() => download('excel')} />
            <Button title="Luca dosyası (deneme)" variant="secondary" onPress={() => download('luca')} />
            <Button title="Logo XML (deneme)" variant="secondary" onPress={() => download('logo')} />
          </View>
          <Text style={[type.small, { color: c.muted }]}>
            Luca ve Logo dosyaları deneme sürümüdür. Programınıza aktarmadan önce birkaç kayıtla deneyin; uyuşmayan sütun olursa bize örnek dosyanızı gönderin.
          </Text>
          {lastFormat &&
            (confirming ? (
              <View style={{ gap: space.sm }}>
                <Text style={[type.body, { color: c.ink }]}>
                  {`${chosen.length} rapor kilitlenecek ve bir daha değiştirilemeyecek. Dosyayı programınıza aktardınız mı?`}
                </Text>
                <View style={styles.buttons}>
                  <Button title="Evet, aktarıldı olarak işaretle" onPress={lock} loading={busy} />
                  <Button title="Vazgeç" variant="plain" onPress={() => setConfirming(false)} />
                </View>
              </View>
            ) : (
              <Button title="Aktarıldı olarak işaretle" variant="secondary" onPress={() => setConfirming(true)} />
            ))}
        </View>
      )}

      <Pressable onPress={() => setShowAccounts((v) => !v)} style={styles.toggleRow}>
        <SectionTitle title="Hesap kodları" />
        <Icon name="chevron" size={13} color={c.faint} />
      </Pressable>
      {showAccounts && settings && active && (
        <AccountSettings
          value={settings}
          onSaved={(s) => {
            setSettings(s);
            setDone('Hesap kodları kaydedildi.');
          }}
          companyId={active.company_id}
        />
      )}

      {batches.length > 0 && (
        <>
          <SectionTitle title="Aktarım geçmişi" />
          <Group>
            {batches.map((b) => (
              <Row
                key={b.id}
                icon="inbox"
                title={`${FORMAT_LABEL[b.format]}, ${b.report_ids.length} rapor`}
                subtitle={`${dateText(b.created_at)}, ${b.expense_count} fiş`}
                value={money(b.total)}
                onPress={() => redownload(b)}
              />
            ))}
          </Group>
          <Text style={[type.small, { color: c.muted }]}>Geçmiş bir aktarımın dosyasını yeniden indirmek için üzerine dokunun.</Text>
        </>
      )}
    </Page>
  );
}

const SOFTWARE: { key: string; label: string }[] = [
  { key: 'luca', label: 'Luca' },
  { key: 'logo', label: 'Logo' },
  { key: 'mikro', label: 'Mikro' },
  { key: 'netsis', label: 'Netsis' },
  { key: 'zirve', label: 'Zirve' },
  { key: 'eta', label: 'ETA' },
  { key: 'parasut', label: 'Paraşüt' },
  { key: 'other', label: 'Diğer' },
];

function AccountSettings({
  value,
  companyId,
  onSaved,
}: {
  value: CompanySettings & { accounting_software: string | null };
  companyId: string;
  onSaved: (v: CompanySettings & { accounting_software: string | null }) => void;
}) {
  const c = useColors();
  const [d, setD] = useState({ ...value, vat20: value.vat_accounts['20'] ?? '', vat10: value.vat_accounts['10'] ?? '', vat1: value.vat_accounts['1'] ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const code = /^[0-9][0-9.]{0,30}$/;

  async function save() {
    setError(null);
    const fields = [d.account_personnel, d.account_card, d.account_advance, d.account_cash, d.account_vat, d.account_kkeg];
    const vats = [d.vat20, d.vat10, d.vat1].filter(Boolean);
    if ([...fields, ...vats].some((f) => !code.test(f.trim()))) return setError('Hesap kodlarını 335.01 biçiminde, yalnızca rakam ve nokta ile yazın.');
    const vat_accounts: Record<string, string> = {};
    if (d.vat20) vat_accounts['20'] = d.vat20.trim();
    if (d.vat10) vat_accounts['10'] = d.vat10.trim();
    if (d.vat1) vat_accounts['1'] = d.vat1.trim();
    const next = {
      ...value,
      account_personnel: d.account_personnel.trim(),
      account_card: d.account_card.trim(),
      account_advance: d.account_advance.trim(),
      account_cash: d.account_cash.trim(),
      account_vat: d.account_vat.trim(),
      account_kkeg: d.account_kkeg.trim(),
      vat_accounts,
      accounting_software: d.accounting_software,
    };
    setBusy(true);
    try {
      await saveCompanySettings(companyId, { ...next, accounting_software: next.accounting_software ?? undefined });
      onSaved(next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.summary, { backgroundColor: c.paper }]}>
      <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Muhasebe programınız</Text>
      <View style={styles.chips}>
        {SOFTWARE.map((s) => {
          const on = d.accounting_software === s.key;
          return (
            <Pressable key={s.key} onPress={() => set({ accounting_software: s.key })} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
              <Text style={{ color: on ? c.onPen : c.ink }}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="Çalışana borç (kişiye özel alt hesap yoksa)" value={d.account_personnel} onChangeText={(v) => set({ account_personnel: v })} />
      <Field label="Şirket kredi kartı" value={d.account_card} onChangeText={(v) => set({ account_card: v })} />
      <Field label="İş avansı" value={d.account_advance} onChangeText={(v) => set({ account_advance: v })} />
      <Field label="Kasa" value={d.account_cash} onChangeText={(v) => set({ account_cash: v })} />
      <Field label="İndirilecek KDV (oran hesabı yoksa)" value={d.account_vat} onChangeText={(v) => set({ account_vat: v })} />
      <View style={styles.row3}>
        <View style={{ flex: 1 }}><Field label="KDV %20" value={d.vat20} onChangeText={(v) => set({ vat20: v })} placeholder="191.20" /></View>
        <View style={{ flex: 1 }}><Field label="KDV %10" value={d.vat10} onChangeText={(v) => set({ vat10: v })} placeholder="191.10" /></View>
        <View style={{ flex: 1 }}><Field label="KDV %1" value={d.vat1} onChangeText={(v) => set({ vat1: v })} placeholder="191.01" /></View>
      </View>
      <Field
        label="Kanunen kabul edilmeyen giderler"
        value={d.account_kkeg}
        onChangeText={(v) => set({ account_kkeg: v })}
        hint="Binek araç payı ve KKEG gider grupları bu hesaba yazılır. Oranı Gider grupları ekranında belirleyin."
      />
      {error && <Notice tone="bad" text={error} />}
      <Button title="Hesap kodlarını kaydet" onPress={save} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  summary: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row3: { flexDirection: 'row', gap: space.sm },
});
