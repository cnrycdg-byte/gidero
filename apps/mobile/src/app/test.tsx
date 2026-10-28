import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Notice, SectionTitle } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { backHome, fetchPersonas, homeEmail, PERSONAS, preparePersonas, resetDemoData, switchTo, useDemo } from '@/lib/demo';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';

type Step = { who: string; text: string };

const SCENARIO_BURO: Step[] = [
  { who: 'Siz', text: 'Yönetim > Yeni müşteri ekle: "Muhasebe bürosu", unvan Demo Mali Müşavirlik, 10 haneli bir vergi no, hesap sahibi e-postası olarak Ayşe\'nin e-postası. Ücretsiz deneme seçip açın.' },
  { who: 'Ayşe', text: 'Müşteri firmalar > Müşteri firma ekle: Örnek Gıda Ltd. ve 10 haneli bir vergi no.' },
  { who: 'Ayşe', text: 'Aynı ekranda Büro ekibi > Can\'ın e-postasını ekleyin, Örnek Gıda\'ya atayın.' },
  { who: 'Ayşe', text: 'Örnek Gıda\'ya dokunup firmaya geçin. Ekibi yönet > Burak\'ı "Çalışan" olarak ekleyin.' },
  { who: 'Ayşe', text: 'İsterseniz Onay şeması ekranında adımları silin: o zaman Burak\'ın raporu onaysız, doğrudan muhasebeye düşer. Adım bırakırsanız firmada yönetici olmadığı için onayı siz verirsiniz.' },
  { who: 'Burak', text: 'Yeni rapor: "Ekim masrafları". Fiş çekin ya da galeriden seçin, tutarı kontrol edin, raporu gönderin.' },
  { who: 'Ayşe', text: 'Bildirimlerde ve "Onayınızı bekleyenler"de raporu görün, onaylayın.' },
  { who: 'Can', text: 'Örnek Gıda\'yı seçin. Muhasebe aktarımı > Excel dökümünü indirin, "Aktarıldı olarak işaretle".' },
];

const SCENARIO_SIRKET: Step[] = [
  { who: 'Siz', text: 'Yönetim > Yeni müşteri ekle: "Şirket", unvan Demo Lojistik AŞ, 10 haneli bir vergi no, hesap sahibi olarak Mehmet\'in e-postası.' },
  { who: 'Mehmet', text: 'Ekibi yönet: Emre\'yi "Çalışan + Onaylayıcı", Zeynep\'i "Muhasebeci" olarak ekleyin. Ali ve Elif\'i "Çalışan" olarak ekleyip "Masraflarını kim onaylayacak?" kısmında Emre\'yi seçin.' },
  { who: 'Mehmet', text: 'Onay şeması: 1. adım "Çalışanın yöneticisi", 2. adım "Şirket yöneticisi" ve tutar sınırı 5.000 TL. Kaydedin.' },
  { who: 'Ali', text: '5.000 TL altında bir rapor açın, iki fiş ekleyip gönderin. Kime gittiğini rapor ekranında görün.' },
  { who: 'Emre', text: 'Ali\'nin raporunu açın, bir fiş için gerekçe yazıp iade edin.' },
  { who: 'Ali', text: 'İade edilen raporu düzeltip yeniden gönderin; Emre bu kez onaylasın.' },
  { who: 'Elif', text: '5.000 TL üstü bir rapor gönderin. Emre onaylayınca rapor Mehmet\'e gider; Mehmet onaylasın.' },
  { who: 'Zeynep', text: 'Muhasebe aktarımı: onaylanan raporları Excel ya da Luca dosyası olarak alın. Kendi masrafınızı da girin; o da onaydan geçer, kendinizi onaylayamazsınız.' },
];

