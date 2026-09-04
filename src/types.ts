// ─── Storage / Upload ────────────────────────────────────────────────────────

export interface UploadedFile {
  originalname?: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface PublicUser {
  id: string;
  full_name: string;
  username: string;
  created_at: string;
  avatar_url: string | null;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface UserStats {
  photos: number;
  videos: number;
}

export interface ProfileData {
  user: PublicUser;
  stats: UserStats;
}

// ─── Photos / Feed ────────────────────────────────────────────────────────────

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
}

export interface ReactionEntry {
  emoji: string;
  username: string;
  full_name: string;
  user_id: string;
}

export interface CommentPreview {
  id: string;
  body: string;
  likeCount: number;
  myVote: 1 | -1 | null;
  author: {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string | null;
  };
}

export interface FeedItem {
  id: string;
  caption: string;
  created_at: string;
  url: string;
  media: MediaItem[];
  author: {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string | null;
  };
  isMine: boolean;
  reactions: ReactionEntry[];
  myReaction: string | null;
  commentsCount: number;
  likesCount: number;
  topComment: CommentPreview | null;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Videos ───────────────────────────────────────────────────────────────────

export interface VideoItem {
  id: string;
  message: string;
  url: string;
  size: number;
  created_at: string;
}
