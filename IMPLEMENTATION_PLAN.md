# Sticky Notes Sync Backend + Integration

## Goal
Add a lightweight Docker-hosted sync backend (PostgreSQL + PostgREST) that the Sticky app can optionally use, plus the in-app code to sync notes automatically.

## Decisions from Q&A
- Sync server: lightweight custom sync backend, not Matrix Synapse.
- Integration depth: full — backend stack + app changes.
- PostgreSQL: runs inside the same Docker Compose stack.
- API architecture: app talks directly to PostgREST over HTTPS.
- Auth: single shared API key via PostgreSQL Basic Auth (role `sticky`, password = API key).
- Public hostname: `notesync.tafoyaventures.com`.
- Caddy: add site block to existing Caddyfile.
- Sync timing: automatic on note changes, debounced.
- Conflict resolution: last-write-wins by `modified` timestamp.
- Offline behavior: queue changes and retry when online.
- Deletions: hard delete on the server.

## Stage 1: Backend stack (server-side only)
**Goal**: Deployable Docker Compose + Caddy config.
**Status**: Complete.

**Files added**:
- `backend/docker-compose.yml` — postgres + postgrest services.
- `backend/initdb/01-schema.sh` — roles, `notes` table, permissions (env-driven).
- `backend/caddy-notesync.txt` — snippet to paste into the VPS Caddyfile.
- `backend/.env.example` — template for `POSTGRES_PASSWORD`, `AUTHENTICATOR_PASSWORD`, `STICKY_API_KEY`.

**Verification**:
- `docker compose config` parses successfully.

## Stage 2: App settings for sync
**Goal**: Let users enable/disable sync and configure URL/key.
**Status**: Complete.

**Files edited**:
- `data/com.vixalien.sticky.gschema.xml.in` — added:
  - `sync-enabled` (bool)
  - `sync-url` (string)
  - `sync-api-key` (string)
  - `sync-interval-seconds` (int, default 30)
- `src/meson.build` — added `sync.ts` and `sync-queue.ts` to sources.
- `.gitignore` — ignore `backend/.env`.

## Stage 3: Sync client module
**Goal**: One reusable module that talks to PostgREST.
**Status**: Complete.

**Files added**:
- `src/sync.ts` — `SyncClient` using libsoup 3.0; GET / POST (upsert) / DELETE with Basic Auth.
- `src/sync-queue.ts` — debounced push/delete queue, exponential retry, last-write-wins merge, hard-delete propagation.

**Verification**:
- `npx tsc --noEmit` only shows the pre-existing `gi-types` import errors; no new errors in the new files beyond those.

## Stage 4: Wire sync into app lifecycle
**Goal**: Trigger sync at the right times.
**Status**: Complete.

**Files edited**:
- `src/application.ts` —
  - `init_sync()` creates `SyncQueue` if enabled and triggers a startup sync.
  - `watch_note()` connects `notify::modified` to `save_note` + sync push.
  - `delete_note()` enqueues a remote delete.
  - `vfunc_shutdown()` flushes and stops the queue.
  - `merge_remote_notes()` updates in-memory notes and the list store when remote changes arrive.
  - `delete_local_note()` helper avoids re-enqueueing remote deletions.

**Merge rules implemented**:
- If remote note exists and `remote.modified > local.modified`, overwrite local.
- If local note is newer, push local to server.
- If note exists locally but not remotely and was synced before, delete locally.
- If note exists remotely but not locally, create it locally.

## Stage 5: Packaging & deployment notes
**Goal**: Document how to deploy and verify.
**Status**: Complete.

**Files added**:
- `SYNC.md` — deploy, enable, rotate key, behavior.

## Testing notes
- `yarn typecheck` / `meson compile` cannot run in this environment because the `gi-types` submodule is empty. The pre-existing CI/build environment pulls it via `git submodule update --init`.
- `npx tsc --noEmit` confirms no new TypeScript errors were introduced in the new/modified files beyond the expected `gi://` type-resolution failures.
- Backend config validated with `docker compose config`.

## Rollback / safety
- Sync is opt-in via `sync-enabled` setting; default off.
- All existing local-only behavior remains unchanged when sync is disabled.
- API key stored in user GSettings (not committed to repo).
