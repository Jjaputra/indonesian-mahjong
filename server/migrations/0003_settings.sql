CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER, updated_by TEXT);
CREATE TABLE admin_changes(id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, premium INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL);
