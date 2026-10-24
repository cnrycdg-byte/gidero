import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Body, Button, Card, Label } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const ROLE_LABEL: Record<string, string> = {
  employee: 'Çalışan',
  approver: 'Onaylayıcı',
  accountant: 'Muhasebeci',
  admin: 'Yönetici',
  auditor: 'Denetçi',
  cost_center_owner: 'Masraf merkezi sorumlusu',
};

export default function Settings() {
  const c = useColors();
  const { session, memberships, active, setActiveCompany } = useSession();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <Card>
        <Label>Hesap</Label>
        <Body>{session?.user.email}</Body>
        {active && <Body muted>{active.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}</Body>}
      </Card>

      {memberships.length > 1 && (
        <Card>
          <Label>Şirket</Label>
          {memberships.map((m) => {
            const on = m.company_id === active?.company_id;
            return (
              <Pressable
                key={m.company_id}
                onPress={() => {
                  setActiveCompany(m.company_id);
                  router.back();
                }}>
                <View style={{ paddingVertical: space.sm }}>
                  <Text style={[type.body, { color: on ? c.primary : c.text, fontWeight: on ? '600' : '400' }]}>
                    {on ? '✓ ' : ''}
                    {m.companies.legal_name}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}

      <Button variant="secondary" title="Onayımı bekleyenler" onPress={() => router.push('/approvals')} />
      <Button variant="danger" title="Çıkış yap" onPress={() => supabase.auth.signOut()} />

      <Text style={[type.small, { color: c.muted, textAlign: 'center' }]}>
        Gidero {Constants.expoConfig?.version ?? ''}
        {Updates.updateId ? ` · ${Updates.updateId.slice(0, 8)}` : ''}
      </Text>
    </ScrollView>
  );
}
