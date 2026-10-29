import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { DragNode, dragSupported } from '@/components/drag-node';
import { PersonEditor } from '@/components/person-editor';
import { Text } from '@/components/text';
import { Button, Field, Notice } from '@/components/ui';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import { useWide } from '@/lib/layout';
import { layoutOrg, NODE_H, NODE_W } from '@/lib/orgchart/layout.ts';
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
  vehicle_plates: string[];
};

const ROOT = '__root__';
// Direktörlük (kökün altındaki her dal) renkleri: sakin, birbirinden ayrışan tonlar
const BRANCH = ['#0B6E5F', '#2F5DA8', '#9A5B00', '#7B3FA0', '#B4531A', '#3C7D2E', '#A23B63', '#4B6B7A'];
const GOLD = '#E09A1F';

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

// Onay zinciri: şirket kendi organizasyon şemasını çizer; her kişinin raporu yukarı doğru onaylanır,
// "son onay" kişisinde biter ve muhasebeye düşer.
export default function ApprovalChain() {
  const c = useColors();
  const wide = useWide();
  const { active, hasRole, userId } = useSession();
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [zoom, setZoom] = useState(1);
  const [viewW, setViewW] = useState(0);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
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
        .select('user_id, roles, manager_user_id, title, final_approver, vehicle_plates')
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
  const chart = useMemo(() => layoutOrg(people, (p) => p.full_name), [people]);
  const branchColor = useMemo(() => {
    const keys = [...new Set([...chart.boxes.values()].map((b) => b.branch).filter(Boolean))];
    return (k: string) => (k ? BRANCH[keys.indexOf(k) % BRANCH.length] : c.deep);
  }, [chart, c.deep]);

  const sel = selected ? byId.get(selected) ?? null : null;
  const chain = useMemo(() => (sel ? chainOf(sel, byId) : []), [sel, byId]);
  const pathIds = useMemo(() => new Set(sel ? [sel.user_id, ...chain.map((m) => m.user_id)] : []), [sel, chain]);
  const stepOf = (id: string) => chain.findIndex((m) => m.user_id === id);
  const finalOnPath = chain[chain.length - 1] ?? null;

  // Seçilen kişinin altındakiler (kendi altına bağlanamaz)
  const below = useMemo(() => {
    const out = new Set<string>();
    if (!sel) return out;
    const walk = (id: string) =>
      people.filter((p) => p.manager_user_id === id).forEach((p) => {
        if (!out.has(p.user_id)) {
          out.add(p.user_id);
          walk(p.user_id);
        }
      });
    walk(sel.user_id);
    return out;
  }, [sel, people]);

  async function move(src: string, target: string | null) {
    if (!active) return;
    setError(null);
    setInfo(null);
    const p = byId.get(src);
    if (!p || p.manager_user_id === target || src === target) return;
    setPeople((cur) => cur.map((x) => (x.user_id === src ? { ...x, manager_user_id: target } : x)));
    const { error: e } = await supabase.rpc('set_manager', { p_company: active.company_id, p_user: src, p_manager: target });
    if (e) {
      setError(errorText(e));
      load();
      return;
    }
    setSelected(src);
    setInfo(target ? `${p.full_name} artık ${byId.get(target)?.full_name ?? ''} kişisine bağlı.` : `${p.full_name} en üste taşındı.`);
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
      <View style={{ padding: space.xl }}>
        <Notice text="Onay zincirini yalnızca şirket yöneticisi değiştirebilir." />
      </View>
    );
  }

  const canvasW = Math.max(chart.width + 180, 600);
  const canvasH = chart.height + 40;

  const panel = (
    <View style={[styles.panel, { backgroundColor: c.paper, borderColor: c.paperLine }, wide && { width: 340 }]}>
      {sel ? (
        <>
          <Text style={[type.title, { color: c.ink, fontSize: 20 }]}>{sel.full_name}</Text>
          <Field label="Ünvan" value={title} onChangeText={setTitle} onBlur={() => title !== (sel.title ?? '') && saveDetails(sel, { title })} placeholder="Örnek: Satış Direktörü" />
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: c.ink }]}>Son onay bu kişide</Text>
              <Text style={[type.small, { color: c.muted }]}>Altındakilerin raporu bu kişi onaylayınca muhasebeye düşer, yukarı çıkmaz.</Text>
            </View>
            <Switch value={sel.final_approver} disabled={busy} onValueChange={(v) => saveDetails(sel, { final_approver: v })} />
          </View>

          <Text style={[type.small, { color: c.muted }]}>
            {`Bağlı olduğu kişi: ${sel.manager_user_id ? byId.get(sel.manager_user_id)?.full_name ?? '—' : 'kimse (en üstte)'}. Değiştirmek için kişi kartını açın ya da şemada sürükleyin.`}
          </Text>
          <View style={[styles.path, { backgroundColor: c.canvas }]}>
            <Text style={[type.small, { color: c.muted, fontWeight: '600' }]}>{`${sel.full_name.split(' ')[0]} masraf gönderince`}</Text>
            {chain.length === 0 ? (
              <Text style={[type.small, { color: c.ink }]}>Üstünde kimse yok: raporunu başka bir şirket yöneticisi, o da yoksa muhasebe onaylar.</Text>
            ) : (
              chain.map((m, i) => (
                <View key={m.user_id} style={styles.pathRow}>
                  <View style={[styles.step, { backgroundColor: GOLD }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontFamily: fonts.bold }}>{i + 1}</Text>
                  </View>
                  <Text style={[type.small, { color: c.ink, flex: 1 }]}>{`${m.full_name}${m.title ? `, ${m.title}` : ''}${m.final_approver ? ' (son onay)' : ''}`}</Text>
                </View>
              ))
            )}
            <View style={styles.pathRow}>
              <View style={[styles.step, { backgroundColor: c.pen }]}>
                <Text style={{ color: '#fff', fontSize: 11, fontFamily: fonts.bold }}>✓</Text>
              </View>
              <Text style={[type.small, { color: c.pen, fontWeight: '700' }]}>Muhasebe: kontrol, aktarım, ödeme</Text>
            </View>
          </View>

          <View style={styles.chips}>
            <Button title="Kişi kartını düzenle" onPress={() => setEditing(sel.user_id)} />
            <Button variant="secondary" icon="personAdd" title="Altına kişi ekle" onPress={() => router.push({ pathname: '/team', params: { manager: sel.user_id } })} />
            {!dragSupported && (
              <Button variant="secondary" title={moving === sel.user_id ? 'Taşımayı bırak' : 'Başkasının altına taşı'} onPress={() => setMoving(moving === sel.user_id ? null : sel.user_id)} />
            )}
          </View>
        </>
      ) : (
        <>
          <Text style={[type.bodyStrong, { color: c.ink }]}>Bir kişiye dokunun</Text>
          <Text style={[type.small, { color: c.muted }]}>
            Raporunun en alttan yukarı hangi sırayla onaylanacağı şemada altın renkle çizilir. Ünvanı, kime bağlı olduğunu ve "son onay"ı buradan değiştirirsiniz.
          </Text>
          <View style={[styles.legend, { borderTopColor: c.paperLine }]}>
            <Legend color={GOLD} label="Son onay: rapor burada biter, muhasebeye düşer" />
            <Legend color={c.pen} label="Seçilen kişinin onay yolu" line />
            <Legend color={BRANCH[1]} label="Kartın üst rengi: bölüm (en üstün altındaki her dal)" />
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={[styles.toolbar, { borderBottomColor: c.paperLine }]}>
        <Text style={[type.small, { color: c.muted, flex: 1, minWidth: 220 }]}>
          {dragSupported
            ? 'Kişiyi tutup yöneticisinin kartına bırakın. Rapor alttan yukarı onaylanır, "son onay" kişisinde biter ve muhasebeye düşer.'
            : 'Kişiye dokunun; "Kime bağlı?" kısmından yöneticisini seçin. Rapor alttan yukarı onaylanır, "son onay" kişisinde biter.'}
        </Text>
        <View style={styles.zoom}>
          <Pressable onPress={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} style={[styles.zbtn, { borderColor: c.paperLine, backgroundColor: c.paper }]}>
            <Text style={{ color: c.ink, fontSize: 18 }}>−</Text>
          </Pressable>
          <Pressable onPress={() => setZoom(1)} style={[styles.zbtn, { borderColor: c.paperLine, backgroundColor: c.paper, width: 56 }]}>
            <Text style={{ color: c.ink, fontSize: 13 }}>{`%${Math.round(zoom * 100)}`}</Text>
          </Pressable>
          <Pressable onPress={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))} style={[styles.zbtn, { borderColor: c.paperLine, backgroundColor: c.paper }]}>
            <Text style={{ color: c.ink, fontSize: 18 }}>+</Text>
          </Pressable>
          <Pressable
            onPress={() => viewW && setZoom(Math.max(0.4, Math.min(1, +((viewW - 48) / canvasW).toFixed(2))))}
            style={[styles.zbtn, { borderColor: c.paperLine, backgroundColor: c.paper, width: 64 }]}>
            <Text style={{ color: c.ink, fontSize: 13 }}>Sığdır</Text>
          </Pressable>
        </View>
        <Button variant="secondary" icon="personAdd" title="Kişi ekle" onPress={() => router.push('/team')} />
      </View>
      {(error || info || moving) && (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>
          {error && <Notice tone="bad" text={error} />}
          {info && <Notice tone="ok" text={info} />}
          {moving && <Notice tone="warn" text={`${byId.get(moving)?.full_name} kime bağlansın? Şemada yöneticisine dokunun.`} />}
        </View>
      )}

      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg }} onLayout={(e) => setViewW(e.nativeEvent.layout.width)}>
          <ScrollView horizontal contentContainerStyle={{ paddingBottom: space.lg }}>
            <View style={{ gap: space.md }}>
              {people.length > 1 && (
                <DragNode id={ROOT} draggable={false} onDropOn={(src) => move(src, null)}>
                  <View style={[styles.rootZone, { borderColor: c.paperLine, width: Math.min(canvasW * zoom, 640) }]}>
                    <Text style={[type.small, { color: c.muted }]}>Buraya bırakılan kişi en üstte olur (kimseye bağlı değil)</Text>
                  </View>
                </DragNode>
              )}
              {people.length === 0 && !loading && <Notice text="Henüz kimse yok. Önce Kişi ekle ile ekibinizi ad soyad ve ünvanla ekleyin." />}
              <View style={{ width: canvasW * zoom, height: canvasH * zoom }}>
                <View style={{ width: canvasW, height: canvasH, transform: [{ scale: zoom }], transformOrigin: 'top left' }}>
                  <Svg width={canvasW} height={canvasH} style={StyleSheet.absoluteFill} pointerEvents="none">
                    {chart.edges.map((e) => {
                      const on = pathIds.has(e.from) && pathIds.has(e.to) && byId.get(e.from)?.manager_user_id === e.to;
                      return <Path key={`${e.from}-${e.to}`} d={e.d} stroke={on ? GOLD : c.paperLine} strokeWidth={on ? 3 : 1.5} fill="none" />;
                    })}
                  </Svg>
                  {people.map((p) => {
                    const b = chart.boxes.get(p.user_id);
                    if (!b) return null;
                    const on = selected === p.user_id;
                    const step = stepOf(p.user_id);
                    const dim = !!sel && !pathIds.has(p.user_id);
                    return (
                      <View key={p.user_id} style={{ position: 'absolute', left: b.x, top: b.y, width: NODE_W }}>
                        <DragNode id={p.user_id} onDropOn={(src) => move(src, p.user_id)}>
                          <Pressable
                            onPress={() => tap(p)}
                            style={[
                              styles.node,
                              {
                                backgroundColor: c.paper,
                                borderColor: on ? c.pen : p.final_approver ? GOLD : moving === p.user_id ? c.stamp : c.paperLine,
                                borderWidth: on || p.final_approver ? 2 : 1,
                                opacity: dim ? 0.45 : 1,
                              },
                            ]}>
                            <View style={[styles.stripe, { backgroundColor: branchColor(b.branch) }]} />
                            <View style={{ flex: 1, paddingLeft: 10, gap: 1 }}>
                              <Text style={[type.bodyStrong, { color: c.ink, fontSize: 14, lineHeight: 18 }]} numberOfLines={1}>
                                {p.full_name}
                                {p.user_id === userId ? ' (siz)' : ''}
                              </Text>
                              <Text style={[type.small, { color: c.muted, fontSize: 12 }]} numberOfLines={1}>
                                {p.title || p.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}
                              </Text>
                              <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
                                {p.final_approver && <Badge text="Son onay" bg="#FDF1DC" fg="#9A5B00" />}
                                {p.roles.includes('approver') && !p.final_approver && <Badge text="Onaylayıcı" bg={c.penSoft} fg={c.pen} />}
                                {p.roles.includes('accountant') && <Badge text="Muhasebe" bg={c.canvas} fg={c.muted} />}
                              </View>
                            </View>
                            {step >= 0 ? (
                              <View style={[styles.stepBadge, { backgroundColor: GOLD }]}>
                                <Text style={{ color: '#fff', fontSize: 11, fontFamily: fonts.bold }}>{step + 1}</Text>
                              </View>
                            ) : (
                              <Pressable
                                onPress={() => {
                                  setSelected(p.user_id);
                                  setTitle(p.title ?? '');
                                  setEditing(p.user_id);
                                }}
                                hitSlop={6}
                                accessibilityLabel={`${p.full_name} kişisini düzenle`}
                                style={({ pressed }) => [styles.edit, { borderColor: c.paperLine, backgroundColor: pressed ? c.penSoft : c.paper }]}>
                                <Text style={{ color: c.pen, fontSize: 12, fontFamily: fonts.semibold }}>Düzenle</Text>
                              </Pressable>
                            )}
                          </Pressable>
                        </DragNode>
                      </View>
                    );
                  })}
                  {sel && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.toAcc,
                        {
                          left: (chart.boxes.get((finalOnPath ?? sel).user_id)?.x ?? 0) + NODE_W + 8,
                          top: (chart.boxes.get((finalOnPath ?? sel).user_id)?.y ?? 0) + NODE_H / 2 - 13,
                          backgroundColor: c.pen,
                        },
                      ]}>
                      <Text style={{ color: c.onPen, fontSize: 12, fontFamily: fonts.semibold }}>{finalOnPath ? '→ Muhasebe' : '→ Yönetici / muhasebe'}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </ScrollView>
        </ScrollView>
        <ScrollView style={wide ? { flexGrow: 0 } : undefined} contentContainerStyle={{ padding: space.lg }}>
          {panel}
        </ScrollView>
      </View>
      {editing && byId.get(editing) && active && (
        <PersonEditor
          person={byId.get(editing)!}
          people={people}
          companyId={active.company_id}
          me={userId}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setInfo(msg);
            load();
          }}
        />
      )}
    </View>
  );
}

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
      <Text style={{ color: fg, fontSize: 11, fontFamily: fonts.semibold }}>{text}</Text>
    </View>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={line ? { width: 18, height: 3, backgroundColor: GOLD, borderRadius: 2 } : { width: 12, height: 12, borderRadius: 3, borderWidth: 2, borderColor: color }} />
      <Text style={[type.small, { color: c.muted, flex: 1 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  zoom: { flexDirection: 'row', gap: 4 },
  zbtn: { height: 34, width: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rootZone: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: space.lg, alignItems: 'center' },
  node: { height: NODE_H, flexDirection: 'row', alignItems: 'center', borderRadius: 12, overflow: 'hidden', paddingRight: 8 },
  stripe: { width: 5, alignSelf: 'stretch' },
  edit: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  stepBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  toAcc: { position: 'absolute', borderRadius: 999, paddingHorizontal: 10, height: 26, justifyContent: 'center' },
  panel: { borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  path: { borderRadius: radius.md, padding: space.md, gap: 8 },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  legend: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md },
});
