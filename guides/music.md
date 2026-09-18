# Lavalink music lounge

## Configure the bot

Use an up-to-date Lavalink v4 server compatible with Discord's current voice protocol. The bot uses Shoukaku 4.3.0. Lavalink, rather than this bot process, provides the audio sources and voice transport. Refer to the [official Lavalink setup documentation](https://lavalink.dev/getting-started/) and [current releases](https://github.com/lavalink-devs/Lavalink/releases).

Create a permanent voice channel such as **🎵・music-lounge** and a dedicated text channel such as **🎶・song-requests**. Copy the music section from `.env.example` into your deployment's `.env` and supply:

```dotenv
LAVALINK_URL=https://lavalink.example.com
LAVALINK_PASSWORD="your-lavalink-password"
MUSIC_GUILD_ID=your_server_id
MUSIC_VOICE_CHANNEL_ID=your_permanent_voice_channel_id
MUSIC_REQUEST_CHANNEL_ID=your_song_request_text_channel_id
MUSIC_SEARCH_SOURCE=scsearch
MUSIC_VOLUME=30
MUSIC_MAX_QUEUE=100
```

The sample IDs above are placeholders. Use actual Discord IDs. Leave `LAVALINK_URL` blank to disable music. Existing credentials and the live `.env` are not changed by this feature.

`LAVALINK_URL` is an HTTP(S) origin, including its port if required, with no API path or credentials. Use the host reachable from the **bot machine**, not localhost when Lavalink is hosted elsewhere. The password belongs in `LAVALINK_PASSWORD`; quote values containing `#`. Keep the endpoint private or firewalled to the bot host, and use HTTPS when traversing an untrusted network. Never commit real passwords.

The bot needs **View Channel**, **Connect**, and **Speak** in the voice channel. Give it **View Channel**, **Send Messages**, and **Read Message History** in the request channel. Plain-text song requests also need the Message Content intent, already requested by this bot; enable that privileged intent in the Discord Developer Portal.

Rebuild/restart the bot. It connects automatically on the shard that owns the configured guild. It stays in voice even with an empty queue or no listeners and checks the connection every 30 seconds. Lavalink reconnection runs automatically. Both the bot and Lavalink must remain running for 24/7 availability; permission problems or service outages still interrupt audio.

The music channel must be separate from the Join to Create trigger and all temporary rooms. It can share their category. **DATABASE_URL is required** for music. The bot uses the existing PostgreSQL connection and automatically creates `bot_music_state`; no manual SQL is needed. Run one bot deployment per configured music guild.

## Requests and commands

Music commands are standalone: `/play`, `/queue`, `/now`, `/skip`, `/pause`, `/resume`, `/volume`, `/stop`, `/clear`, and `/music-panel`. Restart the bot to synchronize command registration; the old `/music` group is removed.

When Lavalink reports that a song starts, its requester receives a private card with artwork and an Open Music Lounge button. No DM is sent merely for joining the queue. Duplicate start events for the same request are suppressed within the running bot; resuming after a bot reboot can send another notification. Users with closed DMs still receive normal playback and public panel updates.

The channel keeps one public Now Playing card, including artwork, requester, volume, and waiting count. It updates in place for track changes and playback controls, and displays an idle state when playback ends. On discovery, duplicate bot song cards from earlier versions are removed, retaining the oldest card near the controls. Requester mentions do not ping. Processed text requests and their bot replies are deleted after 15 seconds; grant **Manage Messages** so the bot can remove requests. Old unrelated messages are not purged. Card recovery scans up to 10,000 messages and reports failures without interrupting playback.

### Listen-only voice channel

Human members are server-muted when they enter `MUSIC_VOICE_CHANNEL_ID`; bots are excluded so music playback is unaffected. Give the bot **Mute Members** permission in the music channel and any destination voice channels where it must restore access. Members already server-muted before entering retain that mute. The bot records its mute ownership in `bot_music_mutes` before applying the change and retries failed operations every 30 seconds, including after restarts.

Moving directly to another voice channel removes the lounge mute. Discord cannot change server mute while someone is fully disconnected, so the bot keeps a pending cleanup record and unmutes them on their next connection outside the lounge. Returning to the lounge keeps them muted. Self-mute is never changed. Keep music enabled until pending cleanups have completed, or restore those server mutes manually if disabling it. Discord exposes a single server-mute flag; a moderator applying a second mute while the lounge already owns that flag cannot be distinguished from the lounge mute.

