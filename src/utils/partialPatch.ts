// Building a patch that carries only some of a file's changed lines, so a
// selection can be staged, unstaged or discarded without touching the rest.
//
// The rules are the ones `git add -p` uses when it lets you edit a hunk. Applying
// a patch forward, unselected additions have to disappear (they aren't being
// added) and unselected deletions have to become context (they're still there).
// Applying in reverse the roles swap: unselected additions become context, and
// unselected deletions disappear.

/** Which way the patch will be applied, which decides how unselected lines are treated. */
export type PatchDirection = 'forward' | 'reverse';

/** One line of a unified diff, as the line-selection view shows it. */
export interface DiffLine {
  // Index of this line in the diff text, which is how a selection names it.
  index: number;
  kind: 'header' | 'hunk' | 'add' | 'remove' | 'context' | 'meta';
  // The line without its leading marker, for display.
  text: string;
  // Line numbers on each side, where the line has one.
  oldNumber: number | null;
  newNumber: number | null;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/** True for the lines before the first hunk: 'diff --git', 'index', '---', '+++'. */
function isFileHeaderLine(line: string): boolean {
  return line.startsWith('diff ') || line.startsWith('index ') ||
         line.startsWith('--- ') || line.startsWith('+++ ') ||
         line.startsWith('old mode ') || line.startsWith('new mode ') ||
         line.startsWith('new file mode ') || line.startsWith('deleted file mode ') ||
         line.startsWith('similarity index ') || line.startsWith('rename from ') ||
         line.startsWith('rename to ') || line.startsWith('Binary files ');
}

/**
 * Walk a unified diff and describe every line, with the line numbers each side
 * would have. Only 'add' and 'remove' lines can be selected.
 */
export function listDiffLines(diff: string): DiffLine[] {
  const lines = diff.split('\n');
  const result: DiffLine[] = [];
  let oldNumber = 0;
  let newNumber = 0;
  let inHunk = false;

  lines.forEach((line, index) => {
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      inHunk = true;
      oldNumber = parseInt(hunk[1], 10);
      newNumber = parseInt(hunk[3], 10);
      result.push({ index, kind: 'hunk', text: line, oldNumber: null, newNumber: null });
      return;
    }

    if (!inHunk) {
      // A trailing empty line from the final newline isn't part of the diff.
      if (line === '' && index === lines.length - 1)
        return;
      result.push({
        index,
        kind: isFileHeaderLine(line) ? 'header' : 'meta',
        text: line,
        oldNumber: null,
        newNumber: null
      });
      return;
    }

    if (line.startsWith('+')) {
      result.push({ index, kind: 'add', text: line.slice(1), oldNumber: null, newNumber: newNumber++ });
    } else if (line.startsWith('-')) {
      result.push({ index, kind: 'remove', text: line.slice(1), oldNumber: oldNumber++, newNumber: null });
    } else if (line.startsWith('\\')) {
      // '\ No newline at end of file' belongs to the line above it.
      result.push({ index, kind: 'meta', text: line, oldNumber: null, newNumber: null });
    } else if (line === '' && index === lines.length - 1) {
      // The diff's own trailing newline.
    } else {
      const text = line.startsWith(' ') ? line.slice(1) : line;
      result.push({ index, kind: 'context', text, oldNumber: oldNumber++, newNumber: newNumber++ });
    }
  });

  return result;
}

/** The diff line indices that can be selected: the added and removed lines. */
export function selectableLineIndices(diff: string): number[] {
  return listDiffLines(diff)
    .filter(line => line.kind === 'add' || line.kind === 'remove')
    .map(line => line.index);
}

/**
 * Build a patch carrying only the selected lines.
 *
 * @param diff - The file's unified diff, as git produced it
 * @param selected - Diff line indices to include, as `listDiffLines` numbers them
 * @param direction - How the patch will be applied
 * @returns The patch, or null when the selection leaves nothing to apply
 */
export function buildPartialPatch(diff: string, selected: Iterable<number>,
                                  direction: PatchDirection): string | null {
  const wanted = new Set(selected);
  if (wanted.size === 0)
    return null;

  const lines = diff.split('\n');
  const header: string[] = [];
  const hunks: string[][] = [];

  // Split the diff into its header and its hunks, keeping each hunk's own lines.
  let current: string[] | null = null;
  for (const line of lines) {
    if (HUNK_HEADER.test(line)) {
      current = [line];
      hunks.push(current);
    } else if (current) {
      current.push(line);
    } else {
      header.push(line);
    }
  }

  if (hunks.length === 0)
    return null;

  const out: string[] = header.filter(line => line !== '');
  // Dropping and adding lines shifts every later hunk's position on the new side.
  let delta = 0;
  let emitted = 0;
  let lineIndex = header.length;

  for (const hunk of hunks) {
    const parsed = HUNK_HEADER.exec(hunk[0]);
    const oldStart = parseInt(parsed[1], 10);
    const section = parsed[5] || '';

    const body: string[] = [];
    let oldCount = 0;
    let newCount = 0;
    let changes = 0;

    // hunk[0] is the header, so its body starts one line further on.
    let index = lineIndex + 1;
    for (const line of hunk.slice(1)) {
      const at = index++;

      if (line.startsWith('\\')) {
        // Keep the no-newline marker with whatever line it followed.
        if (body.length > 0)
          body.push(line);
        continue;
      }

      if (line === '') {
        // The blank line that ends the diff text, not a diff line.
        continue;
      }

      if (line.startsWith('+')) {
        if (wanted.has(at)) {
          body.push(line);
          newCount++;
          changes++;
        } else if (direction === 'reverse') {
          // Applying in reverse, an addition we're keeping is part of the file
          // we start from, so it has to appear as context.
          body.push(` ${line.slice(1)}`);
          oldCount++;
          newCount++;
        }
        continue;
      }

      if (line.startsWith('-')) {
        if (wanted.has(at)) {
          body.push(line);
          oldCount++;
          changes++;
        } else if (direction === 'forward') {
          // Applying forward, a deletion we're not taking is still in the file.
          body.push(` ${line.slice(1)}`);
          oldCount++;
          newCount++;
        }
        continue;
      }

      const text = line.startsWith(' ') ? line.slice(1) : line;
      body.push(` ${text}`);
      oldCount++;
      newCount++;
    }

    // A hunk with nothing selected in it would only restate context.
    if (changes > 0) {
      out.push(`@@ -${oldStart},${oldCount} +${oldStart + delta},${newCount} @@${section}`);
      out.push(...body);
      emitted++;
      // Only the hunks that end up in the patch shift the new side, since only
      // their lines are applied.
      delta += newCount - oldCount;
    }

    lineIndex += hunk.length;
  }

  if (emitted === 0)
    return null;

  return `${out.join('\n')}\n`;
}
