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
  take_gold   INTEGER NOT NULL DEFAULT 0,  -- coins an admin took away, removed from the player's save when they next connect
  wipe_gold   INTEGER NOT NULL DEFAULT 0,  -- 1 = admin set their coins to 0
  last_iap    INTEGER NOT NULL DEFAULT 0,  -- when they last took a free gold pack
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

-- live view: last heartbeat of each signed-in player (state + tiny canvas snapshot) and the pranks queued for them
CREATE TABLE IF NOT EXISTS live (
  user_id INTEGER PRIMARY KEY,
  seen    INTEGER NOT NULL,
  state   TEXT,
  thumb   TEXT
);
CREATE TABLE IF NOT EXISTS pranks (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  data    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS pranks_user ON pranks(user_id);

-- reviews from the public /rate/ page (one per browser: the client id is the key, so changing your mind updates it)
CREATE TABLE IF NOT EXISTS ratings (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  cid     TEXT    NOT NULL UNIQUE,
  stars   INTEGER NOT NULL,
  name    TEXT,
  comment TEXT,
  at      INTEGER NOT NULL,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS ratings_at ON ratings(at DESC);
