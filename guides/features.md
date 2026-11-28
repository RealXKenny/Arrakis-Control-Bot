# Feature reference

Detailed behaviour, configuration and limits of each bot feature. The [README](../README.md) has the overview; [commands](commands.md) lists every command group.

## Support tickets

The ticket system is enabled when `DATABASE_URL` is configured. On startup, the bot creates and upgrades its ticket table and indexes automatically. Set `TICKET_PANEL_CHANNEL_ID` to the channel where members open tickets and `TICKET_CATEGORY_ID` to the category that should contain private ticket channels. Set `TICKET_TRANSCRIPT_CHANNEL_ID` to receive one persistent archive container per ticket with both `.txt` and structured `.json` records; the transcript is always retained in PostgreSQL. `DATABASE_SSL=true` enables TLS with certificate verification for hosted PostgreSQL services (`DATABASE_SSL_VERIFY=false` opts out for a trusted self-signed server). Ticket access is granted to the creator and any configured staff roles; members may have one active ticket per server. Configured staff can claim and release tickets, and the claimant is recorded as the handler. Other staff cannot close a claimed ticket until its handler releases it; closing an unclaimed ticket as staff automatically assigns the closer. The panel routes members through Account & Linking, Technical Support, Player Report, Guild & Community, Gameplay & Server, or General & Other. The selected category is stored with the full details, troubleshooting already attempted, and impact/urgency. When the Discord Adapter is available, linked Dune character identity and online status are recorded with the private ticket. Closing a ticket saves its conversation and attachment references, sends the creator a complete DM receipt with the transcript and review button, then deletes its Discord channel. Submitted ratings, resolution status, comments, and review timestamps are retained in PostgreSQL and update the original archive container and JSON record instead of creating a second message. Members who disable DMs cannot receive the receipt, but closure and database archival still complete.

Ticket transcripts require the Discord **Message Content Intent**. Enable it for the bot application in the Discord Developer Portal; the runtime now requests both `GuildMessages` and `MessageContent` gateway intents.

## Message archive and edit/delete logs

When `DATABASE_URL` is configured, every new guild message is archived in PostgreSQL with its author, channel, text, attachments, embeds, components, stickers, reply reference, flags, webhook identity, and Discord timestamps. Edits preserve before-and-after revisions, while deletions mark the stored message instead of removing its content. Individual edits, deletes, and bulk deletes are reported to `ACTIVITY_LOG_CHANNEL_ID`; generated log cards disable mentions and recover content from the database when Discord emits only a partial uncached message. Discord's message-delete event does not reliably include the person who performed the deletion, so the bot records the deleted message and its author without guessing the deletion actor.

## Staff applications

Configure `STAFF_APPLICATION_PANEL_CHANNEL_ID` and the private `STAFF_APPLICATION_REVIEW_CHANNEL_ID` together to enable the application system. Members complete a five-question Discord form; leadership receives a private review card with accept and deny controls. `STAFF_APPLICATION_REVIEWER_ROLE_ID` can grant review access in addition to the existing staff roles and server administrators. Optional pending and accepted roles are managed automatically, decisions are sent to the applicant by DM when possible, and `STAFF_APPLICATION_COOLDOWN_DAYS` controls reapplication timing. Applications and decisions are stored in PostgreSQL, so `DATABASE_URL` is required. See the [staff application setup guide](staff-applications.md).

## Community leveling

Community leveling is enabled automatically when `DATABASE_URL` is configured; set `LEVELING_ENABLED=false` to turn it off. Meaningful guild messages earn a variable 8–25 base XP based on their length, vocabulary, attachments, and reply context. An atomic short anti-spam window and recent-message fingerprint check prevent rapid or repeated farming without imposing a one-minute reward lock. Members also earn 15 XP per minute in a non-AFK voice channel when at least two eligible human members are participating; bots and members who are self-deafened, server-deafened, or suppressed do not count. Message and voice protections are stored independently in PostgreSQL.

Level thresholds use a demanding `250 × level²` cumulative XP curve, so every promotion requires more activity than the last. The highest earned tier role is assigned automatically at milestone levels 1, 10, 20, 30, 40, 50, 60, and 70: **Arrakis Wanderer**, **Sietch Dweller**, **Desert Survivor**, **Sand Warrior**, **Spice Hunter**, **Fremen Initiate**, **Desert Master**, and **Chosen of Arrakis**. Create those roles in Discord, place their IDs in the eight `LEVEL_ROLE_*_ID` entries in `.env`, then restart the bot. An administrator with Manage Server can run `/level roles status` to inspect configuration, existence, and hierarchy. Keep all level roles below the bot's highest role and grant the bot Manage Roles.

