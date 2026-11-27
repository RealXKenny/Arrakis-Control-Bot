# Automatic updates

## Overview

Pterodactyl servers (and any direct Node.js install that starts the supervisor) can install new bot releases on their own.
`scripts/updater/supervisor.mjs` runs the bot as its only child process and uses
`scripts/updater/updater.mjs` to find, verify, stage, install and, if needed, roll back a release. The dashboard
ships an identical copy under `scripts/deployment/updater/`.

The design rule is simple: **only files that a verified release manifest says belong to the application are ever
written, replaced or removed**, plus the generated `node_modules` and `dist` folders. Everything else in
`/home/container` (your `.env`, RabbitMQ certificates and keys, uploads, logs, custom folders, files you added inside
`src/`) is never moved, rewritten, deleted or re-permissioned, wherever it lives.

## What happens during an update

1. **Check.** At startup (`AUTO_UPDATE_ON_STARTUP`) and every `AUTO_UPDATE_INTERVAL_HOURS` (with ±10% jitter), the
   supervisor lists GitHub releases with a conditional request. Drafts are ignored; prereleases only on
   `AUTO_UPDATE_CHANNEL=prerelease`; `RELEASE_TAG=vX.Y.Z` holds that exact version. Nothing older than the installed
   version is ever selected.
2. **Download and verify.** The archive, its `.sha256` and, from now on, a `.manifest.json` listing every file's SHA-256 are
   downloaded only from `https://github.com/RealXKenny/Arrakis-Control-Bot/releases/download/<tag>/`. The archive
   must match the checksum, GitHub's own asset digest when present, and the manifest.
3. **Extract safely.** A streaming reader accepts plain files and folders only. Links, devices, absolute paths, `..`
   paths, `.env*` files (other than `.env.example`), `.git`, `.arrakis` and generated folders are refused.
4. **Check configuration.** The new `package.json` declares the settings it needs (`arrakisRelease.requiredEnv`). If one
   is missing from the environment and `.env`, the update stops with the variable's name. Your values are never changed.
5. **Build in staging.** `npm ci`, `npm run build`, `npm prune --omit=dev` and a check that the native `canvas` module
   loads run in `.arrakis/staging/<version>` with a minimal environment: panel secrets never reach dependency scripts.
   `canvas` downloads a prebuilt binary during `npm ci`; if that is not possible in the runtime image, the update stops
   and the current version keeps running.
6. **Plan.** Each file the release ships is compared with what is on disk and with what the previous release installed:
   - unchanged since it was installed: replaced;
   - **changed locally**: conflict;
   - **an unmanaged file already at a path the release now uses**: conflict;
   - reached through a symbolic link: conflict;
   - a file the new release no longer ships: removed only if unchanged, otherwise kept and logged.

   Any conflict stops the update **before anything is touched**, and every conflicting path is logged.

