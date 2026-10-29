import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { ScrollView } from 'react-native';

import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { CompanyLogo } from '@/components/company-logo';
import { Group, Row, SectionTitle } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { formatPlate } from '@/lib/plate';
import { ROLE_LABEL } from '@/lib/types';

export default function Settings() {
  const c = useColors();
  const { session, memberships, active, setActiveCompany, hasRole, bureaus, platformAdmin } = useSession();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <Group>
        <Row
          title={session?.user.user_metadata?.full_name || session?.user.email || ''}
          subtitle={active ? active.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ') : session?.user.email}
          icon="team"
        />
      </Group>

      <SectionTitle title="Araçlarım" />
      <Group>
        <Row
          icon="receipt"
          title={(active?.vehicle_plates ?? []).length ? active!.vehicle_plates.map(formatPlate).join(', ') : 'Kayıtlı araç yok'}
          subtitle="Akaryakıt fişindeki plaka bu araçlarla karşılaştırılır. Değişiklik için yöneticinize başvurun."
        />
      </Group>

      <SectionTitle title={memberships.length > 1 ? 'Şirketler' : 'Şirket'} />
      <Group>
        {memberships.map((m) => {
          const on = m.company_id === active?.company_id;
          return (
            <Row
              key={m.company_id}
              title={m.companies.legal_name}
              subtitle={`Vergi no ${m.companies.tax_number}`}
              left={m.companies.logo_path ? <CompanyLogo path={m.companies.logo_path} /> : undefined}
              right={on ? <Icon name="check" size={16} color={c.pen} /> : undefined}
              chevron={false}
              onPress={
                on
                  ? undefined
                  : () => {
                      setActiveCompany(m.company_id);
                      router.back();
                    }
              }
            />
          );
        })}
      </Group>

      {platformAdmin && (
        <Group>
          <Row
            icon="settings"
            iconColor={c.onPen}
            iconBg={c.pen}
            title="Gidero Yönetim Paneli"
            subtitle="Müşteriler, siparişler, paketler, kampanyalar"
            onPress={() => router.push('/admin')}
          />
        </Group>
      )}

      <Group>
        {bureaus.length > 0 ? <Row icon="doc" title="Müşteri firmalar" onPress={() => router.push('/clients')} /> : null}
        {hasRole('admin') || bureaus.some((b) => b.role === 'owner') ? (
          <Row icon="receipt" title="Abonelik ve ödeme" subtitle="Paket, süre, kampanya kodu" onPress={() => router.push('/subscription')} />
        ) : null}
      </Group>

      <Group>
        <Row icon="inbox" title="Onayınızı bekleyenler" onPress={() => router.push('/approvals')} />
        {hasRole('payer') ? <Row icon="receipt" title="Ödemeler" subtitle="Muhasebenin aktardığı ödemeler" onPress={() => router.push('/payments')} /> : null}
        {hasRole('admin') ? <Row icon="team" title="Ekip" onPress={() => router.push('/team')} /> : null}
        {hasRole('admin') ? (
          <Row icon="settings" title="Logo ve renkler" subtitle="Şirketinizin logosu ve kurumsal renkleri" onPress={() => router.push('/brand')} />
        ) : null}
        {hasRole('admin') || hasRole('accountant') ? (
          <Row icon="receipt" title="Gider grupları ve sınırlar" onPress={() => router.push('/categories')} />
        ) : null}
        {hasRole('admin') || hasRole('accountant') || hasRole('approver') ? (
          <Row icon="warning" title="Ekibin sınır durumu" onPress={() => router.push('/limits')} />
        ) : null}
      </Group>

      <Group>
        <Row
          icon="logout"
          iconColor={c.red}
          iconBg={c.redSoft}
          title="Çıkış yap"
          chevron={false}
          onPress={() => supabase.auth.signOut()}
        />
      </Group>

      <Text style={[type.small, { color: c.faint, textAlign: 'center' }]}>
        Gidero {Constants.expoConfig?.version ?? ''}
        {Updates.updateId ? ` (${Updates.updateId.slice(0, 8)})` : ''}
      </Text>
    </ScrollView>
  );
}
