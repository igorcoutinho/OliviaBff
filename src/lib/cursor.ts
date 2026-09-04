export type FeedCursor = { createdAt: string; id: string };
export type CommentCursor = { likesCount: number; createdAt: string; id: string };

export function encodeFeedCursor(c: FeedCursor): string {
  return `${c.createdAt}|${c.id}`;
}

export function decodeFeedCursor(raw?: string | null): FeedCursor | null {
  if (!raw) return null;
  const sep = raw.indexOf('|');
  if (sep <= 0) {
    return { createdAt: raw, id: '' };
  }
  return {
    createdAt: raw.slice(0, sep),
    id: raw.slice(sep + 1),
  };
}

export function encodeCommentCursor(c: CommentCursor): string {
  return `${c.likesCount}|${c.createdAt}|${c.id}`;
}

export function decodeCommentCursor(raw?: string | null): CommentCursor | null {
  if (!raw) return null;
  const parts = raw.split('|');
  if (parts.length < 3) return null;
  const likesCount = Number(parts[0]);
  if (!Number.isFinite(likesCount)) return null;
  const id = parts[parts.length - 1]!;
  const createdAt = parts.slice(1, -1).join('|');
  if (!createdAt || !id) return null;
  return { likesCount, createdAt, id };
}
