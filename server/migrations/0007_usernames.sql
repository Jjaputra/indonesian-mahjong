ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN username_key TEXT;
CREATE UNIQUE INDEX users_username_key ON users(username_key);
