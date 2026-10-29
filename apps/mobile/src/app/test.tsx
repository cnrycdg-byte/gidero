import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Notice, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { backHome, fetchDemoPeople, homeEmail, resetDemoData, switchTo, useDemo, type DemoAccount } from '@/lib/demo';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';

type Step = { who: string; text: string };

const SCENARIO_BURO: Step[] = [
  { who: 'Siz', text: 'Yukarıdaki "Test müşterisi aç" ile Muhasebe bürosu açın. Hesap sahibi için uydurma bir e-posta yazın (ör. ayse@test.gidero.app) ve adını yazın.' },
  { who: 'Büro sahibi', text: 'Listede büronun altında çıkan kişiyle girin. "Müşteri firma ekle" ile 2 firma ekleyin (paket hakkı kadar).' },
  { who: 'Büro sahibi', text: 'Bir firmaya dokunup geçin. "Fiş yükle" ile bilgisayardan fiş fotoğrafı, PDF ya da WhatsApp ZIP\'i bırakın; kişi sormaz, firmaya girer.' },
  { who: 'Büro sahibi', text: 'Okunan tutarları kontrol edin, "Kayda al" deyin. Onay yoktur, doğrudan kayda geçer.' },
  { who: 'Büro sahibi', text: '"Döküm ve aktarım"dan Excel ya da Luca dosyasını alın, "Aktarıldı" deyin.' },
  { who: 'Büro sahibi', text: '"Firma değiştir" ile diğer firmaya geçin, aynı işi orada yapın. Firmaların fişleri birbirine karışmamalı.' },
];

const SCENARIO_SIRKET: Step[] = [
  { who: 'Siz', text: '"Test müşterisi aç" ile Şirket açın. Yöneticinin adını ve uydurma e-postasını yazın (ör. mehmet@test.gidero.app).' },
  { who: 'Şirket yöneticisi', text: 'Ekip ekranında kişileri ad soyad ve ünvanla ekleyin: Satış Direktörü, GMY, iki Satış Temsilcisi, Muhasebe Uzmanı (muhasebeci rolü). Test müşterisinde e-posta boş kalabilir.' },
  { who: 'Şirket yöneticisi', text: 'Onay zinciri ekranında kişileri sürükleyip yöneticisinin altına bırakın: temsilciler → Satış Direktörü → GMY → Genel Müdür. GMY\'yi "son onay" yapın.' },
  { who: 'Satış temsilcisi', text: 'Fiş ekleyip raporu gönderin. Rapor ekranında kime gittiğini görün.' },
  { who: 'Satış Direktörü', text: 'Raporu onaylayın (bir kez de gerekçe yazıp iade edip deneyin). Kendi masrafınızı da gönderin: GMY\'ye gitmeli.' },
  { who: 'GMY', text: 'Son onayı verin. Form muhasebeye düşer, Genel Müdür\'e çıkmaz.' },
  { who: 'Muhasebe', text: 'Muhasebe masasında formu kontrol edin, Excel\'i alın, "Aktarıldı", sonra "Ödendi" deyin. Form arşive geçer, çalışana "ödendi" bildirimi gider.' },
];

