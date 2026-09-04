CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_key VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS videos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  message TEXT,
  storage_key VARCHAR(500) NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_videos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_videos_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS photos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  caption TEXT,
  storage_key VARCHAR(500) NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  likes_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_photos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_photos_user (user_id),
  KEY idx_photos_created (created_at),
  KEY idx_photos_feed (created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  photo_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reactions_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_reactions_photo_user (photo_id, user_id),
  KEY idx_reactions_photo (photo_id),
  KEY idx_reactions_photo_created (photo_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS photo_media (
  id CHAR(36) NOT NULL PRIMARY KEY,
  photo_id CHAR(36) NOT NULL,
  type VARCHAR(10) NOT NULL DEFAULT 'image',
  storage_key VARCHAR(500) NOT NULL,
  thumbnail_key VARCHAR(500) NULL,
  order_index INT NOT NULL DEFAULT 0,
  size INT DEFAULT 0,
  KEY idx_photo_media_photo_id (photo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  recipient_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NOT NULL,
  photo_id CHAR(36) NOT NULL,
  type VARCHAR(32) NOT NULL,
  emoji VARCHAR(16) NULL,
  target_id VARCHAR(36) NOT NULL DEFAULT '',
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notifications_event (recipient_id, actor_id, photo_id, type, target_id),
  KEY idx_notifications_recipient (recipient_id, created_at),
  KEY idx_notifications_unread (recipient_id, read_at),
  CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  photo_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  likes_count INT NOT NULL DEFAULT 0,
  dislikes_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comments_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_comments_photo_created (photo_id, created_at, id),
  KEY idx_comments_photo_likes (photo_id, likes_count, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comment_votes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  comment_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  vote TINYINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comment_votes_comment FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_votes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_comment_votes_user (comment_id, user_id),
  KEY idx_comment_votes_comment_vote (comment_id, vote)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_versions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  version VARCHAR(32) NOT NULL,
  platform VARCHAR(16) NOT NULL DEFAULT 'all',
  status VARCHAR(16) NOT NULL DEFAULT 'inativo',
  title VARCHAR(200) NULL,
  description_ios TEXT NULL,
  description_android TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_app_versions_status_platform (status, platform),
  KEY idx_app_versions_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_version_settings (
  id TINYINT NOT NULL PRIMARY KEY,
  contact_name VARCHAR(120) NULL,
  contact_info TEXT NULL,
  store_url_ios VARCHAR(500) NULL,
  store_url_android VARCHAR(500) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_version_settings (id, contact_name, contact_info)
VALUES (
  1,
  'Igor',
  'Se precisar de ajuda para atualizar, entre em contato com o Igor.'
);
