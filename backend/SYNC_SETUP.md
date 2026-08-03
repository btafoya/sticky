# Sync Backend Setup

1. Copy `.env.example` to `.env`.

2. Generate the `STICKY_API_KEY`. Use any method that produces a long random
   string, for example:

   ```sh
   openssl rand -base64 32
   ```

   Put that value in `.env` as `STICKY_API_KEY`.

3. Edit `initdb/01-schema.sql` and replace the placeholder passwords with the
   same values from `.env`:
   - `CHANGEME-AUTHENTICATOR` → `AUTHENTICATOR_PASSWORD`
   - `CHANGEME-API-KEY` → `STICKY_API_KEY`

4. Start the stack:

   ```sh
   docker compose up -d
   ```

5. Add the Caddy site block from `caddy-notesync.txt` to your VPS Caddyfile and
   reload Caddy.

6. Verify with curl:

   ```sh
   curl -u sticky:$STICKY_API_KEY https://notesync.tafoyaventures.com/notes
   ```

## Rotating the API key

1. Stop the stack.
2. Update `STICKY_API_KEY` in `.env` and the `sticky` role password in
   `initdb/01-schema.sql`.
3. Run `docker compose up -d` to re-run the init scripts on a fresh volume, or
   execute `ALTER ROLE sticky WITH PASSWORD 'new-key';` inside the running
   database.
4. Update the API key in the app via gsettings.
