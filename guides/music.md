# Lavalink music lounge

## Configure the bot

Use an up-to-date Lavalink v4 server compatible with Discord's current voice protocol. The bot uses Shoukaku 4.3.0. Lavalink, rather than this bot process, provides the audio sources and voice transport. Refer to the [official Lavalink setup documentation](https://lavalink.dev/getting-started/) and [current releases](https://github.com/lavalink-devs/Lavalink/releases).

Create a permanent voice channel such as **🎵・music-lounge** and a dedicated text channel such as **🎶・song-requests**. Copy the music section from `.env.example` into your deployment's `.env` and supply:

```dotenv
LAVALINK_URL=https://lavalink.example.com
LAVALINK_PASSWORD="your-lavalink-password"
GUILD_ID=your_server_id
MUSIC_VOICE_CHANNEL_ID=your_permanent_voice_channel_id
MUSIC_REQUEST_CHANNEL_ID=your_song_request_text_channel_id
MUSIC_SEARCH_SOURCE=spsearch
MUSIC_VOLUME=100
MUSIC_MAX_QUEUE=100
```

The sample IDs above are placeholders. Use actual Discord IDs. Leave `LAVALINK_URL` blank to disable music. Existing credentials and the live `.env` are not changed by this feature.

`LAVALINK_URL` is an HTTP(S) origin, including its port if required, with no API path or credentials. Use the host reachable from the **bot machine**, not localhost when Lavalink is hosted elsewhere. The password belongs in `LAVALINK_PASSWORD`; quote values containing `#`. Keep the endpoint private or firewalled to the bot host, and use HTTPS when traversing an untrusted network. Never commit real passwords.

### Lavalink profile, Spotify and audio quality

Copy [`guides/lavalink/application.yml.example`](lavalink/application.yml.example) to the Lavalink host as `application.yml`, then provide the variables shown in [`guides/lavalink/lavalink.env.example`](lavalink/lavalink.env.example) through that container or service. Do not copy Spotify credentials into the bot's `.env`; they belong to Lavalink. The template pins LavaSrc 4.8.3 and uses `spsearch`, so ordinary text requests search Spotify's catalog while SoundCloud supplies playable audio.

