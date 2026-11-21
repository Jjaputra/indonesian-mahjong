PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, provider_sub TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT, picture TEXT, premium INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
  UNIQUE(provider, provider_sub)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE daily_matches (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wib_day TEXT NOT NULL, match_key TEXT NOT NULL,
  PRIMARY KEY(user_id, wib_day, match_key)
);