The bot automatically publishes a public Music Lounge control panel in `MUSIC_REQUEST_CHANNEL_ID`. No separate panel setting is needed. It uses the voice panel's banner style and offers Request Song, Now Playing, View Queue, View Lyrics, Pause, Resume, Skip, Volume, Clear Queue, and Stop Playback. Requests and volume open private forms; stop and clear ask for confirmation. Everyone can inspect playback and the queue. Listeners can add songs. The current requester controls skip, pause, resume and volume; members with `OWNER_ROLE_ID` control stop and clear. Permissions are rechecked when actions are submitted.

Give the bot **Attach Files** for the banner as well as the text-channel permissions above. The panel does not change channel permissions: make the request channel visible to your members. After a restart, the bot scans channel history to reuse its existing panel (up to 10,000 messages; if exceeded it logs a failure instead of creating a duplicate). Administrators with **Manage Server** can run `/music-panel` in the request channel to refresh or recreate a deleted panel. Buttons keep working across restarts. Now Playing and View Queue show a fresh private snapshot; the public panel is not a live progress display.

Join the music voice channel, then type a song name or supported HTTPS link in the request text channel. Each non-bot text message there is treated as a song request. Use this as a dedicated request channel rather than a general chat. The bot replies without pinging the requester.

| Command | Behavior |
| --- | --- |
| `/play query:<name or link>` | Search and queue the first result, a track URL, or a playlist. |
| `/music-panel` | Publish or refresh the public controls; requires Manage Server. |
| `/queue` | Display the current song and the next eight queued songs. |
| `/now` | Display the current track and volume. |
| `/skip` | Skip to the next queued track. |
| `/pause` / `/resume` | Pause or resume playback. |
| `/volume level:<0–100>` | Change volume; the initial default is 30%. |
| `/clear` | Clear upcoming songs while leaving the current track playing. |
| `/stop` | Stop playback, clear the queue, and remain in voice. |

All commands run in the configured request channel. Queue/now can be viewed without joining voice. Any listener can request songs. Skip, pause, resume and volume require both voice membership and ownership of the current song request. Stop and clear instead require voice membership and the role configured in `OWNER_ROLE_ID`; the role is checked again when confirming. With no configured Owner role, those two actions are unavailable. There is no administrator bypass for playback. Controls transfer to the next requester when their song starts; while idle there is no playback owner. If the requester leaves voice, they must rejoin to use controls; the song continues and advances normally. Existing interaction cooldowns apply.

The queue limit includes the current track. A playlist that does not fit is rejected before adding any tracks. PostgreSQL stores the current track, ordered queue, requester IDs, volume, pause state, and last playback position. Queue/control changes are saved before playback changes, and position is checkpointed every five seconds. During graceful shutdown, the bot pauses Lavalink and saves its final reported position; if that request fails or times out, it saves the last available position instead. Restart recovery resumes seekable tracks from the saved position, without subtracting downtime from the remaining song duration. Songs that were paused stay paused; songs that were playing resume automatically. Abrupt failure may replay several seconds (the checkpoint interval plus Lavalink's position-update delay); database outages can leave an older checkpoint. Live streams reconnect at their live edge. Source availability still determines whether a saved track can play. The database stores track metadata, not audio files or a permanent listening history. Back up PostgreSQL to protect against database loss.

## Audio sources

The Now Playing button and `/now` display track artwork alongside the title, volume, and waiting count. YouTube tracks use a video thumbnail if Lavalink omits artwork; other sources without artwork display the text alone. Give the bot **Embed Links** in the request channel.

The default search prefix is `scsearch`. You can select `ytsearch` or `ytmsearch` when your Lavalink server has a working YouTube source/plugin. Supported URL hosts are YouTube, SoundCloud, and Bandcamp, but actual playback depends on the sources and plugins installed on Lavalink. Arbitrary local-file, private-network, and custom-host links are not accepted by the bot.

YouTube support requires server-side configuration; the bot does not install plugins or configure source authentication. See the [official Lavalink plugins list](https://lavalink.dev/plugins) for source-specific setup. Spotify links are not supported by this implementation.

## Troubleshooting and validation

- Check Lavalink's own logs for source failures. Bot responses intentionally omit server errors that may contain credentials or request details.
- If the bot cannot join, verify its channel permissions and that the configured ID is a regular permanent voice channel.
- If requests are rejected, check that the member is connected to the music lounge and is using the request text channel.
- If playback is unavailable after adding a request, inspect `/queue` before resending; queued requests can be retried during recovery.
- After deploying, test a song, two-song queue advancement, skip, pause/resume, stop without leaving, and a Lavalink restart. Automated checks use mocks; live audio needs your configured server and Discord channels.

The **View Lyrics** button is available to everyone in the request channel. It privately provides a Genius search link using the current song title and artist; no API key is required. Lyrics open in the browser, and results may include alternate versions.
