import crypto from 'crypto';

// Author pictures come from Gravatar, which identifies people by a hash of their
// email address. That means looking one up tells gravatar.com that this email was
// seen, so the setting behind this is off unless the user turns it on.

/**
 * Gravatar URL for an email address.
 * @param email - The author's email as git recorded it
 * @param size - Pixel size of the (square) image
 */
export function avatarUrl(email: string, size: number = 32): string {
  // Gravatar hashes the trimmed, lower-cased address.
  const hash = crypto.createHash('md5').update((email || '').trim().toLowerCase()).digest('hex');
  // d=identicon gives a generated picture rather than a broken image for the
  // many addresses with no Gravatar account.
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}

/** Initials to show in place of a picture, for when avatars are off. */
export function authorInitials(name: string): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0)
    return '?';
  if (words.length === 1)
    return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