Server boosters always earn 2× message and voice XP. Manage Server administrators can schedule a persistent server-wide 2× window with `/level event schedule duration-minutes:<15–10080> [starts-at:<ISO date/time>]`, inspect it with `/level event status`, and cancel it with `/level event stop`. Booster and event bonuses stack multiplicatively for 4× XP. The optional start time may be up to 30 days ahead; omitting it starts the event immediately.

Set `LEVEL_ANNOUNCEMENT_CHANNEL_ID` to the one server channel that should receive every progression celebration. Level-ups use a modern gradient banner and a plain “Level up” message whether the final XP came from chat or voice. Achievements use their own custom artwork: copper spice trails for **King of Spam** at 100/500/2,000 rewarded messages, moonlit cyan resonance for **Voice of the Sietch** at 60/300/1,200 rewarded voice minutes, and a violet celestial path for **Path of the Kwisatz** at levels 5/25/50. Each track awards Bronze, Silver, and Gold once; unlocks are stored atomically so restarts and multiple shards cannot announce the same achievement twice.

Use `/level rank` to view the avatar-backed profile card with a member's tier, server rank, message/voice activity, current multiplier, progress, and XP. `/level leaderboard` uses its own night-desert artwork to render the server's top ten as a separate themed image with member avatars, tiers, levels, and XP. `/achievements` shows recorded Bronze, Silver, and Gold unlocks and progress for yourself or another member. Leveling uses the existing Message Content and Voice States intents and creates or upgrades its tables automatically; no manual SQL is required.

## Self-assignable roles

Set `ROLE_PANEL_CHANNEL_ID` and the `ROLE_*_ID` values from `.env.example` to publish the self-assignable role panel. Members can select their roles or choose **Clear all roles** to remove every self-assignable role. The bot must have Manage Roles and a role above the roles it assigns.

## Discord ↔ game chat over RabbitMQ

See the [complete RabbitMQ ↔ Discord setup guide](rabbitmq-discord.md) for remote-broker setup, TLS, authentication, database personas, seven-map routing and troubleshooting. The optional bridge supports one shared Discord channel or separate channels per map, plus opt-in, receive-only proximity chat.

## Join-to-create voice rooms

Configure `DATABASE_URL`, restart the bot, then run `/voice setup join:<voice channel> category:<category> panel:<text channel>` with **Manage Server** permission. Members joining the trigger receive a personal voice room; controls work only for the creator while inside their own room. Ownership and setup survive restarts, and empty rooms are automatically removed.

See the [voice-room setup and control guide](voice-rooms.md) for permissions, commands, panel controls, and recovery behavior.

## Lavalink music lounge

Set `DATABASE_URL` and the optional `LAVALINK_URL`, `LAVALINK_PASSWORD`, and music channel values from `.env.example` to enable a permanent music voice channel. `MUSIC_IDLE_PLAYLIST_URL` plays a separate waiting-music album whenever the request queue is empty; member requests take priority immediately and the idle rotation is never persisted as a user's song. When a member leaves the music voice channel, their playing and queued requests are removed while other members' songs remain. The bot accepts Spotify, Apple Music, Deezer and traditional song links, and ranks searches for clean title/artist matches. The supplied LavaSrc profile searches Spotify metadata, mirrors playback through SoundCloud, and uses quality-focused encoding and buffering settings. The public panel and grouped `/music` commands provide queue controls, player-style progress and lyrics; queue checkpoints persist in PostgreSQL for restart recovery. See the [music setup guide](music.md).

## Poker Activity

`/poker` opens Arrakis Hold'em, a play-money Texas Hold'em table for up to four players that runs as a Discord Activity inside the channel. A player without a second person can add AI opponents from the table. Chips have no value and are never Solari. The game is served by the Arrakis Control Dashboard; the bot only asks Discord to launch it, so the bot needs no new configuration or open ports. Setup is in [guides/poker.md](poker.md).

## Weekly Coriolis storm panel

Set `STORM_CHANNEL_ID` in `.env` to enable one persistent Coriolis storm panel with a modern banner, clear status, start/end dates, and live Discord countdowns. Every minute, the bot reads `coriolisNextCycleAt` from `GET /api/map/markers`, uses it as the storm end, and calculates the start as exactly 24 hours earlier. It edits the same message when the cycle or storm phase changes, and recreates the panel if deleted.