// Test sürüşü: deneme kişileri arasında şifresiz geçiş ve adım adım senaryolar
export default function TestDrive() {
  const c = useColors();
  const { userId, platformAdmin, session, memberships, bureaus } = useSession();
  const demo = useDemo(userId);
  const [rows, setRows] = useState<{ persona: string; email: string }[]>([]);
  const [home, setHome] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setHome(await homeEmail());
    try {
      setRows(await fetchPersonas());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const canUse = platformAdmin || !!demo.persona;
  const ready = rows.length >= PERSONAS.length;
  const emailOf = (key: string) => rows.find((r) => r.persona === key)?.email ?? '';

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

  if (!canUse) {
    return (
      <Page>
        <Notice text="Test sürüşü yalnızca Gidero yöneticisine açıktır." />
      </Page>
    );
  }

  const me = PERSONAS.find((p) => p.key === demo.persona);

  return (
    <Page wide>
      <View style={[styles.hero, { backgroundColor: c.deep }]}>
        <Text style={[type.small, { color: c.onDeepMuted, fontWeight: '600' }]}>ŞU AN</Text>
        <Text style={[type.title, { color: c.onDeep }]}>{me ? `${me.name}, ${me.role}` : `Gidero yöneticisi (${session?.user.email ?? ''})`}</Text>
        <Text style={[type.small, { color: c.onDeepMuted }]}>
          Aşağıdan bir kişiye dokunun; şifre sormadan o kişi olarak girersiniz. Her ekranın altındaki şeritten buraya dönebilirsiniz.
        </Text>
        {demo.persona && (
          <Button
            variant="light"
            title={home ? `Kendi hesabıma dön (${home})` : 'Kendi hesabıma dön'}
            loading={busy === 'home'}
            onPress={() => run('home', async () => {
              const ok = await backHome();
              if (!ok) setInfo('Kayıtlı oturumunuz bulunamadı; e-posta ve şifrenizle yeniden giriş yapın.');
            })}
          />
        )}
      </View>

      {demo.persona && memberships.length === 0 && bureaus.length === 0 && (
        <Notice
          tone="warn"
          text={`${me?.name ?? 'Bu kişi'} henüz hiçbir şirkete ya da büroya bağlı değil, bu yüzden ekranında yalnızca "Hoş geldiniz" kurulumu var. Önce kendi hesabınıza dönüp senaryonun 1. adımını yapın (müşteriyi açarken bu kişinin e-postasını yazın), sonra bu kişiye geçin.`}
        />
      )}
      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}

      {!ready && (
        <View style={{ gap: space.sm }}>
          <Notice text="Önce deneme kişilerini hazırlayın. 8 kişi açılır; e-posta adresleri sahtedir, kimseye e-posta gitmez." />
          <Button title="Deneme kişilerini hazırla" loading={busy === 'prepare'} onPress={() => run('prepare', async () => setRows(await preparePersonas()))} />
        </View>
      )}

      {(['buro', 'sirket'] as const).map((g) => (
        <View key={g} style={{ gap: space.sm }}>
          <SectionTitle title={g === 'buro' ? 'Muhasebe bürosu senaryosu' : 'Şirket senaryosu'} />
          <View style={styles.grid}>
            {PERSONAS.filter((p) => p.group === g).map((p) => {
              const on = p.key === demo.persona;
              return (
                <View key={p.key} style={[styles.card, { backgroundColor: on ? c.penSoft : c.paper, borderColor: on ? c.pen : 'transparent' }]}>
                  <Text style={[type.bodyStrong, { color: c.ink }]}>{p.name}</Text>
                  <Text style={[type.small, { color: c.pen, fontWeight: '600' }]}>{p.role}</Text>
                  <Text style={[type.small, { color: c.muted }]}>{p.does}</Text>
                  {emailOf(p.key) ? (
                    <Text selectable style={[type.small, { color: c.ink }]}>{emailOf(p.key)}</Text>
                  ) : null}
                  <Button
                    title={on ? 'Şu an bu kişisiniz' : 'Bu kişiyle gir'}
                    variant={on ? 'secondary' : 'primary'}
                    disabled={on || !ready}
                    loading={busy === p.key}
                    onPress={() => run(p.key, () => switchTo(p.key))}
                  />
                </View>
              );
            })}
          </View>
          <Scenario id={g} steps={g === 'buro' ? SCENARIO_BURO : SCENARIO_SIRKET} />
        </View>
      ))}

      <SectionTitle title="Temizlik" />
      <Text style={[type.small, { color: c.muted }]}>
        Deneme kişilerinin açtığı şirketler, bürolar, raporlar ve fişler silinir. Gerçek müşterilere ve sizin hesabınıza dokunulmaz. Kişiler kalır, baştan başlayabilirsiniz.
      </Text>
      <Button
        variant="danger"
        title="Test verilerini sıfırla"
        loading={busy === 'reset'}
        onPress={() =>
          confirm('Test verileri silinsin mi?', 'Deneme kişilerinin açtığı tüm şirket, büro ve raporlar silinir.', 'Sıfırla', () =>
            run('reset', async () => {
              const r = await resetDemoData();
              setInfo(`${r.accounts} deneme hesabı ve ${r.companies} firma silindi.`);
              if (demo.persona) router.replace('/test');
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { flexGrow: 1, flexBasis: 230, borderRadius: radius.lg, padding: space.lg, gap: 4, borderWidth: 2 },
  steps: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
