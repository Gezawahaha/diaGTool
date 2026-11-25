# AXS Diagnostic Lab

Offline-first diagnostic research tool for SRAM AXS components. The
specification and source of truth is [PROJECT.md](PROJECT.md).

Current status: **Version 0.1, Sprint 2 (BLE)**. The app can scan, connect,
discover GATT services, read readable characteristics and subscribe to
notifications — read-only, and not yet verified on a physical phone. Events
are kept in memory until Sprint 3 adds local storage. Firmware recovery is
not supported. See [docs/ble-research.md](docs/ble-research.md).

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

### Deploying

1. `npx wrangler d1 create axs-diagnostic-lab` and put the printed id into
   `[env.production]` in `services/api/wrangler.toml`.
2. `npm run db:migrate:remote -w @axs/api`
3. `npm run deploy -w @axs/api`

Secrets never go in `wrangler.toml` or source control; see
`services/api/.dev.vars.example`.

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
