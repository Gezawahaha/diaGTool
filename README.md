# AXS Diagnostic Lab

Offline-first diagnostic research tool for SRAM AXS components. The
specification and source of truth is [PROJECT.md](PROJECT.md).

Current status: **Version 0.1, Sprint 4 (auth and cloud sync)**. The app can
scan, connect, discover GATT services, read readable characteristics and
subscribe to notifications (read-only). Diagnostic sessions are stored in
on-device SQLite with user markers and JSON/CSV export, and can be synced
(opt-in) to the Worker API. Nothing has been verified on a physical phone or
a deployed Worker yet, and firmware recovery is not supported. See
[docs/ble-research.md](docs/ble-research.md).

### What gets stored

Events are written to SQLite only during a diagnostic session, and only for
that session's device. Other devices seen while scanning stay in memory and
are discarded. A session left active when the app stops is marked
`INTERRUPTED` on the next launch; its end time is recorded as unknown.

## Layout

| Path | What |
|---|---|
| `apps/mobile` | React Native 0.88 + TypeScript Android app (standalone npm project) |
| `services/api` | Cloudflare Worker REST API (Hono + Zod) with D1 |
| `services/api/migrations` | Versioned D1 SQL migrations |
| `packages/shared` | Enums and wire types shared by app and API |
| `docs` | Research and design notes |

`apps/mobile` is deliberately **not** an npm workspace: the Android Gradle
build references `../node_modules/@react-native/...` relative to the app,
which breaks when dependencies are hoisted to the repo root.

## Requirements

- Node **22.12+** (`nvm use` reads `.nvmrc`)
- npm **11** (npm 10 crashes resolving this workspace's peer dependencies;
  use `npx npm@11 install` if your Node ships npm 10)
- For the Android app: JDK 17 and Android Studio / Android SDK, plus a
  **physical Android phone** — emulators cannot reproduce real BLE behaviour.

## API (Cloudflare Worker)

```bash
npx npm@11 install                                  # from repo root
npm run db:migrate:local -w @axs/api                # apply D1 migrations locally
npm run api:dev                                     # wrangler dev
curl localhost:8787/api/v1/health
npm run api:test                                    # vitest in the Workers runtime
npm run typecheck
```

Local development needs a token signing secret: copy
`services/api/.dev.vars.example` to `services/api/.dev.vars` and fill it in.

### Deploying

1. `npx wrangler d1 create axs-diagnostic-lab` and put the printed id into
   `[env.production]` in `services/api/wrangler.toml`.
2. `npm run db:migrate:remote -w @axs/api`
3. Set the signing secret (at least 32 random characters):
   `npx wrangler secret put TOKEN_SIGNING_SECRET --env production`
4. `npm run deploy -w @axs/api`
5. Create the owner account (prompts for the password; at least 12 characters):
   `npm run owner:create -w @axs/api -- --email you@example.com --remote`
6. In the app: Settings → Server (your Worker URL) → Sign in → turn on
   "Upload diagnostic data".

Secrets never go in `wrangler.toml` or source control. Re-running
`owner:create` resets the password and signs out every phone.

### Authentication

- Email + password for a single owner account; there is no public sign-up.
- Passwords: PBKDF2-SHA256, 100,000 iterations (the Workers WebCrypto
  maximum), per-user salt. Five failed attempts lock the account for 15 min.
- Access tokens: HS256 JWT, 15 minutes, issuer/audience/expiry checked.
- Refresh tokens: random, stored hashed, 30-day sliding lifetime, rotated on
  every use; reusing a rotated token revokes that sign-in everywhere.
- On the phone the refresh token is kept in the Android Keystore
  (react-native-keychain); the access token only in memory.
- **Free-plan caveat (unverified):** login runs PBKDF2 and took about 16 ms
  wall time under local `wrangler dev`. If production logins fail with CPU
  limit errors on Workers Free, that is the cause; other requests are cheap.

### Sync

`POST /api/v1/sync/batch` takes up to 50 devices, 50 sessions and 200 events.
Records keep the IDs they were created with on the phone, so retries are
idempotent: re-sent events are reported as duplicates and never written
twice. Each record is accepted or rejected individually with a reason. D1
quota exhaustion is reported as `QUOTA_EXCEEDED` with `Retry-After` until the
UTC daily reset; the phone keeps everything and retries later.

### Error format

Every error response is JSON:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "…", "request_id": "…",
             "issues": [{ "path": "events.3.event_type", "message": "…" }] } }
```

Each response carries an `X-Request-Id` header matching `request_id`.

## Mobile app

```bash
cd apps/mobile
npx npm@11 install
npm run typecheck && npm test && npm run lint
npm start            # Metro
npm run android      # needs JDK + Android SDK + a connected phone
```
