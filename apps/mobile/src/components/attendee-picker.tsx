import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Button, Field } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { formatPerson, searchContacts, searchOrgs, type Contact } from '@/lib/contacts';

type Props = {
  companyId: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** Yazılıp henüz eklenmemiş kişi (kaydederken kaybolmasın diye üst ekrana bildirilir) */
  onDraft: (draft: string) => void;
  editable: boolean;
};

/** Masrafı kimlerle yaptığını seçme: ad + firma; daha önce girilenler birkaç harfte önerilir */
export function AttendeePicker({ companyId, value, onChange, onDraft, editable }: Props) {
  const c = useColors();
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [focus, setFocus] = useState<'name' | 'org' | null>(null);
  const [people, setPeople] = useState<Contact[]>([]);
  const [orgs, setOrgs] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Yazdıkça rehberde ara (kısa bekleme ile)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (focus === 'name') setPeople(await searchContacts(companyId, name));
      if (focus === 'org') setOrgs(await searchOrgs(companyId, org));
    }, 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [name, org, focus, companyId]);

  useEffect(() => {
    onDraft(name.trim() ? formatPerson(name, org) : '');
  }, [name, org, onDraft]);

  function add(n: string, o: string) {
    if (n.trim().length < 2) return;
    const p = formatPerson(n, o);
    if (!value.includes(p)) onChange([...value, p]);
    setName('');
    setOrg('');
    setPeople([]);
  }

  const suggestions = people.filter((p) => !value.includes(formatPerson(p.full_name, p.org_name)));

  return (
    <View style={{ gap: space.md }}>
      {value.length > 0 && (
        <View style={styles.chips}>
          {value.map((p) => (
            <Pressable
              key={p}
              disabled={!editable}
              onPress={() => onChange(value.filter((x) => x !== p))}
              accessibilityLabel={`${p} kişisini çıkar`}
              style={[styles.chip, { backgroundColor: c.penSoft }]}>
              <Text style={{ color: c.pen, fontWeight: '600' }}>{p}</Text>
              {editable && <Icon name="close" size={10} color={c.pen} />}
            </Pressable>
          ))}
        </View>
      )}

      {editable && (
        <>
          <Field
            label="Ad soyad"
            value={name}
            onChangeText={setName}
            onFocus={() => setFocus('name')}
            placeholder="Birkaç harf yazın"
            autoCapitalize="words"
            returnKeyType="next"
          />
          {focus === 'name' && suggestions.length > 0 && (
            <View style={[styles.list, { backgroundColor: c.canvas }]}>
              <Text style={[type.small, { color: c.muted, paddingHorizontal: space.md, paddingTop: space.sm }]}>
                {name.trim() ? 'Rehberinizden' : 'Son kullandıklarınız'}
              </Text>
              {suggestions.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => add(p.full_name, p.org_name)}
                  style={({ pressed }) => [styles.item, { backgroundColor: pressed ? c.paperLine : 'transparent' }]}>
                  <Icon name="plus" size={13} color={c.pen} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { color: c.ink }]}>{p.full_name}</Text>
                    {p.org_name ? <Text style={[type.small, { color: c.muted }]}>{p.org_name}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <Field
            label="Firması"
            value={org}
            onChangeText={setOrg}
            onFocus={() => setFocus('org')}
            placeholder="Örnek: ABC Ticaret (isteğe bağlı)"
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => add(name, org)}
          />
          {focus === 'org' && orgs.length > 0 && (
            <View style={[styles.chips, { marginTop: -space.xs }]}>
              {orgs.map((o) => (
                <Pressable key={o} onPress={() => setOrg(o)} style={[styles.chip, { backgroundColor: c.canvas }]}>
                  <Text style={{ color: c.ink }}>{o}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Button
            variant="secondary"
            icon="personAdd"
            title="Kişiyi ekle"
            onPress={() => add(name, org)}
            disabled={name.trim().length < 2}
            style={{ backgroundColor: c.canvas }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  list: { borderRadius: radius.md, overflow: 'hidden', marginTop: -space.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: 10 },
});
