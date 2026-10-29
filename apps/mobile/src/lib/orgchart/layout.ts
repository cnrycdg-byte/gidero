// Organizasyon şeması yerleşimi: kişiler yukarıdan aşağı ağaç olarak dizilir.
// Yalnızca altında kimse olmayan kişilerden oluşan grup, yöneticisinin altında alt alta (sütun) dizilir; şema
// böylece genişlemeden okunur. Sonuç: her kişinin konumu ve aradaki bağlantı çizgileri.

export type OrgPerson = { user_id: string; manager_user_id: string | null };
export type Box = { id: string; x: number; y: number; depth: number; branch: string };
export type Edge = { from: string; to: string; d: string };

export const NODE_W = 216;
export const NODE_H = 66;
const GAP_X = 22;
const GAP_Y = 56;
const STACK_GAP = 10;
const INDENT = 26;

type Sub = { w: number; h: number; place: (x: number, y: number, depth: number, branch: string) => void };

export function layoutOrg<T extends OrgPerson>(people: T[], sortKey: (p: T) => string) {
  const ids = new Set(people.map((p) => p.user_id));
  const kids = new Map<string | null, T[]>();
  for (const p of people) {
    const parent = p.manager_user_id && ids.has(p.manager_user_id) && p.manager_user_id !== p.user_id ? p.manager_user_id : null;
    kids.set(parent, [...(kids.get(parent) ?? []), p]);
  }
  for (const list of kids.values()) list.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'tr'));

  const boxes = new Map<string, Box>();
  const edges: Edge[] = [];
  const seen = new Set<string>();

  function build(p: T): Sub {
    seen.add(p.user_id);
    const children = (kids.get(p.user_id) ?? []).filter((c) => !seen.has(c.user_id));
    if (children.length === 0) {
      return { w: NODE_W, h: NODE_H, place: (x, y, depth, branch) => boxes.set(p.user_id, { id: p.user_id, x, y, depth, branch }) };
    }
    const allLeaves = children.every((c) => !(kids.get(c.user_id) ?? []).some((g) => !seen.has(g.user_id) && g.user_id !== c.user_id));
    if (allLeaves && children.length > 1) {
      children.forEach((c) => seen.add(c.user_id));
      const h = NODE_H + GAP_Y / 2 + children.length * (NODE_H + STACK_GAP) - STACK_GAP;
      return {
        w: NODE_W + INDENT,
        h,
        place: (x, y, depth, branch) => {
          boxes.set(p.user_id, { id: p.user_id, x, y, depth, branch });
          const lineX = x + 18;
          children.forEach((c, i) => {
            const cy = y + NODE_H + GAP_Y / 2 + i * (NODE_H + STACK_GAP);
            const b = branch || c.user_id;
            boxes.set(c.user_id, { id: c.user_id, x: x + INDENT, y: cy, depth: depth + 1, branch: b });
            edges.push({ from: c.user_id, to: p.user_id, d: `M ${lineX} ${y + NODE_H} L ${lineX} ${cy + NODE_H / 2} L ${x + INDENT} ${cy + NODE_H / 2}` });
          });
        },
      };
    }
    const subs = children.map((c) => ({ c, s: build(c) }));
    const inner = subs.reduce((a, { s }) => a + s.w, 0) + GAP_X * (subs.length - 1);
    const w = Math.max(NODE_W, inner);
    const h = NODE_H + GAP_Y + Math.max(...subs.map(({ s }) => s.h));
    return {
      w,
      h,
      place: (x, y, depth, branch) => {
        const px = x + (w - NODE_W) / 2;
        boxes.set(p.user_id, { id: p.user_id, x: px, y, depth, branch });
        let cx = x + (w - inner) / 2;
        const midY = y + NODE_H + GAP_Y / 2;
        for (const { c, s } of subs) {
          const cy = y + NODE_H + GAP_Y;
          // Kökün altındaki her dal (direktörlük) ayrı renk alır
          s.place(cx, cy, depth + 1, branch || c.user_id);
          const cb = boxes.get(c.user_id)!;
          edges.push({
            from: c.user_id,
            to: p.user_id,
            d: `M ${px + NODE_W / 2} ${y + NODE_H} L ${px + NODE_W / 2} ${midY} L ${cb.x + NODE_W / 2} ${midY} L ${cb.x + NODE_W / 2} ${cy}`,
          });
          cx += s.w + GAP_X;
        }
      },
    };
  }

  const roots = kids.get(null) ?? [];
  let x = 0;
  let height = 0;
  for (const r of roots) {
    const s = build(r);
    s.place(x, 0, 0, '');
    x += s.w + GAP_X * 2;
    height = Math.max(height, s.h);
  }
  // Döngüde kalmış (normalde olmaz) kişiler en sağa
  for (const p of people) {
    if (!seen.has(p.user_id)) {
      boxes.set(p.user_id, { id: p.user_id, x, y: 0, depth: 0, branch: '' });
      x += NODE_W + GAP_X;
      height = Math.max(height, NODE_H);
    }
  }
  return { boxes, edges, width: Math.max(0, x - GAP_X * 2), height };
}
