ALTER TABLE users ADD COLUMN referral_code TEXT;
CREATE UNIQUE INDEX users_referral_code ON users(referral_code);
ALTER TABLE users ADD COLUMN referred_by TEXT;
CREATE INDEX users_referred_by ON users(referred_by);
-- No user FK: this one-way identity marker must survive account deletion.
CREATE TABLE referred_identities (identity_hash TEXT PRIMARY KEY);
ALTER TABLE users ADD COLUMN bonus_matches INTEGER NOT NULL DEFAULT 0;
-- Keep the lifetime reward cap even if an invited account is later deleted.
ALTER TABLE users ADD COLUMN referral_rewards INTEGER NOT NULL DEFAULT 0;
CREATE TABLE share_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wib_day TEXT NOT NULL,
  PRIMARY KEY(user_id, wib_day)
);
ALTER TABLE daily_matches ADD COLUMN charged_bonus INTEGER NOT NULL DEFAULT 0;
CREATE INDEX daily_matches_key ON daily_matches(user_id, match_key);
-- Triggers run in the inserting statement's transaction, including concurrent signups/starts.
CREATE TRIGGER referral_reward AFTER INSERT ON users
WHEN NEW.referred_by IS NOT NULL
BEGIN
  UPDATE users SET bonus_matches=bonus_matches+3,referral_rewards=referral_rewards+1
    WHERE id=NEW.referred_by AND referral_rewards<10;
END;
CREATE TRIGGER spend_match_bonus AFTER INSERT ON daily_matches
WHEN NEW.charged_bonus=1
BEGIN
  UPDATE users SET bonus_matches=bonus_matches-1 WHERE id=NEW.user_id AND bonus_matches>0;
END;
