import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Field, Label, Notice, Pill } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

type Member = { user_id: string; roles: string[]; manager_user_id: string | null; full_name: string };

const ROLE_LABEL: Record<string, string> = {
  employee: 'Çalışan',
  approver: 'Onaylayıcı',
  accountant: 'Muhasebeci',
  admin: 'Yönetici',
  auditor: 'Denetçi',
  cost_center_owner: 'Masraf merkezi sorumlusu',
};
const CHOICES = ['employee', 'approver', 'accountant', 'admin'];

export default function Team() {
  const c = useColors();
  const { active, userId } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>(['employee']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) return;
    const { data } = await supabase
      .from('memberships')
      .select('user_id, roles, manager_user_id')
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
    if (!email.includes('@')) return setError('Kişinin e-postasını yazın.');
    setBusy(true);
    const { error: e } = await supabase.rpc('add_member', {
      p_company: active.company_id,
      p_email: email.trim(),
      p_roles: roles,
    });
    setBusy(false);
    if (e) return setError(errorText(e));
    setInfo('Kişi eklendi. Masraflarını siz onaylayacaksınız.');
    setEmail('');
    setRoles(['employee']);
    load();
  }

  const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.full_name;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <Card>
        <Label>Kişi ekle</Label>
        <Body muted>Kişi önce Gidero'yu indirip kendi e-postasıyla kaydolmalı. Sonra e-postasını buraya yazın.</Body>
        <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Label>Rolleri</Label>
        <View style={styles.chips}>
          {CHOICES.map((r) => {
            const on = roles.includes(r);
            return (
              <Pressable
                key={r}
                onPress={() => setRoles(on ? roles.filter((x) => x !== r) : [...roles, r])}
                style={[styles.chip, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.card }]}>
                <Text style={{ color: on ? c.primary : c.text }}>{ROLE_LABEL[r]}</Text>
              </Pressable>
            );
          })}
        </View>
        {error && <Notice tone="bad" text={error} />}
        {info && <Notice text={info} />}
        <Button title="Ekle" onPress={add} loading={busy} disabled={roles.length === 0} />
      </Card>

      <Label>Ekip ({members.length})</Label>
      {members.map((m) => (
        <Card key={m.user_id}>
          <Text style={[type.body, { color: c.text, fontWeight: '600' }]}>
            {m.full_name}
            {m.user_id === userId ? ' (siz)' : ''}
          </Text>
          <View style={styles.chips}>
            {m.roles.map((r) => (
              <Pill key={r} text={ROLE_LABEL[r] ?? r} />
            ))}
          </View>
          {m.manager_user_id ? (
            <Text style={[type.small, { color: c.muted }]}>Yöneticisi: {nameOf(m.manager_user_id) ?? '—'}</Text>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
});
