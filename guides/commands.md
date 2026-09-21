# Command groups

The bot registers 14 top-level commands. Related actions are subcommands; options and access checks are preserved. Restart to synchronize the command list and remove retired standalone names.

| Previous command | New command | Access |
| --- | --- | --- |
| `/reload` | `/bot reload` | Owner |
| `/info` | `/bot info` | Everyone |
| `/ping` | `/bot ping` | Everyone |
| `/userinfo` | `/bot userinfo` | Everyone |
| `/ban` | `/moderation ban` | Staff |
| `/kick` | `/moderation kick` | Staff |
| `/timeout` | `/moderation timeout` | Staff |
| `/purge` | `/moderation purge` | Staff |
| `/ban-player` | `/player actions ban` | Owner |
| `/kick-player` | `/player actions kick` | Owner |
| `/player-ban-status` | `/player actions ban-status` | Owner |
| `/repair-login-queue` | `/player actions repair-login-queue` | Owner |
| `/spawn-player-vehicle` | `/player actions spawn-vehicle` | Owner |
| `/teleport-player` | `/player actions teleport` | Owner |
| `/unban-player` | `/player actions unban` | Owner |
| `/kick-all-online` | `/player bulk kick-all-online` | Owner |
| `/players` | `/player list` | Everyone |
| `/profile` | `/player profile` | Everyone |
| `/augment-player-item` | `/player equipment augment-item` | Owner |
| `/refuel-player-vehicle` | `/player equipment refuel-vehicle` | Owner |
| `/repair-player-gear` | `/player equipment repair-gear` | Owner |
| `/repair-vehicle-decay` | `/player equipment repair-vehicle-decay` | Owner |
| `/delete-inventory-item` | `/player inventory delete-item` | Owner |
| `/modify-inventory-item` | `/player inventory modify-item` | Owner |
| `/add-player-xp` | `/player items add-xp` | Owner |
| `/give-item-id` | `/player items give-item-id` | Owner |
| `/give-item` | `/player items give-item` | Owner |
| `/give-items` | `/player items give-items` | Owner |
| `/refill-player-water` | `/player items refill-water` | Owner |
| `/set-skill-module` | `/player items set-skill-module` | Owner |
| `/set-skill-points` | `/player items set-skill-points` | Owner |
| `/add-faction-reputation` | `/player progression faction-reputation` | Owner |
| `/add-player-currency` | `/player progression add-currency` | Owner |
| `/add-player-intel` | `/player progression add-intel` | Owner |
| `/add-specialization-xp` | `/player progression specialization-add-xp` | Owner |
| `/assign-player-faction` | `/player progression assign-faction` | Owner |
| `/complete-journey-node` | `/player progression journey-complete` | Owner |
| `/complete-tutorial` | `/player progression tutorial-complete` | Owner |
| `/grant-all-keystones` | `/player progression keystones-grant-all` | Owner |
| `/max-specialization` | `/player progression specialization-max` | Owner |
| `/reset-all-keystones` | `/player progression keystones-reset-all` | Owner |
| `/reset-journey-node` | `/player progression journey-reset` | Owner |
| `/reset-specialization` | `/player progression specialization-reset` | Owner |
| `/reset-tutorial` | `/player progression tutorial-reset` | Owner |
| `/unlock-crafting-recipe` | `/player progression unlock-recipe` | Owner |
| `/unlock-player-research` | `/player progression unlock-research` | Owner |
| `/clean-player-inventory` | `/player reset clean-inventory` | Owner |
| `/reset-player-progression` | `/player reset reset-progression` | Owner |
| `/backups` | `/backup list` | Everyone |
| `/configure-auto-backup` | `/backup configure-auto` | Owner |
| `/create-backup` | `/backup create` | Owner |
| `/delete-all-backups` | `/backup delete-all` | Owner |
| `/delete-backup` | `/backup delete` | Owner |
| `/download-backup` | `/backup download` | Owner |
| `/import-backup` | `/backup import` | Owner |
| `/restore-backup` | `/backup restore` | Owner |
| `/restart-server` | `/server restart` | Owner |
| `/start-server` | `/server start` | Owner |
| `/stop-server` | `/server stop` | Owner |
| `/cleanup-build-cache` | `/server cleanup-build-cache` | Owner |
| `/cleanup-images` | `/server cleanup-images` | Owner |
| `/fix-network` | `/server fix-network` | Owner |
| `/servers` | `/server vps` | Everyone |
| `/status` | `/server status` | Everyone |
| `/restart-service` | `/server restart-service` | Owner |
| `/services` | `/server services` | Owner |
| `/apply-game-update` | `/update game apply` | Owner |
| `/auto-update-status` | `/update game auto-status` | Owner |
| `/check-game-update` | `/update game check` | Owner |
| `/configure-auto-update` | `/update game configure-auto` | Owner |
| `/fix-steamcmd` | `/update runtime fix-steamcmd` | Owner |
| `/repair-runtime` | `/update runtime repair` | Owner |
| `/apply-stack-update` | `/update stack apply` | Owner |
| `/check-stack-update` | `/update stack check` | Owner |

`/help`, `/level`, `/achievements`, `/music`, `/voice`, `/market` and `/storm` remain available. `/level rank` shows a member's message/voice activity card and `/level leaderboard` renders the server's top ten as an avatar-backed image. `/achievements [member]` shows recorded achievement unlocks and progress toward every Bronze, Silver, and Gold tier; omit `member` to view your own. The eight `.env`-configured roles are earned only at milestone levels 1, 10, 20, 30, 40, 50, 60, and 70. Level-ups and Bronze/Silver/Gold message, voice, and level achievements are posted with dedicated images to `LEVEL_ANNOUNCEMENT_CHANNEL_ID`. Manage Server members configure double-XP windows with `/level event schedule|status|stop` and inspect reward-role readiness with `/level roles status`. Music and voice retain their existing subcommands and panel controls. `BOT_CONTROL_CHANNEL_ID` publishes an owner-only Discord control center for health, panel refreshes, module reloads, service resynchronization, and confirmed bot restarts.

## Game catalogs

Use `/player catalog` to search all eight bundled reference datasets. Item grants, skill modules, vehicles/templates and journey nodes offer autocomplete. See [catalog details](../data/README.md). Owner-only actions retain their permissions.

`/server-usage` shows all four Convoy resource graphs, with server selection, period and aggregation options.

After global registration succeeds, startup removes server-specific slash command copies owned by this bot, including old names and duplicate group names. Cleanup verifies that the current global command list is present first. Context menus and commands belonging to other applications are unaffected. A `[COMMANDS]` startup summary reports removals and any failed operations.
