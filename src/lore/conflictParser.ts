// Pure parsing of Lore's diff3 conflict markers into segments, and composing a resolution.
// Lore writes conflicted files as:
//   <<<<<<< ours
//   ...ours lines...
//   ||||||| original
//   ...base lines...
//   =======
//   ...theirs lines...
//   >>>>>>> theirs
// (the "original" / base section may be absent for add/add conflicts).

import { ConflictSegment, ConflictChoice } from './types';

const START = '<<<<<<<';
const BASE = '|||||||';
const SEP = '=======';
const END = '>>>>>>>';

/** Split a conflicted file's content into stable + conflict segments. */
export function parseConflictSegments(content: string): ConflictSegment[] {
  const lines = content.split('\n');
  // Drop a trailing empty line from a final newline so we don't emit a phantom blank.
  if (lines.length && lines[lines.length - 1] === '') lines.pop();

  const segments: ConflictSegment[] = [];
  let stable: string[] = [];
  let i = 0;

  const flushStable = () => { if (stable.length) { segments.push({ type: 'stable', lines: stable }); stable = []; } };

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(START)) {
      flushStable();
      const ours: string[] = [];
      const base: string[] = [];
      const theirs: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(BASE) && !lines[i].startsWith(SEP)) ours.push(lines[i++]);
      if (i < lines.length && lines[i].startsWith(BASE)) {
        i++;
        while (i < lines.length && !lines[i].startsWith(SEP)) base.push(lines[i++]);
      }
      if (i < lines.length && lines[i].startsWith(SEP)) i++;
      while (i < lines.length && !lines[i].startsWith(END)) theirs.push(lines[i++]);
      if (i < lines.length && lines[i].startsWith(END)) i++; // consume the >>>>>>> line
      segments.push({ type: 'conflict', ours, base, theirs });
    } else {
      stable.push(line);
      i++;
    }
  }
  flushStable();
  return segments;
}

/** True when the content still contains conflict markers (unresolved). */
export function hasConflictMarkers(content: string): boolean {
  return content.split('\n').some(l => l.startsWith(START) || l.startsWith(SEP) || l.startsWith(END));
}

/** Number of conflict blocks in the content. */
export function countConflicts(segments: ConflictSegment[]): number {
  return segments.filter(s => s.type === 'conflict').length;
}

function pickLines(seg: { ours: string[]; base: string[]; theirs: string[] }, choice: ConflictChoice): string[] {
  switch (choice) {
    case 'ours': return seg.ours;
    case 'theirs': return seg.theirs;
    case 'base': return seg.base;
    case 'both-ot': return [...seg.ours, ...seg.theirs];
    case 'both-to': return [...seg.theirs, ...seg.ours];
  }
}

/**
 * Compose a resolved file from segments + per-conflict choices. `choices[k]` applies to the
 * k-th conflict segment (in order); a string[] overrides with manually-edited lines.
 */
export function composeResolution(
  segments: ConflictSegment[],
  choices: Array<ConflictChoice | string[] | undefined>,
): string {
  const out: string[] = [];
  let conflictIndex = 0;
  for (const seg of segments) {
    if (seg.type === 'stable') {
      out.push(...seg.lines);
    } else {
      const choice = choices[conflictIndex++];
      if (Array.isArray(choice)) out.push(...choice);
      else out.push(...pickLines(seg, choice ?? 'ours'));
    }
  }
  return out.length ? out.join('\n') + '\n' : '';
}
