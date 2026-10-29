import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Field, Group, Notice, Row, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { formatPlate, normalizePlate } from '@/lib/plate';
import { ROLE_LABEL } from '@/lib/types';
import { InviteLink } from '@/components/invite-link';
import { addPerson, memberLink } from '@/lib/people';

type Member = { user_id: string; roles: string[]; manager_user_id: string | null; vehicle_plates: string[]; full_name: string; title: string | null; final_approver: boolean };

const CHOICES = ['employee', 'approver', 'accountant', 'admin'];

export default function Team() {
  const c = useColors();
  const { active, userId, reloadMemberships } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>(['employee']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [plateDraft, setPlateDraft] = useState('');
  const [plateBusy, setPlateBusy] = useState(false);
  const [plateError, setPlateError] = useState<string | null>(null);
  const [manager, setManager] = useState<string | null>(null); // yeni kişinin yöneticisi; null = ben
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editManager, setEditManager] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editName, setEditName] = useState('');
  const [invite, setInvite] = useState<{ link: string; name: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) return;
    const { data } = await supabase
      .from('memberships')
      .select('user_id, roles, manager_user_id, vehicle_plates, title, final_approver')
      .eq('company_id', active.company_id)
      .eq('status', 'active');
    const list = (data ?? []) as Omit<Member, 'full_name'>[];
    const { data: people } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', list.map((m) => m.user_id));
    const names = new Map((people ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
    setMembers(list.map((m) => ({ ...m, full_name: names.get(m.user_id) || 'İsimsiz kullanıcı' })));
  }, [active]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function add() {
    if (!active) return;
    setError(null);
    setInfo(null);
    setInvite(null);
    if (fullName.trim().length < 2) return setError('Kişinin adını soyadını yazın.');
    setBusy(true);
    try {
      const r = await addPerson({
        companyId: active.company_id,
        fullName: fullName.trim(),
        title: title.trim(),
        email: email.trim(),
        roles,
        managerId: manager ?? userId,
      });
      setInfo(`${fullName.trim()} eklendi. Masraflarını ${manager && manager !== userId ? nameOf(manager) : 'siz'} onaylayacak; onay zincirini "Onay zinciri" ekranından düzenleyebilirsiniz.`);
      if (!r.demo && r.link) setInvite({ link: r.link, name: fullName.trim() });
      if (!r.demo && !r.link) setInfo(`${fullName.trim()} zaten Gidero kullanıyor; kendi şifresiyle girer ve şirketinizi görür.`);
      if (r.warning) setError(r.warning);
      setManager(null);
      setEmail('');
      setFullName('');
      setTitle('');
      setRoles(['employee']);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function makeLink(m: Member) {
    if (!active) return;
    setLinkBusy(m.user_id);
    setPlateError(null);
    try {
      setInvite({ link: await memberLink(active.company_id, m.user_id), name: m.full_name });
    } catch (e) {
      setPlateError(errorText(e));
    } finally {
      setLinkBusy(null);
    }
  }

  const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.full_name;

  function startEdit(m: Member) {
    setEditing(editing === m.user_id ? null : m.user_id);
    setPlateDraft((m.vehicle_plates ?? []).map(formatPlate).join(', '));
    setEditRoles(m.roles);
    setEditManager(m.manager_user_id);
    setEditTitle(m.title ?? '');
    setEditName(m.full_name);
    setPlateError(null);
  }

  async function savePlates(m: Member) {
    if (!active) return;
    const parts = plateDraft.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean);
    const bad = parts.filter((x) => !normalizePlate(x));
    if (bad.length) return setPlateError(`Şu plaka geçersiz: ${bad.join(', ')}. Örnek: 35 ABC 123`);
    if (editRoles.length === 0) return setPlateError('Kişiye en az bir rol verin.');
    setPlateBusy(true);
    setPlateError(null);
    const { error: e0 } = await supabase.rpc('set_member', {
      p_company: active.company_id,
      p_user: m.user_id,
      p_roles: editRoles,
      p_manager: editManager,
    });
    if (e0) {
      setPlateBusy(false);
      return setPlateError(errorText(e0));
    }
    const { error: e1 } = await supabase.rpc('set_member_details', {
      p_company: active.company_id,
      p_user: m.user_id,
      p_title: editTitle,
      p_final_approver: m.final_approver,
    });
    if (!e1 && editName.trim() && editName.trim() !== m.full_name) {
      await supabase.rpc('set_member_name', { p_company: active.company_id, p_user: m.user_id, p_full_name: editName.trim() });
    }
    const { error: e } = await supabase.rpc('set_member_plates', {
      p_company: active.company_id,
      p_user: m.user_id,
      p_plates: parts.map((x) => normalizePlate(x) as string),
    });
    setPlateBusy(false);
    if (e) return setPlateError(errorText(e));
    setEditing(null);
    load();
    if (m.user_id === userId) reloadMemberships();
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <SectionTitle title="Kişi ekle" />
      <View style={[styles.box, { backgroundColor: c.paper }]}>
        <Text style={[type.small, { color: c.muted }]}>
          Kişiyi siz açarsınız. Ekledikten sonra çıkan giriş bağlantısını WhatsApp'tan gönderin; kişi tıklayıp şifresini belirler.
        </Text>
        <Field label="Ad soyad" value={fullName} onChangeText={setFullName} placeholder="Örnek: Ali Çelik" />
        <Field label="Ünvan" value={title} onChangeText={setTitle} placeholder="Örnek: Satış Temsilcisi" />
        <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" hint="Kişi bu e-postayla giriş yapar. Test müşterisinde boş bırakabilirsiniz." />
        <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Rolleri</Text>
        <View style={styles.chips}>
          {CHOICES.map((r) => {
            const on = roles.includes(r);
            return (
              <Pressable
                key={r}
                onPress={() => setRoles(on ? roles.filter((x) => x !== r) : [...roles, r])}
                style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
                <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{ROLE_LABEL[r]}</Text>
              </Pressable>
            );
          })}
        </View>
        {members.length > 0 && (
          <>
            <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Masraflarını kim onaylayacak?</Text>
            <View style={styles.chips}>
              {members.map((p) => {
                const on = (manager ?? userId) === p.user_id;
                return (
                  <Pressable key={p.user_id} onPress={() => setManager(p.user_id)} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
                    <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{p.user_id === userId ? `${p.full_name} (siz)` : p.full_name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        {error && <Notice tone="bad" text={error} />}
        {info && <Notice tone="ok" text={info} />}
        <Button icon="personAdd" title="Kişiyi ekle" onPress={add} loading={busy} disabled={roles.length === 0} />
      </View>
      {invite && <InviteLink link={invite.link} name={invite.name} onClose={() => setInvite(null)} />}

      <SectionTitle title={`Ekip (${members.length})`} />
      <Text style={[type.small, { color: c.muted, marginTop: -space.sm }]}>Rolünü, yöneticisini ya da araç plakasını değiştirmek için kişiye dokunun.</Text>
      <Group>
        {members.map((m) => (
          <View key={m.user_id}>
            <Row
              icon="team"
              title={`${m.full_name}${m.user_id === userId ? ' (siz)' : ''}`}
              subtitle={
                (m.title ? `${m.title}. ` : '') +
                m.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ') +
                (m.manager_user_id ? `. Yöneticisi: ${nameOf(m.manager_user_id) ?? '—'}` : '') +
                ((m.vehicle_plates ?? []).length ? `. Araç: ${m.vehicle_plates.map(formatPlate).join(', ')}` : '. Araç yok')
              }
              onPress={() => startEdit(m)}
              chevron={false}
            />
            {editing === m.user_id && (
              <View style={[styles.edit, { borderTopColor: c.paperLine }]}>
                <Field label="Ad soyad" value={editName} onChangeText={setEditName} />
                <Field label="Ünvan" value={editTitle} onChangeText={setEditTitle} placeholder="Örnek: Satış Direktörü" />
                <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Rolleri</Text>
                <View style={styles.chips}>
                  {CHOICES.map((r) => {
                    const on = editRoles.includes(r);
                    return (
                      <Pressable
                        key={r}
                        onPress={() => setEditRoles(on ? editRoles.filter((x) => x !== r) : [...editRoles, r])}
                        style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
                        <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{ROLE_LABEL[r]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Bağlı olduğu yönetici (masraflarını onaylar)</Text>
                <View style={styles.chips}>
                  {[{ user_id: null as string | null, full_name: 'Yok' }, ...members.filter((x) => x.user_id !== m.user_id)].map((p) => {
                    const on = editManager === p.user_id;
                    return (
                      <Pressable key={p.user_id ?? 'none'} onPress={() => setEditManager(p.user_id)} style={[styles.chip, { backgroundColor: on ? c.pen : c.canvas }]}>
                        <Text style={{ color: on ? c.onPen : c.ink, fontWeight: on ? '600' : '400' }}>{p.full_name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Field
                  label="Araç plakaları"
                  value={plateDraft}
                  onChangeText={setPlateDraft}
                  autoCapitalize="characters"
                  placeholder="35 ABC 123, 06 XYZ 45"
                  hint="Birden çok aracı virgülle ayırın. Akaryakıt fişindeki plaka bunlarla karşılaştırılır."
                />
                {plateError && <Notice tone="bad" text={plateError} />}
                {m.user_id !== userId && (
                  <Button variant="plain" title="Giriş bağlantısı oluştur" onPress={() => makeLink(m)} loading={linkBusy === m.user_id} />
                )}
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button variant="secondary" title="Vazgeç" onPress={() => setEditing(null)} style={{ flex: 1, backgroundColor: c.canvas }} />
                  <Button title="Kaydet" onPress={() => savePlates(m)} loading={plateBusy} style={{ flex: 1 }} />
                </View>
              </View>
            )}
          </View>
        ))}
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  edit: { padding: space.lg, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
