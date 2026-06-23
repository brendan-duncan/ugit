// Pure lane layout for a revision DAG (newest-first). Produces a column per revision and the
// edges between a revision and each of its parents, so a component can draw a git-style graph.
// Kept dependency-free (and free of Date.now/new Date) so it's deterministic and testable.

import { LoreRevision } from './types';

export interface GraphRow {
  rev: LoreRevision;
  /** Lane/column index for this revision's node. */
  col: number;
  /** True when this revision is local-only (not yet on the remote). */
  localOnly: boolean;
}

export interface GraphEdge {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

export interface GraphLayout {
  rows: GraphRow[];
  edges: GraphEdge[];
  laneCount: number;
}

/** Parse the RFC-2822-ish date Lore prints into a sortable number (0 if unparseable). */
function dateKey(d: string): number {
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Compute lane columns + edges for the given revisions. Input may be unordered (e.g. unioned
 * across branches); it's sorted newest-first by date, falling back to input order.
 * @param remoteBySignature optional set of signatures known to exist on the remote, used to flag
 *        local-only revisions. When omitted, nothing is flagged local-only.
 */
export function computeGraphLayout(revisions: LoreRevision[], remoteSignatures?: Set<string>): GraphLayout {
  // Stable newest-first sort.
  const order = revisions
    .map((rev, i) => ({ rev, i }))
    .sort((a, b) => (dateKey(b.rev.date) - dateKey(a.rev.date)) || (a.i - b.i))
    .map(x => x.rev);

  const rowOf = new Map<string, number>();
  order.forEach((r, idx) => rowOf.set(r.signature, idx));

  // Pass 1: assign columns via a lane array. lanes[c] = signature that lane c routes toward.
  const lanes: Array<string | null> = [];
  const colOf = new Map<string, number>();

  const allocLane = (sig: string | null): number => {
    let c = lanes.findIndex(l => l === null);
    if (c === -1) { c = lanes.length; lanes.push(null); }
    lanes[c] = sig;
    return c;
  };

  let laneCount = 0;
  order.forEach((rev) => {
    let col = lanes.findIndex(l => l === rev.signature);
    if (col === -1) col = allocLane(null);
    colOf.set(rev.signature, col);

    // Free any other lanes also waiting for this revision (converging children/merges).
    lanes.forEach((l, c) => { if (c !== col && l === rev.signature) lanes[c] = null; });

    // Route this lane to the first parent; open new lanes for additional parents.
    const parents = rev.parents.length ? rev.parents : (rev.parent ? [rev.parent] : []);
    lanes[col] = parents[0] ?? null;
    for (let p = 1; p < parents.length; p++) {
      if (!lanes.includes(parents[p])) allocLane(parents[p]);
    }
    laneCount = Math.max(laneCount, lanes.length);
  });

  // Pass 2: rows + edges.
  const rows: GraphRow[] = order.map((rev, idx) => ({
    rev,
    col: colOf.get(rev.signature) ?? 0,
    localOnly: remoteSignatures ? !remoteSignatures.has(rev.signature) : false,
  }));

  const edges: GraphEdge[] = [];
  order.forEach((rev, idx) => {
    const fromCol = colOf.get(rev.signature) ?? 0;
    const parents = rev.parents.length ? rev.parents : (rev.parent ? [rev.parent] : []);
    for (const p of parents) {
      const toRow = rowOf.get(p);
      if (toRow == null) continue; // parent not in the set (filtered/sparse) — skip the edge
      edges.push({ fromRow: idx, fromCol, toRow, toCol: colOf.get(p) ?? 0 });
    }
  });

  return { rows, edges, laneCount: Math.max(1, laneCount) };
}
