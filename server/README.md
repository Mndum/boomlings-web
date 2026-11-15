# Boomlings web backend (Cloudflare Worker + D1)

Accounts, cloud save, leaderboards, referral codes and free in-app purchases. The Worker serves `/api/*`; the game's static files are served by the same deployment, so everything is same-origin.

## Deploy (run these yourself, they need your Cloudflare login)

```
npm i -g wrangler
wrangler login
wrangler d1 create boomlings            # copy the database_id into wrangler.toml
wrangler d1 execute boomlings --remote --file=server/schema.sql
wrangler deploy
```

To keep it private, add a Cloudflare Access policy (Zero Trust, free up to 50 users) on the deployed hostname.

## API (JSON, `Authorization: Bearer <token>` after login)

| Route | Purpose |
|---|---|
| `POST /api/register {name,password,ref?}` | create account, optional referral code |
| `POST /api/login {name,password}` | token + profile |
| `GET /api/me` | profile, own referral code, referral count |
| `GET/PUT /api/save` | cloud save (`PUT {data, base}`; 409 + server copy if stale, `force` overrides) |
| `POST /api/score {score,level,icon}` | submit a result (keeps the best) |
| `GET /api/leaderboard?limit=50` | top list (level, then score) + your rank |
| `POST /api/redeem {code}` | enter someone's referral code (once per account) |
| `POST /api/claim` | collect referral gold not yet received |
| `GET /api/iap`, `POST /api/iap {pack}` | free gold packs |

Scores come from the client, so they cannot be verified. Add a Cloudflare rate-limiting rule on `/api/*` if the server is ever public.