7. **Install.** Only now is the bot stopped (`SIGINT`, the same as the panel's stop). Every replaced or removed file
   is backed up to `.arrakis/backups/`, each step is journaled, files keep their existing permissions, new files get the
   release's executable bit only, and the generated folders are swapped by rename.
8. **Health check.** The new version must print its ready line (`Discord shard N is ready.`) and still be
   running after `AUTO_UPDATE_HEALTH_SECONDS`. Then the journal is cleared and only the two newest backups are kept.
9. **Rollback.** If it exits or never becomes ready, the journal is replayed in reverse, the previous version starts again
   and the failed version is never selected automatically again. If the container stops in the middle of an install or
   before the health check passes, the same rollback runs at the next start.

The supervisor never restarts a crashing application in a loop. If the bot exits on its own, the supervisor exits
with the same code and Wings' normal crash handling applies. A failed check, a GitHub outage or a conflict only logs one
line; the current version keeps running.

## Settings

| Variable                     | Default  | Meaning                                                                              |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `AUTO_UPDATE_ENABLED`        | `true`   | `false` turns every check off                                                        |
| `AUTO_UPDATE_ON_STARTUP`     | `true`   | Check (and install) before the bot starts                                            |
| `AUTO_UPDATE_CHANNEL`        | `stable` | `prerelease` also installs release candidates                                        |
| `RELEASE_TAG`                | `latest` | `vX.Y.Z` pins that version; it is installed if newer and then held                   |
| `AUTO_UPDATE_INTERVAL_HOURS` | `6`      | 1 to 168                                                                             |
| `AUTO_UPDATE_WINDOW_UTC`     | empty    | `HH:MM-HH:MM` (may wrap midnight). Background installs wait for it; startup does not |
| `AUTO_UPDATE_HEALTH_SECONDS` | `120`    | 30 to 900                                                                            |
| `AUTO_UPDATE_GITHUB_TOKEN`   | empty    | Optional fine-grained token with read-only access; only raises GitHub's rate limit   |

A malformed setting never keeps the bot down: updates switch off and the console says which setting to fix.

## Files the updater keeps

`.arrakis/` (owner-only permissions) holds `installed.json` (the hash of every installed file), `state.json` (release
cache, versions that failed, last check), the lock, the journal, staging, downloads and backups. Do not edit it; deleting
it is safe while no update runs (the next update rebuilds the install record from the installed release).

## Database migrations

Updates never touch PostgreSQL directly, but a new bot version applies its pending migrations when it starts, and an
older bot refuses to start against a newer schema ("The database schema is at version N, but this bot only knows up to
M"). So if a release that contains a migration fails its health check, the automatic rollback restores the old files but
the old bot then stops with that message instead of running on a schema it does not understand. Recover by restoring the
database backup and restarting, or by fixing the problem and installing the newer release again. Releases list migrations
under **Upgrade Notes**: take a database backup before they install, or set `AUTO_UPDATE_WINDOW_UTC` to a time you are
around.

## Migrating an existing server

Servers installed before automatic updates (2.0.0) have no updater, start the application directly and ignore the new
variables. Moving one over is a one-time change:

1. Back up PostgreSQL and download a copy of `/home/container` (at least `.env` and any certificates).
2. Import the new egg from the latest release over the old one (_Admin → Nests → Import Egg_, choosing the existing egg to
   update it).
3. Reinstall the server (_Settings → Reinstall Server_). On a 2.0.0 install the installer verifies the newest release and
   adds only its updater files and `.arrakis/bootstrap.json`, which holds the release settings an old `package.json`
   lacks. No existing file is changed, so `.env`, certificates and your own files stay as they are.
4. Set the startup command under _Admin → Servers → (server) → Startup_ to
   `cd /home/container && exec node scripts/updater/supervisor.mjs`. Importing an egg does not change the startup command of a server
   that already exists.
5. Add the new variables if the panel did not (defaults above), and set `AUTO_UPDATE_ENABLED=false` first if you want to
   watch the first update by hand.
6. Restart. The first check reads the installed release's own checksummed archive to learn which files it manages, so
   files you changed are detected as conflicts rather than overwritten, and then installs the newest release. If your
   installed version has no checksummed archive (very old releases), the check stops and says so; install a current
   release once by hand.

**Reinstall** from the panel never overwrites an existing installation: once the updater is in place, the installer sees
it and exits without changing anything. To start completely fresh, back up your files, empty the server's files, then
reinstall.

## Resolving a conflict

The console lists each path, for example `Conflict: src/index.ts (modified locally since it was installed)`.

- To keep your change: leave it; the bot keeps running the current version, and the update is retried later.
- To accept the release: move your file somewhere outside the managed paths (or restore it from the release archive),
  then restart.
- An unmanaged file at a new path: rename or move it; the release needs that path.

## Manual rollback

Set `AUTO_UPDATE_ENABLED=false`, then follow [operations](operations.md): automatic updates never downgrade, because
older code may not understand a newer database schema.

## Not verified

The updater is covered by automated tests (custom files in nested folders and paths with spaces, permissions and
certificates preserved, conflicts, corrupted and hostile archives, checksum and manifest mismatches, symbolic links,
missing configuration, build failures, GitHub outages, locking, rollback and interrupted-install recovery, signal
forwarding). It has **not** yet been run on a live Pterodactyl panel with Wings; try it on a throwaway server first.
