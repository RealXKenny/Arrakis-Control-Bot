# Bot release history export

After a bot release has been published, run `node scripts/sync-dashboard-changelog.mjs <dashboard-worktree>` from the bot repository. The destination must already contain `docs/changelog/`. Review the resulting `docs/changelog/bot.md` diff in the dashboard checkout and include it in a dashboard pull request. The bot changelog remains the source of truth; the dashboard root changelog remains reserved for dashboard releases.

The script excludes the Unreleased section, validates dated stable version headings and rejects duplicate versions. It creates a temporary file before replacement, leaves an unchanged export alone, and refuses to overwrite a destination without its generated-file marker. Remove a leftover `.tmp` file only after checking that another synchronization is not running. Review the exported public notes before publication. A changelog heading is not proof that a GitHub release was published; do not run this against a branch containing an unpublished release heading.

This export alone does not implement the dashboard API, the dashboard presentation, or bot retrieval. It requires no cross-repository token and does not commit, push, or publish either repository.
