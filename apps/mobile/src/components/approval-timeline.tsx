import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { fonts, radius, space, type, useColors } from '@/constants/theme';
import type { Report } from '@/lib/types';

export type TimelineAction = { id: string; action: string; note: string | null; created_at: string; actor_user_id: string; step_position: number | null };

type State = 'done' | 'current' | 'returned' | 'next';
type Node = { title: string; who?: string; when?: string; note?: string | null; state: State };

const when = (iso: string | null | undefined) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * Raporun onay akışı: oluşturuldu, gönderildi, her onay adımı (kim onayladı, kimde bekliyor, sıradaki kim),
 * muhasebe ve ödeme. Hem raporu oluşturan hem onaylayıcılar aynı şemayı görür.
 */
export function ApprovalTimeline({
  report,
  actions,
  names,
  preview,
}: {
  report: Report & { flow_snapshot?: { name?: string }[] | null; current_step?: number | null; approved_at?: string | null; paid_at?: string | null; payment_requested_at?: string | null };
  actions: TimelineAction[];
  names: Map<string, string>;
  /** Gönderilmemiş raporda kimlerin onaylayacağı */
  preview: string[];
}) {
  const c = useColors();
  const name = (id: string | undefined) => (id ? names.get(id) || 'İsimsiz' : undefined);
  const status = report.status;
  // Son gönderimden sonraki hareketler (iade edilip yeniden gönderilen raporda önceki tur ayrı gösterilir)
  const lastSubmit = [...actions].reverse().find((a) => a.action === 'submitted');
  const cycle = lastSubmit ? actions.filter((a) => a.created_at >= lastSubmit.created_at) : [];
  const booked = actions.find((a) => a.action === 'booked_without_approval');
  const returned = status === 'returned' ? [...actions].reverse().find((a) => a.action === 'returned') : undefined;
  const steps = (report.flow_snapshot ?? []).length && status !== 'draft' ? report.flow_snapshot! : preview.map((n) => ({ name: n }));
  const finished = ['approved', 'booked', 'exported', 'paid'].includes(status);

  const nodes: Node[] = [{ title: 'Rapor oluşturuldu', who: name(report.owner_user_id), when: when(report.created_at), state: 'done' }];

  if (booked) {
    nodes.push({ title: 'Muhasebeci girdiği için onaysız kayda alındı', who: name(booked.actor_user_id), when: when(booked.created_at), state: 'done' });
  } else {
    const sent = status !== 'draft' && !!lastSubmit;
    nodes.push({
      title: sent ? 'Onaya gönderildi' : 'Onaya gönderilecek',
      when: sent ? when(lastSubmit!.created_at) : undefined,
      state: sent ? 'done' : 'current',
      who: sent ? name(lastSubmit!.actor_user_id) : 'Fişleri kontrol edip "Onaya gönder" deyin',
    });
    steps.forEach((s, i) => {
      const ok = cycle.find((a) => a.action === 'approved' && a.step_position === i);
      const back = returned && returned.step_position === i ? returned : undefined;
      if (ok) {
        nodes.push({ title: s.name ?? `Onay ${i + 1}`, who: `Onayladı: ${name(ok.actor_user_id)}`, when: when(ok.created_at), note: ok.note, state: 'done' });
      } else if (back) {
        nodes.push({ title: s.name ?? `Onay ${i + 1}`, who: `İade etti: ${name(back.actor_user_id)}`, when: when(back.created_at), note: back.note, state: 'returned' });
      } else if (status === 'pending' && report.current_step === i) {
        const waiting = report.current_approver_ids.map((id) => name(id)).join(', ');
        nodes.push({ title: s.name ?? `Onay ${i + 1}`, who: `Onay bekliyor${waiting ? `: ${waiting}` : ''}`, state: 'current' });
      } else if (finished) {
        nodes.push({ title: s.name ?? `Onay ${i + 1}`, who: 'Onaylandı', state: 'done' });
      } else {
        nodes.push({ title: s.name ?? `Onay ${i + 1}`, who: i === steps.length - 1 ? 'Son onay' : 'Sırada', state: 'next' });
      }
    });
  }

  nodes.push({
    title: 'Muhasebe',
    who: finished ? (status === 'exported' || status === 'paid' ? 'Muhasebeye aktarıldı' : 'Muhasebe kontrol ediyor') : 'Onaylar bitince muhasebeye düşer',
    when: finished ? when(report.approved_at) : undefined,
    state: status === 'exported' || status === 'paid' || report.payment_requested_at ? 'done' : finished ? 'current' : 'next',
  });
  nodes.push({
    title: 'Ödeme',
    who: status === 'paid' ? 'Ödendi' : report.payment_requested_at ? 'Ödeme sorumlusunda, ödeme bekleniyor' : 'Muhasebe ödemeye aktarınca ödenir',
    when: status === 'paid' ? when(report.paid_at) : report.payment_requested_at ? when(report.payment_requested_at) : undefined,
    state: status === 'paid' ? 'done' : report.payment_requested_at ? 'current' : 'next',
  });

  const look = (s: State) =>
    s === 'done'
      ? { dot: c.pen, fg: c.onPen, line: c.pen }
      : s === 'current'
        ? { dot: c.gold, fg: '#3B2500', line: c.paperLine }
        : s === 'returned'
          ? { dot: c.red, fg: '#FFFFFF', line: c.paperLine }
          : { dot: c.canvas, fg: c.faint, line: c.paperLine };

  return (
    <View style={[styles.box, { backgroundColor: c.paper }]}>
      {nodes.map((n, i) => {
        const l = look(n.state);
        const last = i === nodes.length - 1;
        return (
          <View key={i} style={styles.node}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: l.dot, borderColor: n.state === 'next' ? c.faint : l.dot }]}>
                {n.state === 'done' ? (
                  <Icon name="check" size={11} color={l.fg} />
                ) : n.state === 'returned' ? (
                  <Text style={{ color: l.fg, fontSize: 11, fontFamily: fonts.bold }}>!</Text>
                ) : n.state === 'current' ? (
                  <View style={[styles.pulse, { backgroundColor: '#3B2500' }]} />
                ) : null}
              </View>
              {!last && <View style={[styles.line, { backgroundColor: l.line }]} />}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : space.lg, gap: 2 }}>
              <Text style={[type.bodyStrong, { color: n.state === 'next' ? c.muted : c.ink }]}>{n.title}</Text>
              {n.who ? (
                <Text style={[type.small, { color: n.state === 'current' ? c.stamp : n.state === 'returned' ? c.red : c.muted, fontWeight: n.state === 'current' ? '700' : '400' }]}>
                  {n.who}
                </Text>
              ) : null}
              {n.when ? <Text style={[type.small, { color: c.faint }]}>{n.when}</Text> : null}
              {n.note ? (
                <View style={[styles.note, { backgroundColor: c.canvas }]}>
                  <Text style={[type.small, { color: c.ink }]}>{`“${n.note}”`}</Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, padding: space.lg },
  node: { flexDirection: 'row', gap: space.md },
  rail: { width: 22, alignItems: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pulse: { width: 7, height: 7, borderRadius: 4 },
  line: { width: 2, flex: 1, marginVertical: 2, borderRadius: 1 },
  note: { borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 6, marginTop: 4, alignSelf: 'flex-start' },
});
