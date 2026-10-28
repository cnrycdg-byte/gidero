import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { DragNode, dragSupported } from '@/components/drag-node';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { Button, Field, Notice } from '@/components/ui';
import { radius, space, type, useColors } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { ROLE_LABEL } from '@/lib/types';

type Person = {
  user_id: string;
  full_name: string;
  title: string | null;
  roles: string[];
  manager_user_id: string | null;
  final_approver: boolean;
};

const ROOT = '__root__';

/** Raporun izleyeceği yol: yöneticiden yukarı, "son onay" işaretli kişide ya da en tepede biter (sunucudaki kuralın aynısı) */
function chainOf(p: Person, byId: Map<string, Person>): Person[] {
  const out: Person[] = [];
  const seen = new Set([p.user_id]);
  let cur = p;
  while (cur.manager_user_id && byId.has(cur.manager_user_id) && !seen.has(cur.manager_user_id)) {
    const m = byId.get(cur.manager_user_id)!;
    out.push(m);
    if (m.final_approver) break;
    seen.add(m.user_id);
    cur = m;
  }
  return out;
}

// Şirket yöneticisi onay zincirini çizer: kim kimin altında, zincir kimde biter
export default function ApprovalChain() {
  const c = useColors();
  const { active, hasRole, userId } = useSession();
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null); // telefonda: taşınacak kişi
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from('memberships')
        .select('user_id, roles, manager_user_id, title, final_approver')
        .eq('company_id', active.company_id)
        .eq('status', 'active');
      if (e) throw e;
      const rows = (data ?? []) as Omit<Person, 'full_name'>[];
      const { data: ps } = rows.length ? await supabase.from('profiles').select('id, full_name').in('id', rows.map((r) => r.user_id)) : { data: [] };
      const names = new Map(((ps ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
      setPeople(rows.map((r) => ({ ...r, full_name: names.get(r.user_id) || 'İsimsiz' })));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [active]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const byId = useMemo(() => new Map(people.map((p) => [p.user_id, p])), [people]);
  const childrenOf = useCallback(
    (id: string | null) =>
      people
        .filter((p) => (id === null ? !p.manager_user_id || !byId.has(p.manager_user_id) : p.manager_user_id === id))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')),
    [people, byId],
  );
  const sel = selected ? byId.get(selected) ?? null : null;

  async function move(src: string, target: string | null) {
    if (!active) return;
    setError(null);
    setInfo(null);
    const p = byId.get(src);
    if (!p || p.manager_user_id === target) return;
    // Ekranda hemen göster, sunucu reddederse geri al
    setPeople((cur) => cur.map((x) => (x.user_id === src ? { ...x, manager_user_id: target } : x)));
    const { error: e } = await supabase.rpc('set_manager', { p_company: active.company_id, p_user: src, p_manager: target });
    if (e) {
      setError(errorText(e));
      load();
      return;
    }
    setInfo(target ? `${p.full_name}, ${byId.get(target)?.full_name ?? ''} altına bağlandı.` : `${p.full_name} en üste taşındı.`);
  }

  async function saveDetails(p: Person, patch: Partial<Pick<Person, 'title' | 'final_approver'>>) {
    if (!active) return;
    setBusy(true);
    setError(null);
    const next = { ...p, ...patch };
    const { error: e } = await supabase.rpc('set_member_details', {
      p_company: active.company_id,
      p_user: p.user_id,
      p_title: next.title ?? '',
      p_final_approver: next.final_approver,
    });
    setBusy(false);
    if (e) return setError(errorText(e));
    setPeople((cur) => cur.map((x) => (x.user_id === p.user_id ? next : x)));
  }

  function tap(p: Person) {
    if (moving && moving !== p.user_id) {
      move(moving, p.user_id);
      setMoving(null);
      return;
    }
    setSelected(selected === p.user_id ? null : p.user_id);
    setTitle(p.title ?? '');
  }

  if (!hasRole('admin')) {
    return (
      <Page>
        <Notice text="Onay zincirini yalnızca şirket yöneticisi değiştirebilir." />
      </Page>
    );
  }

  function Node({ p, depth }: { p: Person; depth: number }) {
    const kids = childrenOf(p.user_id);
    const on = selected === p.user_id;
    const isMoving = moving === p.user_id;
    return (
      <View style={{ gap: space.sm }}>
        <DragNode id={p.user_id} onDropOn={(src) => move(src, p.user_id)}>
          <Pressable
            onPress={() => tap(p)}
            style={[
              styles.card,
              {
                backgroundColor: on ? c.penSoft : c.paper,
                borderColor: isMoving ? c.stamp : on ? c.pen : c.paperLine,
              },
            ]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.bodyStrong, { color: c.ink }]} numberOfLines={1}>
                {p.full_name}
                {p.user_id === userId ? ' (siz)' : ''}
              </Text>
              <Text style={[type.small, { color: c.muted }]} numberOfLines={1}>
                {p.title || p.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}
              </Text>
            </View>
            {p.final_approver && (
              <View style={[styles.badge, { backgroundColor: c.stampSoft }]}>
                <Text style={{ color: c.stamp, fontSize: 12, fontWeight: '700' }}>Son onay</Text>
              </View>
            )}
            {p.roles.includes('accountant') && (
              <View style={[styles.badge, { backgroundColor: c.canvas }]}>
                <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>Muhasebe</Text>
              </View>
            )}
          </Pressable>
        </DragNode>
        {kids.length > 0 && (
          <View style={[styles.kids, { borderLeftColor: c.paperLine, marginLeft: depth < 6 ? 18 : 8 }]}>
            {kids.map((k) => (
              <Node key={k.user_id} p={k} depth={depth + 1} />
            ))}
          </View>
        )}
      </View>
    );
  }

  const roots = childrenOf(null);
  const chain = sel ? chainOf(sel, byId) : [];

  return (
    <Page refreshing={loading} onRefresh={load} wide>
      <Text style={[type.body, { color: c.muted }]}>
        {dragSupported
          ? 'Bir kişiyi tutup yöneticisinin kartının üstüne bırakın; onun altına bağlanır. Rapor gönderilince yöneticiden yukarı doğru tek tek onaylanır ve "son onay" işaretli kişide ya da en tepede biter. Sonra muhasebeye düşer.'
          : 'Bir kişiye dokunun, "Altına taşı" deyin, sonra yöneticisine dokunun. Rapor yöneticiden yukarı doğru tek tek onaylanır ve "son onay" işaretli kişide ya da en tepede biter.'}
      </Text>
      {error && <Notice tone="bad" text={error} />}
      {info && <Notice tone="ok" text={info} />}
      {moving && (
        <Notice tone="warn" text={`${byId.get(moving)?.full_name} kimin altına bağlansın? Yöneticisine dokunun ya da "En üste taşı" deyin.`} />
      )}

      <View style={styles.layout}>
        <View style={{ flex: 3, minWidth: 300, gap: space.sm }}>
          {people.length === 0 && !loading && (
            <Notice text="Henüz kimse yok. Önce Ekip ekranından kişileri ad soyad ve ünvanla ekleyin." />
          )}
          {roots.map((p) => (
            <Node key={p.user_id} p={p} depth={0} />
          ))}
          {people.length > 1 && (
            <DragNode id={ROOT} draggable={false} onDropOn={(src) => move(src, null)}>
              <Pressable
                onPress={() => {
                  if (moving) {
                    move(moving, null);
                    setMoving(null);
                  }
                }}
                style={[styles.rootZone, { borderColor: c.paperLine }]}>
                <Text style={[type.small, { color: c.muted }]}>
                  {dragSupported ? 'Buraya bırakılan kişi en üstte olur (kimseye bağlı değil)' : 'En üste taşı'}
                </Text>
              </Pressable>
            </DragNode>
          )}
          <Button variant="plain" icon="personAdd" title="Kişi ekle (Ekip)" onPress={() => router.push('/team')} />
        </View>

        <View style={{ flex: 2, minWidth: 280, gap: space.md }}>
          {sel ? (
            <View style={[styles.panel, { backgroundColor: c.paper }]}>
              <Text style={[type.title, { color: c.ink }]}>{sel.full_name}</Text>
              <Field label="Ünvan" value={title} onChangeText={setTitle} onBlur={() => title !== (sel.title ?? '') && saveDetails(sel, { title })} placeholder="Örnek: Satış Direktörü" />
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyStrong, { color: c.ink }]}>Son onay bu kişide</Text>
                  <Text style={[type.small, { color: c.muted }]}>Altındakilerin raporu bu kişi onaylayınca muhasebeye düşer, daha yukarı çıkmaz.</Text>
                </View>
                <Switch value={sel.final_approver} disabled={busy} onValueChange={(v) => saveDetails(sel, { final_approver: v })} />
              </View>
              <Button variant="secondary" title={moving === sel.user_id ? 'Taşımayı bırak' : 'Altına taşı'} onPress={() => setMoving(moving === sel.user_id ? null : sel.user_id)} />

              <Text style={[type.small, { color: c.muted, fontWeight: '700', marginTop: space.sm }]}>{'RAPORU BU YOLU İZLER'}</Text>
              {chain.length === 0 ? (
                <Text style={[type.body, { color: c.ink }]}>
                  Üstünde kimse yok: raporunu başka bir şirket yöneticisi, o da yoksa muhasebe onaylar. Kimse kendi raporunu onaylayamaz.
                </Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {chain.map((m, i) => (
                    <Text key={m.user_id} style={[type.body, { color: c.ink }]}>
                      {`${i + 1}. ${m.full_name}${m.title ? `, ${m.title}` : ''}${m.final_approver ? ' (son onay)' : ''}`}
                    </Text>
                  ))}
                  <Text style={[type.body, { color: c.pen, fontWeight: '600' }]}>{`${chain.length + 1}. Muhasebe: kontrol, aktarım, ödeme`}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.panel, { backgroundColor: c.paper }]}>
              <Text style={[type.bodyStrong, { color: c.ink }]}>Bir kişiye dokunun</Text>
              <Text style={[type.small, { color: c.muted }]}>Ünvanını değiştirin, "son onay" yapın ve raporunun kimlerden geçeceğini görün.</Text>
            </View>
          )}
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, alignItems: 'flex-start' },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.lg, padding: space.md, borderWidth: 2 },
  kids: { borderLeftWidth: 2, paddingLeft: space.md, gap: space.sm },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  rootZone: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.lg, alignItems: 'center' },
  panel: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
