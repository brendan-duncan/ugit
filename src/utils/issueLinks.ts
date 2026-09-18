// Turning issue references in commit messages into links.
//
// What counts as a reference differs per project - '#123', 'JIRA-456', 'GH-7' -
// so the pattern and the URL both come from settings rather than being guessed.

/** A piece of a commit message: either plain text or a reference to link. */
export interface MessagePart {
  text: string;
  /** Where this part points, or null for plain text. */
  url: string | null;
}

/** A bare URL in a message is worth linking whatever the issue settings say. */
const BARE_URL = /https?:\/\/[^\s<>()[\]{}"']+/g;

/**
 * Split a message into parts, linking issue references and bare URLs.
 *
 * @param message - The commit message
 * @param pattern - Regular expression for a reference, first group being the id
 * @param urlTemplate - URL with `{id}` where the id goes; '' disables linking
 */
export function linkifyMessage(message: string, pattern: string, urlTemplate: string): MessagePart[] {
  if (!message)
    return [];

  // Bare URLs first, so an issue pattern can't chop one in half.
  const parts: MessagePart[] = [];
  let lastIndex = 0;
  for (const match of message.matchAll(BARE_URL)) {
    if (match.index > lastIndex)
      parts.push({ text: message.slice(lastIndex, match.index), url: null });
    parts.push({ text: match[0], url: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < message.length)
    parts.push({ text: message.slice(lastIndex), url: null });

  if (!pattern || !urlTemplate)
    return parts;

  let issue: RegExp;
  try {
    issue = new RegExp(pattern, 'g');
  } catch (error) {
    // A pattern the user is still typing shouldn't break the commit list.
    return parts;
  }

  const linked: MessagePart[] = [];
  for (const part of parts) {
    if (part.url !== null) {
      linked.push(part);
      continue;
    }

    issue.lastIndex = 0;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = issue.exec(part.text)) !== null) {
      // A pattern that can match nothing would loop for ever.
      if (match[0].length === 0) {
        issue.lastIndex++;
        continue;
      }

      if (match.index > cursor)
        linked.push({ text: part.text.slice(cursor, match.index), url: null });

      // Without a capture group the whole match is the id.
      const id = match[1] !== undefined ? match[1] : match[0];
      linked.push({ text: match[0], url: urlTemplate.replace('{id}', encodeURIComponent(id)) });
      cursor = match.index + match[0].length;
    }

    if (cursor < part.text.length)
      linked.push({ text: part.text.slice(cursor), url: null });
  }

  return linked;
}
