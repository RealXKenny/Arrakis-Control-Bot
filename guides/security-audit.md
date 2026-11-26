# Security audit (V2, November 2026)

Scope: the whole `v2` branch before the December 1, 2026 launch. That covers command and component authorization, Discord output, SQL, outbound HTTP clients, attachment handling, secrets and logging, the (since removed) management dashboard, CI and release workflows, and dependencies. The review was done by reading the code and running the test suite against mocked external boundaries. Live Discord, PostgreSQL, Dune Console and Pterodactyl were not tested.

## Fixed

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | High | The bot served any guild that invited it. Commands open to everyone, the message archive, leveling and Dune Console lookups ran in foreign guilds, and the guild owner check in the bot control center trusted the owner of whichever guild the button was in. | `ALLOWED_GUILD_IDS` (default `GUILD_ID`). The bot leaves every other guild on startup and on join. As a safety check, it never leaves anything when none of the allowed guilds is in its guild list. |
| 2 | Medium | Slash commands were registered for DMs and user installs as well as guilds. | Every command is registered for guild installs and guild contexts only. |
| 3 | Medium | Dune Console route parameters of `.` or `..` survived `encodeURIComponent`, and URL resolution then turned them into a different endpoint called with the bot's API key. | `resolveRoute` rejects empty, `.` and `..` segments. |
| 4 | Medium | The blueprint audit copy was downloaded from the attachment URL with no host check, timeout or redirect policy. | Only `https://cdn.discordapp.com` and `media.discordapp.net` are accepted, with a 30-second timeout and redirects refused. |
| 5 | Low | Dune Console, Discord Adapter and attachment downloads followed redirects, and the Console and Adapter requests carry bearer credentials. | `redirect: "error"` on every credentialed and attachment request. |
| 6 | Low | Dune Console, Discord Adapter and Convoy response bodies were read without a size limit. | Bounded reads: 20 MB (Console), 1 MB (Adapter), 5 MB JSON and 25 MB binary (Convoy). |
| 7 | Low | The `StaffOnly` precondition allowed every user outside a guild (it is not currently attached to a command). | It now fails closed in DMs. |
| 8 | Low | Mentions in generated text depended on each call site setting `allowedMentions`. | The client default is `allowedMentions: { parse: [] }`. Call sites that need to ping opt in, as tickets and welcome messages already do. |
| 9 | Low | Development-only advisory in `minimatch` through `typescript-eslint`. | Fixed with `npm audit fix`; `npm audit` reports 0. |
| 10 | High (removed) | The in-bot management dashboard added an internet-facing HTTP listener, OAuth, sessions and a beta framework that needed a dependency override. | Removed before launch. The bot no longer listens on any port. |

## Reviewed with no change needed

- SQL is parameterized everywhere. The only interpolated values are code constants.
- Grouped commands check Owner or Staff roles at execution time, using the member roles Discord sends with each interaction (no REST round trip before acknowledging). Ticket close, claim and review, help, market and leaderboard sessions, voice rooms, staff application reviews and bot control all check the acting user.
- Backup imports and blueprint uploads accept only Discord-hosted HTTPS attachments with size limits.
- The logger redacts keys that look like tokens, passwords, secrets, cookies or sessions. No secrets were found in git history; the tracked `certificates/*.pem` files are public certificates only.
- CI runs with `contents: read`, actions are pinned by commit, and only the release publish job gets `contents: write`.

## Open items before or soon after launch

- Player-link verification codes are checked by the Discord Adapter service. Confirm on that service that codes are single-use, expire, and have an attempt limit. The bot only adds its per-user interaction cooldown.
- Set the Discord application to private ("Public Bot" off) in the developer portal as an extra layer on top of the guild allowlist.
- Rotate the bot token, Dune Console key and database password before launch if they were ever shared outside the deployment secrets.
