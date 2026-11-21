ALTER TABLE users ADD COLUMN news_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(news_opt_in IN (0,1));
ALTER TABLE users ADD COLUMN news_opt_in_at INTEGER;
CREATE TABLE account_rooms (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL, seat TEXT NOT NULL, last_activity INTEGER NOT NULL
);
CREATE INDEX account_rooms_code ON account_rooms(code);