Create a Spotify application at the [Spotify developer dashboard](https://developer.spotify.com/dashboard), set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` on Lavalink, and restart Lavalink. No redirect URI or user login is needed for catalog search. Keep `MUSIC_SEARCH_SOURCE=spsearch` on the bot. Without Spotify credentials, use `MUSIC_SEARCH_SOURCE=scsearch` instead.

Spotify and Apple Music are mirror sources in LavaSrc: their links and searches provide metadata, but do not stream audio from those services. The configured provider finds a playable copy on SoundCloud. This improves title/artist discovery, but the final recording and bitrate still depend on the mirror match. LavaSrc can play Deezer directly when separately configured with legitimate account credentials; the committed template leaves Apple Music and Deezer disabled because their tokens are not interchangeable with Spotify credentials.

Use unity gain (`MUSIC_VOLUME=100`) for the cleanest default signal and let listeners adjust Discord's per-user volume locally. Lavaplayer can pass compatible Opus packets through without decoding and re-encoding when no volume adjustment is applied. Existing PostgreSQL music state retains its saved volume after an upgrade, so run `/music volume level:100` once if the panel still reports the previous 30% value.

The committed Lavalink template already sets these quality values; they belong to the Lavalink server, not this bot's `.env`:

```yaml
lavalink:
  server:
    opusEncodingQuality: 10
    resamplingQuality: HIGH
    nonAllocatingFrameBuffer: false
    bufferDurationMs: 1000
    frameBufferDurationMs: 5000
    soundcloudSearchEnabled: true
    soundcloudFilterOutPreviewTracks: true
```

Encoding quality 10 is Lavalink's highest setting. `HIGH` resampling uses more CPU than `LOW` or `MEDIUM`; monitor the Lavalink host and lower it to `MEDIUM` if audio starts stuttering under load. The buffers improve tolerance of short scheduling or garbage-collection pauses, but cannot repair a low-bitrate source. Filtering SoundCloud previews avoids short preview recordings when the full track is available. Restart Lavalink after changing its configuration, then restart the bot.

The bot needs **View Channel**, **Connect**, and **Speak** in the voice channel. Give it **View Channel**, **Send Messages**, and **Read Message History** in the request channel. Plain-text song requests also need the Message Content intent, already requested by this bot; enable that privileged intent in the Discord Developer Portal.

Rebuild/restart the bot. It connects automatically on the shard that owns the configured guild. It stays in voice even with an empty queue or no listeners and checks the connection every 30 seconds. Lavalink reconnection runs automatically. Both the bot and Lavalink must remain running for 24/7 availability; permission problems or service outages still interrupt audio.

The music channel must be separate from the Join to Create trigger and all temporary rooms. It can share their category. **DATABASE_URL is required** for music. The bot uses the existing PostgreSQL connection and automatically creates `bot_music_state`; no manual SQL is needed. Run one bot deployment per configured music guild.

## Requests and commands

Music commands are grouped: `/music play`, `/music queue`, `/music now`, `/music skip`, `/music pause`, `/music resume`, `/music volume`, `/music stop`, `/music clear`, and `/music panel`. Restart the bot to synchronize command registration; retired standalone commands are removed.

When Lavalink reports that a song starts, its requester receives a private card with artwork and an Open Music Lounge button. No DM is sent merely for joining the queue. Duplicate start events for the same request are suppressed within the running bot; resuming after a bot reboot can send another notification. Users with closed DMs still receive normal playback and public panel updates.

The channel keeps one public Now Playing card, including artwork, requester, volume, and waiting count. It updates in place for track changes and playback controls, and displays an idle state when playback ends. On discovery, duplicate bot song cards from earlier versions are removed, retaining the oldest card near the controls. Requester mentions do not ping. Processed text requests and their bot replies are deleted after 15 seconds; grant **Manage Messages** so the bot can remove requests. Old unrelated messages are not purged. Card recovery scans up to 10,000 messages and reports failures without interrupting playback.

### Listen-only voice channel

Human members are server-muted when they enter `MUSIC_VOICE_CHANNEL_ID`; bots are excluded so music playback is unaffected. Arrakis Control joins the Music Lounge undeafened, while the human listen-only policy remains separate and unchanged. Give the bot **Mute Members** permission in the music channel and any destination voice channels where it must restore access. Members already server-muted before entering retain that mute. The bot records its mute ownership in `bot_music_mutes` before applying the change and retries failed operations every 30 seconds, including after restarts.

Moving directly to another voice channel removes the lounge mute. Discord cannot change server mute while someone is fully disconnected, so the bot keeps a pending cleanup record and unmutes them on their next connection outside the lounge. Returning to the lounge keeps them muted. Self-mute is never changed. Keep music enabled until pending cleanups have completed, or restore those server mutes manually if disabling it. Discord exposes a single server-mute flag; a moderator applying a second mute while the lounge already owns that flag cannot be distinguished from the lounge mute.

The bot automatically publishes a public Music Lounge control panel in `MUSIC_REQUEST_CHANNEL_ID`. No separate panel setting is needed. It uses the voice panel's banner style and offers Request Song, Now Playing, View Queue, View Lyrics, Pause, Resume, Skip, Volume, Clear Queue, and Stop Playback. Requests and volume open private forms; stop and clear ask for confirmation. Everyone can inspect playback and the queue. Listeners can add songs. The current requester controls skip, pause, resume and volume; members with `OWNER_ROLE_ID` control stop and clear. Permissions are rechecked when actions are submitted.

Give the bot **Attach Files** for the banner as well as the text-channel permissions above. The panel does not change channel permissions: make the request channel visible to your members. After a restart, the bot scans channel history to reuse its existing panel (up to 10,000 messages; if exceeded it logs a failure instead of creating a duplicate). Administrators with **Manage Server** can run `/music panel` in the request channel to refresh or recreate a deleted panel. Buttons keep working across restarts. The public now-playing card shows a playback bar and refreshes approximately every 15 seconds while a track is active; Now Playing and View Queue also return a fresh private snapshot.

Join the music voice channel, then type a song name or supported HTTPS link in the request text channel. Each non-bot text message there is treated as a song request. Use this as a dedicated request channel rather than a general chat. The bot replies without pinging the requester.

For the most precise text search, use `"Song Title" by Artist` or `Artist - Song Title`. The bot normalizes those forms and ranks every returned track by title precision, artist identity, ISRC metadata, and clean recording indicators. Covers, karaoke, previews, snippets, tributes, fan uploads, remixes, mashups, live performances, sped-up/slowed versions, and instrumentals are penalized unless the request asks for them. Direct links and playlists are not reranked.

When `ACTIVITY_LOG_CHANNEL_ID` is configured, each music control writes one completed audit card instead of a context-free receipt. Song submissions include the exact query and result; every music card includes the interaction/user/server/channel identifiers, timestamp, locale, action, success or rejection outcome, Lavalink and voice status, volume, playback position, current track and requester, plus up to eight upcoming tracks. Public track URLs are logged without query strings, and lyrics text is never copied into the activity log.

| Command | Behavior |
| --- | --- |
| `/music play query:<name or link>` | Search and queue the best-ranked result, a track URL, or a playlist. |
| `/music panel` | Publish or refresh the public controls; requires Manage Server. |
| `/music queue` | Display the current song and the next eight queued songs. |
| `/music now` | Display the current track and volume. |
| `/music skip` | Skip to the next queued track. |
| `/music pause` / `/music resume` | Pause or resume playback. |
| `/music volume level:<0–100>` | Change volume; the initial default is unity gain at 100%. |
| `/music clear` | Clear upcoming songs while leaving the current track playing. |
| `/music stop` | Stop playback, clear the queue, and remain in voice. |

All commands run in the configured request channel. Queue/music now can be viewed without joining voice. Any listener can request songs. Skip, pause, resume and volume require both voice membership and ownership of the current song request. Stop and clear instead require voice membership and the role configured in `OWNER_ROLE_ID`; the role is checked again when confirming. With no configured Owner role, those two actions are unavailable. There is no administrator bypass for playback. Controls transfer to the next requester when their song starts; while idle there is no playback owner. If the requester leaves voice, they must rejoin to use controls; the song continues and advances normally. Existing interaction cooldowns apply.

The queue limit includes the current track. A playlist that does not fit is rejected before adding any tracks. PostgreSQL stores the current track, ordered queue, requester IDs, volume, pause state, and last playback position. Queue/control changes are saved before playback changes, and position is checkpointed every five seconds. During graceful shutdown, the bot pauses Lavalink and saves its final reported position; if that request fails or times out, it saves the last available position instead. Restart recovery resumes seekable tracks from the saved position, without subtracting downtime from the remaining song duration. Songs that were paused stay paused; songs that were playing resume automatically. Abrupt failure may replay several seconds (the checkpoint interval plus Lavalink's position-update delay); database outages can leave an older checkpoint. Live streams reconnect at their live edge. Source availability still determines whether a saved track can play. The database stores track metadata, not audio files or a permanent listening history. Back up PostgreSQL to protect against database loss.

## Audio sources

The Now Playing button and `/music now` display track artwork alongside the title, volume, and waiting count. YouTube tracks use a video thumbnail if Lavalink omits artwork; other sources without artwork display the text alone. Give the bot **Embed Links** in the request channel.

The recommended search prefix is `spsearch` with the committed LavaSrc profile. The bot also accepts `scsearch`, `amsearch`, `dzsearch`, `ytsearch`, and `ytmsearch` when the matching Lavalink source is configured. Supported links include Spotify, Apple Music, Deezer, YouTube, SoundCloud, and Bandcamp; playback still depends on enabled server sources and mirror providers. Arbitrary local-file, private-network, and custom-host links are not accepted.

The template installs only the plugin that improves this bot today: LavaSrc. LavaSearch exposes a separate `/v4/loadsearch` API that this bot does not need for single-track requests; LavaLyrics overlaps the existing LRCLIB workflow; SponsorBlock requires a working YouTube source plus per-player category calls; and the TTS, tracker-module, extra-source, timed-lyrics, and DSP plugins do not improve Spotify search or source fidelity. Fewer loaded plugins means fewer incompatible updates and clearer failures. YouTube remains disabled because it needs its own current client/authentication setup; enable and test the [official YouTube source plugin](https://github.com/lavalink-devs/youtube-source#plugin) separately before selecting `ytsearch` or using SponsorBlock.

## Troubleshooting and validation

- Check Lavalink's own logs for source failures. Bot responses intentionally omit server errors that may contain credentials or request details.
- If the bot cannot join, verify its channel permissions and that the configured ID is a regular permanent voice channel.
- If requests are rejected, check that the member is connected to the music lounge and is using the request text channel.
- If playback is unavailable after adding a request, inspect `/music queue` before resending; queued requests can be retried during recovery.
- After deploying, test a song, two-song queue advancement, skip, pause/music resume, stop without leaving, and a Lavalink restart. Automated checks use mocks; live audio needs your configured server and Discord channels.

The **View Lyrics** button is available to everyone in the request channel. It displays matching lyrics privately inside Discord, with Previous/Next buttons for long songs. Lookups use [LRCLIB](https://lrclib.net/docs), need no API key, and send only track title, artist and duration. The bot tries LRCLIB's exact metadata endpoint first, then its broader search endpoint with scored full-title and remix/mashup fragment candidates. Title similarity, artist similarity and recording duration prevent blindly selecting the first search result. Common video-title suffixes are removed before lookup. Requests time out after eight seconds, observe a short delay between fallback searches, and are cached for 15 minutes. Successful results identify the matched LRCLIB artist and recording; instrumentals, unavailable lyrics and provider outages are reported clearly. Search LRCLIB and Search Genius links remain available, and page controls expire when the current song changes.

Music recovery starts immediately and keeps retrying until Lavalink is ready, waiting 10 seconds after each failed attempt. Attempts do not overlap, and shutdown cancels pending retries. The saved song and position stay protected until Lavalink confirms playback has started. A failed restore retries the same song instead of advancing the queue; the requester can explicitly skip an unavailable track once connected.

Connection drops, track-load failures, stuck tracks and playback exceptions preserve the current request and retry it from the last known position. A watchdog checks progress every five seconds; after 30 seconds without progress it schedules reconnection after 10 seconds, including when playback never starts or the player disappears without an error. Paused songs are excluded. Duplicate failure events do not postpone an already scheduled retry. This detects stalled playback positions, not silence in the audio itself.

Failures do not automatically skip songs. If a source is permanently unavailable, the requester can use `/music skip`, or an Owner-role member can use `/music stop` or `/music clear`. These saved-queue controls also work while Lavalink is disconnected. Only a normal finished event advances the queue automatically.
