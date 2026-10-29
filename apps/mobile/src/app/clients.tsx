import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Icon } from '@/components/icon';
import { InviteLink, TempPassword } from '@/components/invite-link';
import { confirm } from '@/lib/confirm';
import { Text } from '@/components/text';
import { CompanyLogo } from '@/components/company-logo';
import { Button, Empty, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { accountStatus, type AccountStatus } from '@/lib/billing';
import { addBureauStaff, staffLink } from '@/lib/people';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Staff = { user_id: string; role: 'owner' | 'accountant'; email: string; full_name: string; activated: boolean; companies: string[] };

// Muhasebe bürosu: müşteri firmalar (paket hakkı kadar), büro ekibi ve her firmanın sorumlu muhasebecisi
export default function Clients() {
  const c = useColors();
  const { bureaus, memberships, active, userId, setActiveCompany, reloadMemberships } = useSession();
  const bureau = bureaus.find((b) => b.role === 'owner') ?? bureaus[0];
  const firms = memberships.filter((m) => m.bureau_account_id === bureau?.account_id);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [team, setTeam] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // firma ekleme
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [vkn, setVkn] = useState('');
  const [firmOwner, setFirmOwner] = useState<string | null>(null); // null = ben (büro sahibi)
  const [busy, setBusy] = useState(false);
  // sorumlu değiştirme
  const [editingFirm, setEditingFirm] = useState<string | null>(null);
  // muhasebeci ekleme
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffFirms, setStaffFirms] = useState<string[]>([]);
  const [staffBusy, setStaffBusy] = useState(false);
  const [invite, setInvite] = useState<{ link: string; name: string; email?: string } | null>(null);
  const [tempFor, setTempFor] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  // Firmanın kendi girişi açık mı (büro tercihi)
  const [selfService, setSelfService] = useState<Record<string, boolean>>({});
  const [accessFirm, setAccessFirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bureau) return;
    setStatus(await accountStatus(bureau.account_id).catch(() => null));
    const { data } = await supabase.rpc('bureau_team', { p_account: bureau.account_id });
    setTeam((data ?? []) as Staff[]);
    const ids = memberships.filter((m) => m.bureau_account_id === bureau.account_id).map((m) => m.company_id);
    if (ids.length) {
      const { data: cs } = await supabase.from('companies').select('id, self_service').in('id', ids);
      setSelfService(Object.fromEntries(((cs ?? []) as { id: string; self_service: boolean }[]).map((x) => [x.id, x.self_service])));
    }
  }, [bureau, memberships]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!bureau) {
    return (
      <View style={{ padding: space.xl }}>
        <Notice text="Bu ekran muhasebe büroları içindir." />
      </View>
    );
  }

  const isOwner = bureau.role === 'owner';
  const full = status?.max_companies != null && firms.length >= status.max_companies;
  const accountants = team.filter((t) => t.role === 'accountant');
  const owner = team.find((t) => t.role === 'owner');
  const responsibleOf = (companyId: string) => accountants.filter((a) => a.companies.includes(companyId));
  const meOwner = !!owner && owner.user_id === userId;
  const ownerChip = meOwner ? 'Bana bağla' : `Büro sahibine bağla${owner ? ` (${owner.full_name})` : ''}`;
  const ownerLabel = owner ? `${owner.full_name}${owner.user_id === userId ? ' (siz)' : ''}` : 'Büro sahibi';

  async function setFirmAccess(companyId: string, on: boolean) {
    setError(null);
    const { error: e } = await supabase.rpc('bureau_set_self_service', { p_company: companyId, p_on: on });
    if (e) return setError(errorText(e));
    setSelfService((x) => ({ ...x, [companyId]: on }));
  }

  /** Firmanın yetkilisini eklemek için o firmaya geçip Ekip ekranını açar */
  function addFirmUser(companyId: string) {
    setActiveCompany(companyId);
    router.push('/team');
  }

  async function assign(user: string, company: string, on: boolean) {
    if (!bureau) return;
    const { error: e } = await supabase.rpc('bureau_assign', { p_account: bureau.account_id, p_user: user, p_company: company, p_assigned: on });
    if (e) throw e;
  }

  /** Firmanın sorumlusunu tek kişi yapar; null = büro sahibi (kimse atanmaz, sahip zaten hepsini görür) */
  async function setResponsible(company: string, user: string | null) {
    setError(null);
    try {
      for (const a of accountants) {
        const has = a.companies.includes(company);
        if (a.user_id === user && !has) await assign(a.user_id, company, true);
        if (a.user_id !== user && has) await assign(a.user_id, company, false);
      }
      setEditingFirm(null);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function addFirm() {
    if (!bureau) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('bureau_add_company', { p_account: bureau.account_id, p_legal_name: name, p_tax_number: vkn });
    if (e) {
      setBusy(false);
      return setError(errorText(e));
    }
    if (firmOwner) await assign(firmOwner, data as string, true).catch((x) => setError(errorText(x)));
    setBusy(false);
    setName('');
    setVkn('');
    setFirmOwner(null);
    setAdding(false);
    await reloadMemberships();
    load();
  }

  async function addStaff() {
    if (!bureau) return;
    setError(null);
    setInfo(null);
    setInvite(null);
    if (staffName.trim().length < 2) return setError('Muhasebecinin adını soyadını yazın.');
    setStaffBusy(true);
    try {
      const r = await addBureauStaff({ accountId: bureau.account_id, fullName: staffName.trim(), email: staffEmail.trim(), companyIds: staffFirms });
      if (r.link) setInvite({ link: r.link, name: staffName.trim(), email: staffEmail.trim() || undefined });
      else setInfo(r.demo ? `${staffName.trim()} eklendi. Test sürüşü ekranından ona geçebilirsiniz.` : `${staffName.trim()} zaten Gidero kullanıyor; kendi şifresiyle girer.`);
      setStaffName('');
      setStaffEmail('');
      setStaffFirms([]);
      setStaffOpen(false);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStaffBusy(false);
    }
  }

  async function makeLink(s: Staff) {
    if (!bureau) return;
    setLinkBusy(s.user_id);
    setError(null);
    try {
      setInvite({ link: await staffLink(bureau.account_id, s.user_id), name: s.full_name, email: s.email });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLinkBusy(null);
    }
  }

  const chip = (on: boolean) => [styles.chip, { backgroundColor: on ? c.pen : c.canvas }];
  const chipText = (on: boolean) => ({ color: on ? c.onPen : c.ink, fontWeight: (on ? '600' : '400') as '600' | '400' });

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: c.deep, borderRadius: radius.lg, padding: space.xl, gap: 4 }}>
        <Text style={[type.small, { color: c.onDeepMuted, fontWeight: '600' }]}>{bureau.name}</Text>
        <Text style={[type.display, { color: c.onDeep, fontSize: 36 }]}>
          {firms.length}
          <Text style={{ color: c.onDeepMuted, fontSize: 22 }}> / {status?.max_companies ?? '—'} firma</Text>
        </Text>
        <Text style={[type.small, { color: c.onDeepMuted }]}>
          {status ? `${status.plan_name ?? 'Ücretsiz deneme'}${status.active ? '' : ', süresi doldu'}` : ''}
          {` · ${accountants.length} muhasebeci`}
        </Text>
      </View>

      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}
      {invite && <InviteLink link={invite.link} name={invite.name} email={invite.email} onClose={() => setInvite(null)} />}
      {full && isOwner && <Notice tone="warn" text="Paketinizdeki firma hakkının hepsi kullanılıyor. Yeni firma için paketinizi büyütün." />}

      {/* ------------------------------ Firmalar ------------------------------ */}
      {isOwner && (
        <View style={{ gap: space.sm }}>
          {!adding ? (
            <Button icon="plus" title="Müşteri firma ekle" onPress={() => (full ? router.push('/subscription') : setAdding(true))} />
          ) : (
            <View style={[styles.box, { backgroundColor: c.paper }]}>
              <Field label="Firma unvanı" value={name} onChangeText={setName} placeholder="Örnek Gıda Ltd. Şti." autoFocus />
              <Field label="Vergi numarası" value={vkn} onChangeText={setVkn} keyboardType="number-pad" maxLength={11} />
              <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Sorumlu muhasebeci</Text>
              <View style={styles.chips}>
                <Pressable onPress={() => setFirmOwner(null)} style={chip(firmOwner === null)}>
                  <Text style={chipText(firmOwner === null)}>{ownerChip}</Text>
                </Pressable>
                {accountants.map((a) => (
                  <Pressable key={a.user_id} onPress={() => setFirmOwner(a.user_id)} style={chip(firmOwner === a.user_id)}>
                    <Text style={chipText(firmOwner === a.user_id)}>{a.full_name}</Text>
                  </Pressable>
                ))}
              </View>
              {accountants.length === 0 && (
                <Text style={[type.small, { color: c.muted }]}>Henüz muhasebeciniz yok; firma size bağlanır. Aşağıdan muhasebeci ekleyince firmaları ona atayabilirsiniz.</Text>
              )}
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button variant="secondary" title="Vazgeç" onPress={() => setAdding(false)} style={{ flex: 1, backgroundColor: c.canvas }} />
                <Button title="Ekle" onPress={addFirm} loading={busy} style={{ flex: 1 }} />
              </View>
            </View>
          )}
          <Button variant="plain" title="Paketi ve ödemeyi yönet" onPress={() => router.push('/subscription')} />
        </View>
      )}

      <SectionTitle title="Müşteri firmalar" />
      {firms.length === 0 ? (
        <Empty
          icon="doc"
          title="Henüz müşteri firma yok"
          text="Firma ekleyin, sonra firmaya dokunun: WhatsApp'tan gelen fişleri o firmaya yükler, kayda alır ve dökümünü alırsınız. İsterseniz firmaya kendi girişini de açabilirsiniz."
        />
      ) : (
        <Group>
          {firms.map((f) => {
            const resp = responsibleOf(f.company_id);
            const respText = resp.length ? resp.map((r) => r.full_name).join(', ') : ownerLabel;
            return (
              <View key={f.company_id}>
                <Row
                  icon="doc"
                  left={f.companies.logo_path ? <CompanyLogo path={f.companies.logo_path} /> : undefined}
                  title={f.companies.legal_name}
                  subtitle={`Vergi no ${f.companies.tax_number} · Sorumlu: ${respText}`}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      {isOwner && (
                        <Pressable onPress={() => setAccessFirm(accessFirm === f.company_id ? null : f.company_id)} hitSlop={8} style={[styles.small, { backgroundColor: selfService[f.company_id] ? c.penSoft : c.canvas }]}>
                          <Text style={{ color: c.pen, fontSize: 13, fontWeight: '600' }}>{selfService[f.company_id] ? 'Girişi açık' : 'Firma girişi'}</Text>
                        </Pressable>
                      )}
                      {isOwner && (
                        <Pressable onPress={() => setEditingFirm(editingFirm === f.company_id ? null : f.company_id)} hitSlop={8} style={[styles.small, { backgroundColor: c.canvas }]}>
                          <Text style={{ color: c.pen, fontSize: 13, fontWeight: '600' }}>Sorumlu</Text>
                        </Pressable>
                      )}
                      {f.company_id === active?.company_id ? <Icon name="check" size={16} color={c.pen} /> : null}
                    </View>
                  }
                  onPress={() => {
                    setActiveCompany(f.company_id);
                    router.dismissTo('/');
                  }}
                />
                {accessFirm === f.company_id && (
                  <View style={[styles.edit, { borderTopColor: c.paperLine }]}>
                    <Text style={[type.bodyStrong, { color: c.ink }]}>Firmanın kendi girişi</Text>
                    <Text style={[type.small, { color: c.muted }]}>
                      Açarsanız firmanın yetkilisi ve çalışanları Gidero'ya kendileri girer: fişlerini telefonla çeker, kendi onay zincirlerinden geçirir ve bütün giderlerini görür. Muhasebe, kontrol ve aktarım yine sizde kalır; sizin girdiğiniz fişler onaysız kayda alınmaya devam eder.
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                      <Text style={[type.body, { color: c.ink, flex: 1 }]}>{selfService[f.company_id] ? 'Firma kendi girişini kullanıyor' : 'Fişleri yalnızca büro giriyor'}</Text>
                      <Switch value={!!selfService[f.company_id]} onValueChange={(v) => setFirmAccess(f.company_id, v)} />
                    </View>
                    {selfService[f.company_id] ? (
                      <Button icon="personAdd" title="Firmaya yetkili ya da çalışan ekle" onPress={() => addFirmUser(f.company_id)} />
                    ) : null}
                  </View>
                )}
                {editingFirm === f.company_id && (
                  <View style={[styles.edit, { borderTopColor: c.paperLine }]}>
                    <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Bu firmaya kim bakacak?</Text>
                    <View style={styles.chips}>
                      <Pressable onPress={() => setResponsible(f.company_id, null)} style={chip(resp.length === 0)}>
                        <Text style={chipText(resp.length === 0)}>{ownerChip}</Text>
                      </Pressable>
                      {accountants.map((a) => {
                        const on = resp.length === 1 && resp[0].user_id === a.user_id;
                        return (
                          <Pressable key={a.user_id} onPress={() => setResponsible(f.company_id, a.user_id)} style={chip(on)}>
                            <Text style={chipText(on)}>{a.full_name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {accountants.length === 0 && <Text style={[type.small, { color: c.muted }]}>Önce aşağıdan muhasebeci ekleyin.</Text>}
                  </View>
                )}
              </View>
            );
          })}
        </Group>
      )}

      {/* ------------------------------ Büro ekibi ------------------------------ */}
      <SectionTitle title="Büro ekibi" />
      <Text style={[type.small, { color: c.muted, marginTop: -space.sm }]}>
        Muhasebeci yalnızca kendisine bağlanan firmaları görür; büro sahibi hepsini görür. Bir firmayı birden çok muhasebeciye de bağlayabilirsiniz.
      </Text>
      {team.map((m) => (
        <View key={m.user_id} style={[styles.box, { backgroundColor: c.paper }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: c.ink }]}>{`${m.full_name}${m.user_id === userId ? ' (siz)' : ''}`}</Text>
              <Text style={[type.small, { color: c.muted }]}>
                {`${m.role === 'owner' ? 'Büro sahibi, tüm firmalar' : `Muhasebeci, ${m.companies.length} firma`} · ${m.email}`}
              </Text>
            </View>
            {m.role === 'accountant' && !m.activated && (
              <View style={[styles.badge, { backgroundColor: c.stampSoft }]}>
                <Text style={{ color: c.stamp, fontSize: 12, fontWeight: '700' }}>Davet bekliyor</Text>
              </View>
            )}
          </View>
          {m.role === 'accountant' && (
            <>
              <View style={styles.chips}>
                {firms.map((f) => {
                  const on = m.companies.includes(f.company_id);
                  return (
                    <Pressable
                      key={f.company_id}
                      disabled={!isOwner}
                      onPress={() => assign(m.user_id, f.company_id, !on).then(load, (e) => setError(errorText(e)))}
                      style={chip(on)}>
                      <Text style={chipText(on)}>{f.companies.legal_name}</Text>
                    </Pressable>
                  );
                })}
                {firms.length === 0 && <Text style={[type.small, { color: c.muted }]}>Önce müşteri firma ekleyin.</Text>}
              </View>
              {isOwner && (
                <View style={styles.chips}>
                  {!m.activated && (
                    <>
                      <Button variant="secondary" title="Giriş bağlantısı gönder" loading={linkBusy === m.user_id} onPress={() => makeLink(m)} />
                      <Button variant="secondary" title="Şifresini ben belirleyeyim" onPress={() => setTempFor(tempFor === m.user_id ? null : m.user_id)} />
                    </>
                  )}
                  {m.user_id !== userId && <Button
                    variant="danger"
                    title="Büro ekibinden çıkar"
                    onPress={() =>
                      confirm(`${m.full_name} büro ekibinden çıkarılsın mı?`, 'Artık firmalarınızı göremez. Girdiği kayıtlar silinmez.', 'Çıkar', async () => {
                        const { error: e } = await supabase.rpc('bureau_remove_staff', { p_account: bureau.account_id, p_user: m.user_id });
                        if (e) return setError(errorText(e));
                        load();
                      })
                    }
                  />}
                </View>
              )}
              {tempFor === m.user_id && (
                <TempPassword name={m.full_name} userId={m.user_id} accountId={bureau.account_id} onDone={load} />
              )}
            </>
          )}
        </View>
      ))}

      {isOwner &&
        (!staffOpen ? (
          <Button variant="secondary" icon="personAdd" title="Muhasebeci ekle" onPress={() => setStaffOpen(true)} />
        ) : (
          <View style={[styles.box, { backgroundColor: c.paper }]}>
            <Text style={[type.small, { color: c.muted }]}>
              Muhasebeciyi siz açarsınız; önceden kaydolması gerekmez. Ekleyince çıkan giriş bağlantısını WhatsApp'tan gönderin, tıklayıp şifresini belirler.
            </Text>
            <Field label="Ad soyad" value={staffName} onChangeText={setStaffName} placeholder="Örnek: Can Yıldız" />
            <Field label="E-posta" value={staffEmail} onChangeText={setStaffEmail} autoCapitalize="none" keyboardType="email-address" hint="Muhasebeci bu e-postayla giriş yapar." />
            <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Baktığı firmalar</Text>
            <View style={styles.chips}>
              {firms.map((f) => {
                const on = staffFirms.includes(f.company_id);
                return (
                  <Pressable
                    key={f.company_id}
                    onPress={() => setStaffFirms(on ? staffFirms.filter((x) => x !== f.company_id) : [...staffFirms, f.company_id])}
                    style={chip(on)}>
                    <Text style={chipText(on)}>{f.companies.legal_name}</Text>
                  </Pressable>
                );
              })}
              {firms.length === 0 && <Text style={[type.small, { color: c.muted }]}>Firma ekledikten sonra atayabilirsiniz.</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button variant="secondary" title="Vazgeç" onPress={() => setStaffOpen(false)} style={{ flex: 1, backgroundColor: c.canvas }} />
              <Button title="Muhasebeciyi ekle" onPress={addStaff} loading={staffBusy} style={{ flex: 1 }} />
            </View>
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  small: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  edit: { padding: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
});
