import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Field, Notice } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { formatPlate, normalizePlate } from '@/lib/plate';
import { errorText, supabase } from '@/lib/supabase';
import { ROLE_LABEL } from '@/lib/types';

export type EditablePerson = {
  user_id: string;
  full_name: string;
  title: string | null;
  roles: string[];
  manager_user_id: string | null;
  final_approver: boolean;
  vehicle_plates?: string[];
};

const ROLES: { key: string; hint: string }[] = [
  { key: 'employee', hint: 'Masraf girer' },
  { key: 'approver', hint: 'Bağlı kişilerin raporunu onaylar' },
  { key: 'accountant', hint: 'Muhasebe masasını kullanır' },
  { key: 'admin', hint: 'Ekibi ve ayarları yönetir' },
];

/** Kişi kartı: ad, ünvan, roller (çalışandan onaylayıcıya), kime bağlı, son onay, araç; tek "Kaydet" */
export function PersonEditor({
  person,
  people,
  companyId,
  me,
  onClose,
  onSaved,
}: {
  person: EditablePerson;
  people: EditablePerson[];
  companyId: string;
  me: string | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const c = useColors();
  const [name, setName] = useState(person.full_name);
  const [title, setTitle] = useState(person.title ?? '');
  const [roles, setRoles] = useState<string[]>(person.roles);
  const [manager, setManager] = useState<string | null>(person.manager_user_id);
  const [finalApprover, setFinal] = useState(person.final_approver);
  const [plates, setPlates] = useState((person.vehicle_plates ?? []).map(formatPlate).join(', '));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(person.full_name);
    setTitle(person.title ?? '');
    setRoles(person.roles);
    setManager(person.manager_user_id);
    setFinal(person.final_approver);
    setPlates((person.vehicle_plates ?? []).map(formatPlate).join(', '));
    setError(null);
  }, [person]);

  // Kişinin kendi altındakiler yöneticisi olamaz (zincir döngüye girer)
  const below = useMemo(() => {
    const out = new Set<string>();
    const walk = (id: string) =>
      people.filter((p) => p.manager_user_id === id).forEach((p) => {
        if (!out.has(p.user_id)) {
          out.add(p.user_id);
          walk(p.user_id);
        }
      });
    walk(person.user_id);
    return out;
  }, [people, person.user_id]);

  const candidates = people
    .filter((p) => p.user_id !== person.user_id && !below.has(p.user_id))
    .filter((p) => {
      const t = q.trim().toLocaleLowerCase('tr-TR');
      return !t || p.user_id === manager || `${p.full_name} ${p.title ?? ''}`.toLocaleLowerCase('tr-TR').includes(t);
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'));

  async function save() {
    setError(null);
    if (name.trim().length < 2) return setError('Ad soyad yazın.');
    if (!roles.length) return setError('Kişiye en az bir rol verin.');
    const parts = plates.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean);
    const bad = parts.filter((x) => !normalizePlate(x));
    if (bad.length) return setError(`Şu plaka geçersiz: ${bad.join(', ')}. Örnek: 35 ABC 123`);
    setBusy(true);
    try {
      const steps = [
        supabase.rpc('set_member', { p_company: companyId, p_user: person.user_id, p_roles: roles, p_manager: manager }),
        supabase.rpc('set_member_details', { p_company: companyId, p_user: person.user_id, p_title: title, p_final_approver: finalApprover }),
        supabase.rpc('set_member_plates', { p_company: companyId, p_user: person.user_id, p_plates: parts.map((x) => normalizePlate(x) as string) }),
      ];
      for (const s of steps) {
        const { error: e } = await s;
        if (e) throw e;
      }
      if (name.trim() !== person.full_name) {
        const { error: e } = await supabase.rpc('set_member_name', { p_company: companyId, p_user: person.user_id, p_full_name: name.trim() });
        if (e) throw e;
      }
      onSaved(`${name.trim()} kaydedildi.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    confirm(`${person.full_name} ekipten çıkarılsın mı?`, 'Artık giriş yapıp masraf giremez. Eski kayıtları silinmez; ona bağlı kişiler onun yöneticisine bağlanır.', 'Çıkar', async () => {
      const { error: e } = await supabase.rpc('remove_member', { p_company: companyId, p_user: person.user_id });
      if (e) return setError(errorText(e));
      onSaved(`${person.full_name} ekipten çıkarıldı.`);
    });
  }

  const chip = (on: boolean) => [styles.chip, { backgroundColor: on ? c.pen : c.canvas }];
  const chipText = (on: boolean) => ({ color: on ? c.onPen : c.ink, fontSize: 13, fontWeight: (on ? '600' : '400') as '600' | '400' });

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: c.paper }]} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.md }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[type.title, { color: c.ink, flex: 1, fontSize: 20 }]}>Kişi kartı</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
                <Text style={{ color: c.muted, fontSize: 22 }}>×</Text>
              </Pressable>
            </View>
            <Field label="Ad soyad" value={name} onChangeText={setName} />
            <Field label="Ünvan" value={title} onChangeText={setTitle} placeholder="Örnek: Satış Müdürü" />

            <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Rolleri</Text>
            <View style={styles.chips}>
              {ROLES.map((r) => {
                const on = roles.includes(r.key);
                return (
                  <Pressable key={r.key} onPress={() => setRoles(on ? roles.filter((x) => x !== r.key) : [...roles, r.key])} style={chip(on)}>
                    <Text style={chipText(on)}>{ROLE_LABEL[r.key]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[type.small, { color: c.muted }]}>
              {ROLES.filter((r) => roles.includes(r.key)).map((r) => `${ROLE_LABEL[r.key]}: ${r.hint.toLocaleLowerCase('tr-TR')}`).join('. ') || 'Rol seçin.'}
            </Text>

            <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>Kime bağlı? (raporlarını ilk o onaylar)</Text>
            {people.length > 12 && <Field label="Kişi ara" value={q} onChangeText={setQ} placeholder="Ad ya da ünvan" />}
            <View style={styles.chips}>
              <Pressable onPress={() => setManager(null)} style={chip(manager === null)}>
                <Text style={chipText(manager === null)}>Kimseye (en üst)</Text>
              </Pressable>
              {candidates.map((p) => (
                <Pressable key={p.user_id} onPress={() => setManager(p.user_id)} style={chip(manager === p.user_id)}>
                  <Text style={chipText(manager === p.user_id)}>{`${p.full_name}${p.title ? `, ${p.title}` : ''}`}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: c.ink }]}>Son onay bu kişide</Text>
                <Text style={[type.small, { color: c.muted }]}>Altındakilerin raporu bu kişi onaylayınca muhasebeye düşer.</Text>
              </View>
              <Switch value={finalApprover} onValueChange={setFinal} />
            </View>

            <Field label="Araç plakaları" value={plates} onChangeText={setPlates} autoCapitalize="characters" placeholder="35 ABC 123, 06 XYZ 45" />

            {error && <Notice tone="bad" text={error} />}
            <View style={styles.actions}>
              <Button title="Kaydet" onPress={save} loading={busy} />
              <Button variant="secondary" title="Vazgeç" onPress={onClose} />
              <View style={{ flex: 1 }} />
              {person.user_id !== me && <Button variant="danger" title="Ekipten çıkar" onPress={remove} />}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,20,17,0.45)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 560, maxHeight: '92%', borderRadius: radius.lg, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
});
