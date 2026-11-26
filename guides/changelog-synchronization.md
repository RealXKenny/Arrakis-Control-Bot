# Bot release history export

After a bot release has been published, run `node scripts/sync-dashboard-changelog.mjs <dashboard-worktree>` from the bot repository. The destination must already contain `docs/changelog/`. Review the resulting `docs/changelog/bot.md` diff in the dashboard checkout and include it in a dashboard pull request. The bot changelog remains the source of truth; the dashboard root changelog remains reserved for dashboard releases.

The script excludes the Unreleased section, validates dated stable version headings and rejects duplicate versions. It creates a temporary file before replacement, leaves an unchanged export alone, and refuses to overwrite a destination without its generated-file marker. Remove a leftover `.tmp` file only after checking that another synchronization is not running. Review the exported public notes before publication. A changelog heading is not proof that a GitHub release was published; do not run this against a branch containing an unpublished release heading.

The dashboard serves its reviewed snapshots through its public changelog API. Set the bot's `DASHBOARD_URL` to the dashboard HTTPS origin. The export requires no cross-repository token and does not commit, push, or publish either repository.

## Release and publication policy

1. A bot release is published automatically from `main` when `package.json` has a new stable version and a matching, non-empty `CHANGELOG.md` section. Never create the tag by hand.
2. After the GitHub release exists, run the export above against a dashboard checkout and open a dashboard pull request with the `docs/changelog/bot.md` diff. The export is manual on purpose: it needs no cross-repository token, and a person reviews the public notes before they reach the dashboard.
3. When the dashboard deploys that change, its changelog API serves the new version. The bot posts it on its next announcement check. The bot is the only Discord publisher for both products.
4. Posting is deterministic. The bot sorts releases by date, then product, then version (newest first), so every run and restart sees the same order. Each post is recorded in PostgreSQL right after it is sent, and a recorded or deleted post is never sent again. Stale or incomplete API data pauses posting instead of guessing.
5. The bot control center's panel refresh re-renders recorded release posts in place without reposting them.
