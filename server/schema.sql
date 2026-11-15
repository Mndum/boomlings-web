-- D1 schema for the Boomlings web backend (accounts, cloud save, leaderboards, referral codes)
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  name_lc     TEXT    NOT NULL UNIQUE,
  pw_hash     TEXT    NOT NULL,          -- base64 PBKDF2-SHA256
  pw_salt     TEXT    NOT NULL,          -- base64
  ref_code    TEXT    NOT NULL UNIQUE,   -- this user's own referral code
  referred_by INTEGER REFERENCES users(id),
  earned_gold  INTEGER NOT NULL DEFAULT 0,  -- gold earned from referrals so far
  claimed_gold INTEGER NOT NULL DEFAULT 0,  -- part of it already handed to the client
  banned      INTEGER NOT NULL DEFAULT 0,
  ban_reason  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,           -- sha256 of the bearer token
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS saves (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT    NOT NULL,           -- the game's save JSON
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  best_score INTEGER NOT NULL DEFAULT 0, -- best single game
  best_level INTEGER NOT NULL DEFAULT 0, -- highest level reached
  icon       TEXT,                       -- icon id shown next to the name
  rank       INTEGER NOT NULL DEFAULT 1, -- player rank shown on the row
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores(best_level DESC, best_score DESC);

-- moderation actions taken from the admin site
CREATE TABLE IF NOT EXISTS admin_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  action      TEXT    NOT NULL,
  target_id   INTEGER,
  target_name TEXT,
  detail      TEXT
);

-- admin site sign-in: credentials are stored hashed, sessions expire, wrong guesses are rate limited per IP
CREATE TABLE IF NOT EXISTS admin_creds (
  user_lc TEXT PRIMARY KEY,
  pw_hash TEXT NOT NULL,
  pw_salt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_attempts (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_attempts_ip ON admin_attempts(ip, at);
