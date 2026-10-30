// Telefonda alt sekme çubuğu (HIG Tab bars). Sekmeler uygulamanın üst düzey bölümleridir, eylem değildir.
// - SF Symbols, dolu varyant: "Prefer filled symbols or icons for consistency with the platform."
// - Tek kelimelik etiketler: "Include tab labels ... Use single words whenever possible."
// - Rozet yalnızca sizi bekleyen iş için: "Reserve badges for critical information."
// - Sekmeler oturum boyunca sabittir; kişinin rolü olmayan bölüm baştan gösterilmez
//   (expo-router: sekmeler çalışırken eklenip çıkarılmaz). Boş bölüm gizlenmez, nedenini anlatır
//   ("Don't disable or hide tab bar buttons, even when their content is unavailable").
// - iOS 26'da çubuk Liquid Glass ile içeriğin üstünde yüzer (Tab bars > iOS; Materials > Liquid Glass).
// - Geniş ekranda (iPad, büyük pencere) sekme çubuğu yerine soldaki menü kullanılır
//   (Layout > Size classes: "switch from a Tab bars to a Sidebars").
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useWide } from '@/lib/layout';
import { useNavCounts } from '@/lib/nav-counts';
import { useSession } from '@/lib/session';
import { useColors } from '@/constants/theme';

const badge = (n: number) => (n > 99 ? '99+' : String(n));

export default function TabLayout() {
  const c = useColors();
  const wide = useWide();
  const n = useNavCounts();
  const { active, platformAdmin } = useSession();
  const roles = active?.roles ?? [];
  const company = !!active && (active.phase !== 'locked' || platformAdmin);
  const bureauFirm = !!active?.bureau_account_id && !roles.includes('employee');
  const has = (r: string) => company && !bureauFirm && roles.includes(r);
  // Seçili sekme uygulamanın accent rengiyle gösterilir (Branding > "an icon for the selected tab in a tab bar")
  const tint = c.pen;

  return (
    <NativeTabs tintColor={tint} hidden={wide} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} md="receipt_long" />
        <NativeTabs.Trigger.Label>{bureauFirm ? 'Firma' : 'Raporlar'}</NativeTabs.Trigger.Label>
        {n.returned > 0 ? <NativeTabs.Trigger.Badge>{badge(n.returned)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="approvals" hidden={!(has('approver') || has('admin'))}>
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.circle', selected: 'checkmark.circle.fill' }} md="task_alt" />
        <NativeTabs.Trigger.Label>Onay</NativeTabs.Trigger.Label>
        {n.approvals > 0 ? <NativeTabs.Trigger.Badge>{badge(n.approvals)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="accounting" hidden={!has('accountant')}>
        <NativeTabs.Trigger.Icon sf={{ default: 'tray.full', selected: 'tray.full.fill' }} md="inbox" />
        <NativeTabs.Trigger.Label>Muhasebe</NativeTabs.Trigger.Label>
        {n.accounting > 0 ? <NativeTabs.Trigger.Badge>{badge(n.accounting)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="payments" hidden={!has('payer')}>
        <NativeTabs.Trigger.Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} md="credit_card" />
        <NativeTabs.Trigger.Label>Ödeme</NativeTabs.Trigger.Label>
        {n.payments > 0 ? <NativeTabs.Trigger.Badge>{badge(n.payments)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
        <NativeTabs.Trigger.Label>Hesabım</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