// Test sürüşü: test müşterilerindeki herkese şifresiz geçiş ve adım adım senaryolar
export default function TestDrive() {
  const c = useColors();
  const { userId, platformAdmin, session } = useSession();
  const demo = useDemo(userId);
  const [accounts, setAccounts] = useState<DemoAccount[] | null>(null);
  const [home, setHome] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setHome(await homeEmail());
    try {
      setAccounts(await fetchDemoPeople());
    } catch (e) {
      setAccounts([]);
      setError(errorText(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function run(key: string, f: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setInfo(null);
    try {
      await f();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const isAdminHere = platformAdmin && !demo.me;

  return (
    <Page wide>
      <View style={[styles.hero, { backgroundColor: c.deep }]}>
        <Text style={[type.small, { color: c.onDeepMuted, fontWeight: '600' }]}>ŞU AN</Text>
        <Text style={[type.title, { color: c.onDeep }]}>
          {demo.me ? `${demo.me.full_name}, ${demo.me.label}` : `Gidero yöneticisi (${session?.user.email ?? ''})`}
        </Text>
        <Text style={[type.small, { color: c.onDeepMuted }]}>
          Test müşterisi olarak açtığınız hesaplardaki herkes aşağıda listelenir. Birine dokunun, şifre sormadan onun ekranına geçin. Her ekranın altındaki turuncu şeritten buraya dönersiniz.
        </Text>
        <View style={styles.row}>
          {isAdminHere && (
            <Button variant="light" icon="plus" title="Test müşterisi aç" onPress={() => router.push({ pathname: '/admin/new-customer', params: { test: '1' } })} />
          )}
          {demo.me && (
            <Button
              variant="light"
              title={home ? `Kendi hesabıma dön (${home})` : 'Kendi hesabıma dön'}
              loading={busy === 'home'}
              onPress={() =>
                run('home', async () => {
                  const ok = await backHome();
                  if (!ok) setInfo('Kayıtlı oturumunuz bulunamadı; e-posta ve şifrenizle yeniden giriş yapın.');
                })
              }
            />
          )}
        </View>
      </View>

      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}

      <SectionTitle title="Test müşterileri ve kişileri" />
      {accounts && accounts.length === 0 && (
        <Notice text='Henüz test müşterisi yok. "Test müşterisi aç" ile bir muhasebe bürosu ya da şirket açın; içine eklediğiniz herkes burada görünür.' />
      )}
      {(accounts ?? []).map((a) => (
        <View key={a.account_id} style={[styles.account, { backgroundColor: c.paper }]}>
          <Text style={[type.small, { color: c.pen, fontWeight: '700' }]}>{a.kind === 'bureau' ? 'MUHASEBE BÜROSU' : 'TEKİL ŞİRKET'}</Text>
          <Text style={[type.bodyStrong, { color: c.ink, fontSize: 18 }]}>{a.name}</Text>
          {a.people.length === 0 && (
            <Text style={[type.small, { color: c.muted }]}>Hesap sahibi henüz açılmadı. Yönetim panelinde müşteriye girip "Giriş bağlantısı" oluşturun.</Text>
          )}
          <View style={styles.grid}>
            {a.people.map((p) => {
              const on = p.user_id === userId;
              return (
                <View key={p.user_id} style={[styles.person, { backgroundColor: on ? c.penSoft : c.canvas, borderColor: on ? c.pen : 'transparent' }]}>
                  <Text style={[type.bodyStrong, { color: c.ink }]} numberOfLines={1}>{p.full_name}</Text>
                  <Text style={[type.small, { color: c.pen, fontWeight: '600' }]} numberOfLines={1}>{p.label}</Text>
                  <Text selectable style={[type.small, { color: c.muted }]} numberOfLines={1}>{p.email}</Text>
                  <Button
                    title={on ? 'Şu an bu kişisiniz' : 'Bu kişiyle gir'}
                    variant={on ? 'secondary' : 'primary'}
                    disabled={on}
                    loading={busy === p.user_id}
                    onPress={() => run(p.user_id, () => switchTo(p.user_id))}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ))}

      <SectionTitle title="Muhasebe bürosu senaryosu" />
      <Scenario id="buro2" steps={SCENARIO_BURO} />
      <SectionTitle title="Tekil şirket senaryosu" />
      <Scenario id="sirket2" steps={SCENARIO_SIRKET} />

      <SectionTitle title="Temizlik" />
      <Text style={[type.small, { color: c.muted }]}>
        Test müşterileri, içlerindeki kişiler, raporlar ve fişler silinir. Gerçek müşterilere ve sizin hesabınıza dokunulmaz.
      </Text>
      <Button
        variant="danger"
        title="Test verilerini sıfırla"
        loading={busy === 'reset'}
        onPress={() =>
          confirm('Test verileri silinsin mi?', 'Tüm test müşterileri ve içindeki kişiler silinir.', 'Sıfırla', () =>
            run('reset', async () => {
              const r = await resetDemoData();
              setInfo(`${r.accounts} test müşterisi, ${r.companies} firma ve ${r.users} kişi silindi.`);
              await backHome();
            }),
          )
        }
      />
    </Page>
  );
}

function Scenario({ id, steps }: { id: string; steps: Step[] }) {
  const c = useColors();
  const [done, setDoneState] = useState<number[]>([]);
  const key = `gidero.test.done.${id}`;
  // Kişi değişince ekran yeniden açılır; işaretler cihazda saklanır
  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((v) => v && setDoneState(JSON.parse(v) as number[]))
      .catch(() => {});
  }, [key]);
  const setDone = (v: number[]) => {
    setDoneState(v);
    AsyncStorage.setItem(key, JSON.stringify(v)).catch(() => {});
  };
  return (
    <View style={[styles.steps, { backgroundColor: c.paper }]}>
      {steps.map((s, i) => {
        const on = done.includes(i);
        return (
          <Pressable key={i} onPress={() => setDone(on ? done.filter((d) => d !== i) : [...done, i])} style={styles.step}>
            <View style={[styles.num, { backgroundColor: on ? c.pen : c.canvas }]}>
              <Text style={{ color: on ? c.onPen : c.ink, fontWeight: '700', fontSize: 13 }}>{on ? '✓' : i + 1}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.small, { color: c.pen, fontWeight: '700' }]}>{s.who}</Text>
              <Text style={[type.body, { color: on ? c.muted : c.ink, textDecorationLine: on ? 'line-through' : 'none' }]}>{s.text}</Text>
            </View>
          </Pressable>
        );
      })}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.small, { color: c.muted, flex: 1 }]}>Bitirdiğiniz adıma dokunup işaretleyin.</Text>
        {done.length > 0 && <Button variant="plain" title="İşaretleri temizle" onPress={() => setDone([])} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: space.xl, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  account: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  person: { flexGrow: 1, flexBasis: 220, borderRadius: radius.lg, padding: space.md, gap: 3, borderWidth: 2 },
  steps: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