The Console API key needs read access to the `map` namespace. The bot accepts an ISO timestamp, Unix seconds, or Unix milliseconds from the API. When the reported cycle expires, the scheduled panel displays an awaiting-next-cycle state until a new schedule arrives.

Users can also run `/storm` at any time to retrieve the current API-backed storm panel. This command works independently of `STORM_CHANNEL_ID`.

Configure `DATABASE_URL` and grant View Channel, Read Message History, Send Messages, Attach Files, and Embed Links in the destination. The first publication imports the oldest recognized bot storm panel and removes duplicate bot storm announcements; subsequent checks fetch its saved PostgreSQL message ID directly. Other messages are preserved. Initial discovery is limited to 10,000 messages and pauses publication if that limit is exceeded. Failed database access, reads, edits, or sends retry on the next minute. Only shard 0 publishes, and a database lock prevents concurrent panel publication across deployments sharing the same database. No role or everyone mentions are sent. Restart after changing configuration. Leaving `STORM_CHANNEL_ID` unset disables the feature.

## Leaderboard command

`/leaderboard solaris` shows the wealthiest Dune players. A player's total is their banked Solari Credit (`GET /api/players/{playerId}/currency`, the row labelled "Solari Credit") plus the Solaris coins they carry (`GET /api/players/{playerId}/solaris-coin`); each row shows the total and the split. The bot pages the Dune Console player directory (`GET /api/players`, up to 2,000 players; each row's id is `actor_id`) and reads both balances per player with bounded concurrency, since the Console has no bulk balance endpoint. A directory whose rows carry no usable id is reported as an error instead of an empty ranking.

