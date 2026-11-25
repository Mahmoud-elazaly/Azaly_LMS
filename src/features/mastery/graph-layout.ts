import type { Edge } from './model';

export const nodeWidth = 180;
export const nodeHeight = 92;

// Prerequisites advance the column. Other relation types can point in either direction.
export function graphLayout(slugs: string[], edges: Edge[]) {
  const pending = new Set(slugs);
  const columns = new Map<string, number>();
  const prerequisites = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.relation !== 'prerequisite' || !pending.has(edge.source) || !pending.has(edge.target)) continue;
    prerequisites.set(edge.target, [...(prerequisites.get(edge.target) ?? []), edge.source]);
  }
  while (pending.size) {
    const ready = [...pending].filter((slug) => (prerequisites.get(slug) ?? []).every((source) => columns.has(source)));
    if (!ready.length) break;
    for (const slug of ready) {
      columns.set(slug, Math.max(0, ...(prerequisites.get(slug) ?? []).map((source) => (columns.get(source) ?? 0) + 1)));
      pending.delete(slug);
    }
  }
  const rows = new Map<number, number>();
  const positions = new Map(slugs.map((slug) => {
    const column = columns.get(slug) ?? 0;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return [slug, { x: 20 + column * (nodeWidth + 44), y: 24 + row * (nodeHeight + 30) }] as const;
  }));
  return {
    positions,
    width: 40 + nodeWidth + Math.max(0, ...columns.values()) * (nodeWidth + 44),
    height: 48 + nodeHeight + (Math.max(1, ...rows.values()) - 1) * (nodeHeight + 30),
  };
}
