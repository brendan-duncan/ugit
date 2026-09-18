// Post-processing the rendered diff: highlighting search hits, and making
// whitespace visible.
//
// The diff is rendered to HTML by diff2html, so these are done by walking the
// text of the code lines afterwards rather than by changing the markup that
// produced them. Only the line-content spans are touched, so line numbers and
// hunk headers can't turn into false matches.

const CONTENT_SELECTOR = '.d2h-code-line-ctn';

export interface DecorateOptions {
  /** Text to highlight, case-insensitively. Empty highlights nothing. */
  query?: string;
  /** Draw tabs, trailing spaces and carriage returns. */
  showWhitespace?: boolean;
}

/** Class put on every search hit, and on the one currently stepped to. */
export const HIT_CLASS = 'diff-search-hit';
export const CURRENT_HIT_CLASS = 'diff-search-hit-current';

/** Replace a run of whitespace with something visible. */
function whitespaceSpan(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'diff-whitespace-mark';
  // A tab reads better as an arrow that keeps its width; a space as a dot.
  span.textContent = text
    .replace(/\t/g, '→\t')
    .replace(/\r/g, '␍')
    .replace(/ /g, '·');
  span.title = text.includes('\t') ? 'Tab' : text.includes('\r') ? 'Carriage return' : 'Trailing space';
  return span;
}

/**
 * Split one text node into the fragment that replaces it: search hits wrapped so
 * they can be highlighted and stepped through, and whitespace made visible.
 * @returns How many search hits it contained
 */
function decorateTextNode(node: Text, options: DecorateOptions): number {
  const text = node.nodeValue || '';
  if (!text)
    return 0;

  const query = (options.query || '').toLowerCase();
  const fragment = document.createDocumentFragment();
  let hits = 0;

  // Add a stretch of plain text, breaking out whitespace if that's on.
  const appendPlain = (value: string, parent: Node) => {
    if (!value)
      return;

    if (!options.showWhitespace) {
      parent.appendChild(document.createTextNode(value));
      return;
    }

    // Tabs and carriage returns anywhere, and spaces only at the end of the
    // line, where they're invisible and often unintended.
    const trailing = /([ ]+)$/.exec(value);
    const body = trailing ? value.slice(0, trailing.index) : value;

    let cursor = 0;
    for (const match of body.matchAll(/[\t\r]+/g)) {
      if (match.index > cursor)
        parent.appendChild(document.createTextNode(body.slice(cursor, match.index)));
      parent.appendChild(whitespaceSpan(match[0]));
      cursor = match.index + match[0].length;
    }
    if (cursor < body.length)
      parent.appendChild(document.createTextNode(body.slice(cursor)));

    if (trailing)
      parent.appendChild(whitespaceSpan(trailing[1]));
  };

  if (!query) {
    appendPlain(text, fragment);
    node.parentNode?.replaceChild(fragment, node);
    return 0;
  }

  const haystack = text.toLowerCase();
  let cursor = 0;
  let found = haystack.indexOf(query, 0);
  while (found !== -1) {
    appendPlain(text.slice(cursor, found), fragment);

    const mark = document.createElement('mark');
    mark.className = HIT_CLASS;
    appendPlain(text.slice(found, found + query.length), mark);
    fragment.appendChild(mark);
    hits++;

    cursor = found + query.length;
    found = haystack.indexOf(query, cursor);
  }
  appendPlain(text.slice(cursor), fragment);

  node.parentNode?.replaceChild(fragment, node);
  return hits;
}

/**
 * Decorate a rendered diff in place.
 *
 * The caller resets the container's markup first (by re-assigning the HTML
 * diff2html produced), so this always starts from undecorated content.
 *
 * @returns The number of search hits, in document order
 */
export function decorateDiff(container: HTMLElement, options: DecorateOptions): number {
  if (!options.query && !options.showWhitespace)
    return 0;

  const lines = container.querySelectorAll(CONTENT_SELECTOR);
  const roots: Element[] = lines.length > 0 ? Array.from(lines) : [container];

  let hits = 0;
  for (const root of roots) {
    // Collect the text nodes before changing any of them; replacing a node
    // while walking would cut the walk short.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current as Text);
      current = walker.nextNode();
    }

    for (const node of nodes)
      hits += decorateTextNode(node, options);
  }

  return hits;
}

/**
 * Mark the nth hit as the current one and scroll it into view.
 * @param index - Zero-based position among the hits
 */
export function focusHit(container: HTMLElement, index: number): void {
  const hits = container.querySelectorAll(`.${HIT_CLASS}`);
  hits.forEach(hit => hit.classList.remove(CURRENT_HIT_CLASS));

  const hit = hits[index] as HTMLElement | undefined;
  if (!hit)
    return;

  hit.classList.add(CURRENT_HIT_CLASS);
  hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
