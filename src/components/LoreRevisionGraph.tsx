import React, { useMemo } from 'react';
import { LoreRevision, computeGraphLayout } from '../lore';

interface LoreRevisionGraphProps {
  revisions: LoreRevision[];
  /** Current local HEAD signature (marked "HEAD"). */
  localHead?: string;
  /** Remote HEAD signature (marked "remote") — the sync boundary. */
  remoteHead?: string;
  selectedSignature?: string;
  onSelect: (rev: LoreRevision) => void;
  onContextMenu?: (e: React.MouseEvent, rev: LoreRevision) => void;
}

const ROW_H = 30;
const LANE_W = 18;
const PAD = 12;

// Distinct, theme-friendly colors cycled per lane.
const LANE_COLORS = ['#6ea8fe', '#7ee787', '#e0a030', '#c792ea', '#56d4dd', '#f48771'];

/**
 * Lore-centric revision graph: a lane-based DAG (handles branches + 2-parent merges) with the
 * revision NUMBER on each node and an explicit local-HEAD / remote-HEAD sync boundary — the
 * thing that matters in a centralized system. Layout is computed by the pure computeGraphLayout.
 */
function LoreRevisionGraph({ revisions, localHead, remoteHead, selectedSignature, onSelect, onContextMenu }: LoreRevisionGraphProps) {
  const layout = useMemo(() => computeGraphLayout(revisions), [revisions]);
  const { rows, edges, laneCount } = layout;

  const cx = (col: number) => PAD + col * LANE_W + LANE_W / 2;
  const cy = (row: number) => row * ROW_H + ROW_H / 2;
  const svgWidth = PAD * 2 + laneCount * LANE_W;
  const svgHeight = Math.max(rows.length * ROW_H, ROW_H);

  if (!rows.length) return <div className="lore-empty">no revisions</div>;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'auto' }}>
      <svg width={svgWidth} height={svgHeight} style={{ flexShrink: 0 }}>
        {edges.map((e, i) => {
          const color = LANE_COLORS[e.fromCol % LANE_COLORS.length];
          const x1 = cx(e.fromCol), y1 = cy(e.fromRow), x2 = cx(e.toCol), y2 = cy(e.toRow);
          const d = x1 === x2
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
          return <path key={i} d={d} stroke={color} strokeWidth={1.5} fill="none" />;
        })}
        {rows.map((r, i) => {
          const isMerge = (r.rev.parents.length || (r.rev.parent ? 1 : 0)) > 1;
          const isHead = r.rev.signature === localHead;
          const color = LANE_COLORS[r.col % LANE_COLORS.length];
          return (
            <g key={r.rev.signature} onClick={() => onSelect(r.rev)} style={{ cursor: 'pointer' }}>
              <circle cx={cx(r.col)} cy={cy(i)} r={isMerge ? 6 : 5} fill={isMerge ? 'var(--bg-primary)' : color} stroke={color} strokeWidth={2} />
              {isHead && <circle cx={cx(r.col)} cy={cy(i)} r={9} fill="none" stroke="var(--success-color)" strokeWidth={1.5} />}
            </g>
          );
        })}
      </svg>

      <div style={{ flex: 1, minWidth: 0 }}>
        {rows.map((r, i) => (
          <div
            key={r.rev.signature}
            className={`lore-row ${selectedSignature === r.rev.signature ? 'selected' : ''}`}
            style={{ height: ROW_H, boxSizing: 'border-box' }}
            onClick={() => onSelect(r.rev)}
            onContextMenu={(e) => onContextMenu?.(e, r.rev)}
            title={`revision ${r.rev.number} · ${r.rev.signature.slice(0, 12)}`}
          >
            <span className="lore-history-num">{r.rev.number}</span>
            <span className="lore-row-name">{r.rev.message}</span>
            {r.rev.signature === localHead && <span className="lore-chip active">HEAD</span>}
            {r.rev.signature === remoteHead && <span className="lore-chip">remote</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default LoreRevisionGraph;
