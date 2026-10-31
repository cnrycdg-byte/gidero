// Tanıtım e-postasındaki "listeden çıkın" bağlantısının açtığı sayfa. Oturum gerekmez.
// Adres kalıcı ret listesine yazılır; bekleyen e-postalar iptal edilir.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Logo } from '@/components/logo';
import { Text } from '@/components/text';
import { Loading } from '@/components/ui';
import { space, type, useColors } from '@/constants/theme';
import { unsubscribe } from '@/lib/leads';

export default function Unsubscribe() {
  const c = useColors();
  const { t } = useLocalSearchParams<{ t?: string }>();
  const [state, setState] = useState<'wait' | 'ok' | 'bad'>('wait');
  useEffect(() => {
    if (!t) return setState('bad');
    unsubscribe(String(t)).then((ok) => setState(ok ? 'ok' : 'bad')).catch(() => setState('bad'));
  }, [t]);
  if (state === 'wait') return <Loading />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md, backgroundColor: c.canvas }}>
      <Logo size={30} color={c.pen} />
      <Text style={[type.title, { color: c.ink, textAlign: 'center' }]}>{state === 'ok' ? 'Listeden çıktınız' : 'Bağlantı geçersiz'}</Text>
      <Text style={[type.body, { color: c.muted, textAlign: 'center', maxWidth: 420 }]}>
        {state === 'ok'
          ? 'Bu adrese Gidero\'dan bir daha tanıtım e-postası gönderilmeyecek. Yanlışlıkla bastıysanız bize yazmanız yeterli.'
          : 'Bu bağlantıyla işlem yapılamadı. Listeden çıkmak için gelen e-postayı yanıtlayıp "çıkar" yazmanız yeterli; en geç 3 iş günü içinde çıkarırız.'}
      </Text>
    </View>
  );
}
