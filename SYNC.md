# Sticky Notes Sync

Optional cloud sync for Sticky Notes. Disabled by default.

## What it is

- PostgreSQL stores notes.
- PostgREST exposes a REST API.
- Caddy on your VPS terminates TLS and proxies to PostgREST.
- The Sticky app pushes changes automatically and pulls on startup + every sync interval.

## Deploy the backend

1. Copy the environment template and edit the secrets.

   ```sh
   cd backend
   cp .env.example .env
   # edit .env with strong passwords
   ```

2. Edit `backend/initdb/01-schema.sql` and replace the placeholder passwords
   with the same values from `.env`:
   - `CHANGEME-AUTHENTICATOR` → `AUTHENTICATOR_PASSWORD`
   - `CHANGEME-API-KEY` → `STICKY_API_KEY`

3. Start the stack.

   ```sh
   docker compose up -d
   ```

4. Add the Caddy site block to your VPS Caddyfile.

   ```sh
   sudo cat backend/caddy-notesync.txt >> /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

5. Verify.

   ```sh
   curl -u sticky:$STICKY_API_KEY https://notesync.tafoyaventures.com/notes
   ```

## Enable sync in the app

Use gsettings or dconf-editor:

```sh
gsettings set com.vixalien.sticky sync-enabled true
gsettings set com.vixalien.sticky sync-url 'https://notesync.tafoyaventures.com'
gsettings set com.vixalien.sticky sync-api-key 'your-api-key-from-env'
```

Restart Sticky Notes. The first launch will pull remote notes and merge them.

## Behavior

- Sync is opt-in. With sync disabled, the app works exactly as before.
- Local changes are pushed after a 2 second debounce.
- Failed pushes are retried with exponential backoff, up to 5 minutes.
- Conflicts are resolved by `modified` timestamp: newest wins.
- Deletions are hard deletes. A note deleted remotely is removed locally on the next pull if it was synced before.

## Rotate the API key

1. Change `STICKY_API_KEY` in `backend/.env`.
2. Update the PostgreSQL role:
   ```sql
   ALTER ROLE sticky WITH PASSWORD 'new-key';
   ```
3. Restart the stack:
   ```sh
   docker compose up -d
   ```
4. Update the API key in the app with gsettings.

## Files added

- `backend/docker-compose.yml`
- `backend/initdb/01-schema.sh`
- `backend/.env.example`
- `backend/caddy-notesync.txt`
- `src/sync.ts`
- `src/sync-queue.ts`
- Changes in `src/application.ts` and `data/com.vixalien.sticky.gschema.xml.in`
