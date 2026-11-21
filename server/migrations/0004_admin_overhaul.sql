CREATE INDEX users_created_at ON users(created_at);
CREATE INDEX users_last_seen_at ON users(last_seen_at);
CREATE INDEX daily_matches_wib_day ON daily_matches(wib_day);
CREATE INDEX users_name ON users(name COLLATE NOCASE);
CREATE INDEX admin_changes_updated_at ON admin_changes(updated_at DESC);
CREATE TABLE setting_changes (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX setting_changes_updated_at ON setting_changes(updated_at DESC);
CREATE INDEX setting_changes_key_at ON setting_changes(key,updated_at);
INSERT INTO setting_changes(key,value,updated_at,updated_by)
SELECT key,value,updated_at,updated_by FROM settings WHERE updated_at IS NOT NULL AND updated_by IS NOT NULL;