`/leaderboard dungeons` shows the fastest run for every dungeon and difficulty from `GET /api/dungeons/leaderboard` (the same source as the dashboard's dungeon leaderboard): dungeon, difficulty, best time, party and how many runs were counted, cached for five minutes. Only character names are shown.

Solari balances are kept as decimal strings and sorted without precision loss. Both boards are shown ten per page with First, Previous, Next, and Last buttons. The optional one-based `page` argument sets the initial page. The ranking is cached process-locally for five minutes (simultaneous requests share one crawl), players whose balance cannot be read are counted as unavailable rather than ranked, and controls are bound to the requesting member and expire after 15 minutes. The output is public, and live Console behavior should be confirmed on a real server.

## CHOAM market command

Users can run `/market` to browse active CHOAM Exchange sell orders grouped by item and grade. Results show each item's lowest asking price, total stock, listing count, and a recommended listing price calculated from the Market Bot's saved buyback percentage. The interactive panel provides an All Categories/category menu and First, Previous, Next, and Last page buttons. Optional `search`, `category`, `seller`, and `page` arguments set the initial view; `seller` defaults to all sellers. Controls are bound to the requesting member and expire after 15 minutes.

The command reads `GET /api/exchange/items` through the configured Dune Console API key and never changes exchange rows. Ensure that key is permitted to read the exchange endpoint. If the game database does not support the exchange schema, the command reports the capability as unavailable.

## Interactive command help

Run `/help` to open the public Arrakis Command Center. It catalogs all 89 grouped commands across 14 practical categories, shows Everyone, Staff, and Owner access badges, and provides category and page controls bound to the requesting member. The optional `category` argument opens a specific section immediately; interactive sessions expire after 15 minutes.

## Owner server controls

Members with the configured `OWNER_ROLE_ID` can run `/server start`, `/server stop`, `/server restart`, `/server fix-network`, `/server cleanup-images`, `/server cleanup-build-cache`, `/server services`, and `/server restart-service service:<name>`. Each owner-only subcommand calls the matching Dune Console endpoint and responds ephemerally. `/server services` lists current service status and provides the names accepted by `/server restart-service`. Storage cleanup requests include the Console's exact required confirmation phrase. The Console API key must have permission to execute server operations.

Set `BOT_CONTROL_CHANNEL_ID` to a private staff channel to publish the persistent **Arrakis Control Center**. The Discord server owner and members with `OWNER_ROLE_ID` can inspect live bot health, update every persistent panel in place, reload command/component modules, resynchronize game chat, voice, leveling, and music controls, or restart every bot shard after confirmation. A panel refresh covers every configured guild voice panel plus both the music control and now-playing messages. Actions respond privately and are recorded in the configured activity log. Keep the channel hidden from regular members even though authorization is rechecked for every button press.

`/server restart` and `/server restart-service` accept an optional `immediate` flag. Normal requests respect the Console Restart Queue and report queued `202` responses; `immediate:true` sends `restartQueue=immediate` to bypass its countdown. Concurrency-conflict `409` responses are shown in the ephemeral error panel.

## Owner update controls

Owners can use `/update game check`, `/update game apply`, `/update runtime fix-steamcmd`, `/update stack check`, `/update stack apply`, `/update game auto-status`, `/update game configure-auto`, and `/update runtime repair`. `/update game check` accepts the optional `fresh` flag. `/update game configure-auto` requires all documented automatic-update fields and forwards its `confirmation` value to the Console. All update responses are ephemeral.

## Backup controls

`/backup list` remains the read-only overview for the backup list and automatic-backup status. Owners can use `/backup create`, `/backup restore`, `/backup download`, `/backup delete`, `/backup delete-all`, `/backup import`, and `/backup configure-auto` for the remaining Console backup operations. Restore and deletion commands require an explicit `confirm:true`; responses are ephemeral.

External imports require both the backup archive and its metadata as Discord attachments and are limited to 25 MB combined. Downloads are returned as ephemeral Discord attachments and are limited to 10 MB; larger archives must be retrieved directly through the Console.

## Owner player administration

Owners have 38 player administration subcommands covering every item/XP/skill, kick/ban/teleport, cleanup, progression, equipment, inventory-editing, and kick-all route. Examples include `/player items give-item`, `/player items add-xp`, `/player actions kick`, `/player actions ban`, `/player actions teleport`, `/player progression add-currency`, and `/player equipment repair-gear`. Player-scoped operations require the numeric Console `player-id`; disruptive operations also require `confirm:true`.

Options ending in `-json` accept the documented structured value as JSON: `items-json` and `augments-json` require arrays, while `values-json` requires an object. Routes with a fixed Console confirmation phrase supply it automatically; routes whose confirmation phrase is operation-specific expose a required `confirmation` option. All responses are ephemeral.

## Community FAQ panel

Set `FAQ_PANEL_CHANNEL_ID` to publish the persistent Crimson Skies FAQ and banner. On startup, the bot updates its existing FAQ message in place or creates it when missing, keeping one current panel in the configured channel.

## Release announcements

Set `DASHBOARD_URL` to the HTTPS origin of the dashboard, `DATABASE_URL` for announcement receipts, and `ANNOUNCEMENT_CHANNEL_ID` to the changelog channel.

A **forum channel** (recommended) gets one post per release, titled like `Bot v2.0.1 release notes`. The first message is a short card with the version, date, summary and links; the full notes follow inside the post, split across as many messages as needed, in order. Each post is tagged with its product (`Bot`, `Dashboard`) and release type (`Major`, `Minor`, `Patch`). On startup the bot creates any of these tags that are missing, matching existing tags by name so it never duplicates them, and stays within Discord's 20-tag limit. A **text or announcement channel** gets the short card in the channel and the full notes in a thread on it.

Permissions in that channel: View Channel, Send Messages (Create Posts in a forum), Send Messages in Threads, Read Message History, Attach Files and Embed Links; in a text channel also Create Public Threads; in a forum also **Manage Channels** to create the tags. Without Manage Channels posts are still made, just untagged.

On every start the bot checks each release it has posted: it moves notes out of older cards that held them (and may have been cut short) into the release's thread or post, sends any missing parts, edits parts that changed and removes surplus parts it posted itself. Posts that are already correct are left alone, and it never posts a second announcement for a release. The bot reads the dashboard’s public versioned changelog API at startup and every `VERSION_ANNOUNCEMENT_INTERVAL_MINUTES` minutes. The dashboard serves reviewed snapshots, which must be updated after each release; a successful API response does not guarantee that its snapshots are current. See [changelog synchronization](changelog-synchronization.md). Existing `GITHUB_TOKEN` settings are no longer used. Re-import the Pterodactyl egg and configure `DASHBOARD_URL` before enabling announcements.

The HTTP client validates and bounds responses, uses a timeout and a five-minute cache, and retains a last-known-good result for up to 24 hours. Announcements and replay pause if the API fails or returns stale or incomplete data; replay forces a new check before resetting receipts. There is no GitHub fallback. PostgreSQL records each announcement by channel, project repository and version. The bot imports its own legacy messages once, keeps receipts for deleted posts, and serializes each channel with a database lock. Changelog posts do not ping roles or members. Discord sends and receipt writes are not atomic: a crash or failed write immediately after a successful send can leave an unrecorded post. Preserve the release tables when restoring the database.

## Persistent panels

Persistent public panels require `DATABASE_URL`. The bot creates `bot_persistent_panels` automatically using its shared PostgreSQL pool. Rules, roles, verification, FAQ, tickets, staff applications, account links, blueprints, control center, both server-information messages, music controls, now-playing, and storm panels save their message IDs by channel and stable panel key. Each panel imports existing bot-authored history once (up to 10,000 messages), then fetches its saved ID directly after restarts and during refreshes. Only a confirmed deleted message permits recreation; permission, network, history-import, or database errors pause publication. Locks prevent overlapping publishers sharing that database. Voice panels, ticket archives, and application reviews retain their existing database IDs. As with release announcements, sending and saving are separate operations, so an abrupt crash or failed database write immediately after a successful send can leave an unrecorded post. Back up the registry with the rest of PostgreSQL.

## Panel artwork

Every user-facing Discord panel shares one modern visual language: an indigo accent palette and semantic status colors (`src/shared/discord/panelStyle.ts`), sentence-case headings, and gradient-and-geometry artwork from `data/images/`. Regenerate the artwork with `node scripts/generate-panel-artwork.mjs`; the files keep their names, so no code or deployment changes are needed. The shared renderer selects a typed panel-specific background, applies consistent aspect-cover cropping and text-safe shading, then layers dynamic server names, counts, statuses, release versions, member avatars, and accessibility descriptions without baking live data into the source image. Persistent panels retain their unique backgrounds, welcome and goodbye cards use member-specific avatar banners, and short-lived Components V2 responses automatically receive the `panel-temporary.png` scene when they do not already provide art. Lyrics, voice-room information, and no-cover music cards also include dedicated image attachments. High-volume audit-log records intentionally remain compact and text-first.

## Suggestion forum assistant

Set `SUGGESTIONS_FORUM_CHANNEL_ID` (PostgreSQL required) to let the bot manage a suggestions forum without any paid AI service: it tags new posts, replies to the suggester, lists similar posts, summarizes long discussions and adds a staff-only status panel (Planned, Working on it, Back burner, Not doing, Added) to each post. It also follows the GitHub repositories by itself and moves matching suggestions to Planned, In Progress and Implemented as issues, pull requests and releases appear, while staff buttons stay as overrides. `/suggestions feature start` and `/suggestions feature done` do the same by hand. See [the setup guide](suggestions.md).

## Chatbot

The bot has its own homemade chatbot with no outside AI. Ping the bot, reply to one of its answers or use `/chat ask`. It answers from the FAQ panel, the `/help` command list, live levels, the level and Solari leaderboards, the Coriolis storm schedule, game server status and the latest release notes, does quick math and dice, and says so when it doesn't know. It learns questions and answers from public chat, answers questions by itself when it is confident (after giving members a head start), looks unknown topics up online (game wiki, DuckDuckGo instant answers and Wikipedia, with a source link), answers definitions, weather, news headlines, Steam prices and player counts and currency conversions, can run its own optional AI model inside the bot (`CHATBOT_AI`), and has a mood and per-member rapport that change with how it is treated. Learned answers, taught answers (`/chat teach`) and its mood are kept in PostgreSQL. Members can opt out with `/chat optout`, deleted messages are forgotten, and staff manage what it learned with `/chat learned`, `/chat unlearn` and `/chat purge`. See [the chatbot guide](chatbot.md).

## Honeypot moderation

Optional automatic spam traps are available through `HONEYPOT_CHANNEL_ID`, `HONEYPOT_LOG_CHANNEL_ID`, and `HONEYPOT_ACTION` (default `ban`). Leave the channel IDs empty to disable. The trap removes non-staff messages, applies the configured action, and logs outcomes. See [the setup guide](honeypot.md) for channel permissions, exemptions, and testing.

The bot publishes a warning panel in the trap channel on startup. It explains the channel's purpose and the configured consequence, and updates through the owner's Refresh Panels control.

Its Status button privately shows members caught and moderation totals. Counts persist with `DATABASE_URL`; otherwise they cover the current bot session.
