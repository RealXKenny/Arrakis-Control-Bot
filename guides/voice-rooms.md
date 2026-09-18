# Join-to-create voice rooms

All voice commands are standalone `/voice-*` commands (for example `/voice-setup`, `/voice-rename`, and `/voice-kick`). The old `/voice` group is removed when command registration synchronizes after restart. Public panel buttons retain their existing behavior and owner checks.

## Setup

1. Configure the bot's PostgreSQL `DATABASE_URL` (and `DATABASE_SSL` if required) and restart the bot. It creates `bot_voice_settings` and `bot_voice_rooms` automatically in the bot database. No game database changes or extra credentials are needed.
2. Create a voice channel named **Join to Create**, a category for temporary rooms, and a text channel such as **voice-controls**.
3. Give the bot **View Channel**, **Connect**, **Move Members**, **Manage Channels**, and **Manage Roles** in the temporary-room category. Give it **View Channel**, **Connect**, and **Move Members** in the join channel. In the control channel give it **View Channel**, **Send Messages**, **Embed Links**, and **Read Message History**. Manage Roles is needed to edit channel permission overwrites.
4. Allow members to view/connect to the join channel and read the control channel. Members do not need permission to send messages in the control channel. Category permissions form the starting permissions for new rooms.
5. A member with **Manage Server** runs:

   `/voice-setup join:<Join to Create> category:<Voice Rooms> panel:<voice-controls>`

6. Join the trigger channel. The bot creates your room, records its ID, and moves you into it. Another member can create a separate room.

The bot requests the `GuildVoiceStates` gateway intent. Restart the updated bot to load it. This feature supports the existing single-manager, one-process-per-shard deployment; do not run overlapping bot instances for the same guild.

## Environment configuration

All voice settings are listed in `.env.example`:

```dotenv
VOICE_GUILD_ID=
VOICE_JOIN_CHANNEL_ID=
VOICE_CATEGORY_ID=
VOICE_PANEL_CHANNEL_ID=
VOICE_PANEL_PUBLIC=true
```

Fill in all four IDs and configure `DATABASE_URL` to apply setup automatically on startup. The bot reuses the saved panel message when its channel is unchanged. Leave all four IDs blank to manage setup through `/voice-setup` and PostgreSQL instead. Partial IDs fail startup validation.

`VOICE_PANEL_PUBLIC=true` makes the panel channel readable by everyone when publishing or updating its panel. It removes explicit View Channel / Read Message History denies from that channel's overwrites and grants those permissions to `@everyone`, without changing message-writing permissions. The bot needs **Manage Roles** in the panel channel. Room ownership checks and private action replies remain enforced.

Set `VOICE_PANEL_PUBLIC=false` to leave channel permissions under manual administration; it does not undo previously granted public access. With environment setup enabled, startup reapplies it, including re-enabling creation after `/voice-disable`. Clear all four IDs if the saved slash-command configuration should remain authoritative.

## Owner controls

The shared panel provides **Rename**, **Limit**, **Lock**, **Unlock**, **Hide**, **Show**, **Permit Member**, **Reject Member**, **Disconnect Member**, and **Close Room**, **Room Info**, and **Reset Settings** buttons. New rooms are named `🔊・Name's Room`. Room Info shows the current name, member count, user limit, and default access/visibility. Reset Settings asks for confirmation and restores the default name, unlimited capacity, and original role access/visibility while preserving individual member permissions. Member actions open a private member selector; closing a room asks for confirmation. The final selection or confirmation rechecks ownership, current room membership, and the original panel. Ownership is checked on every interaction, including when a modal is submitted. You must be connected to the room you created and own. Being in somebody else's room, owning a room while disconnected, or having the Discord Owner role does not grant access to another member's controls.

| Command | Effect |
| --- | --- |
| `/voice-rename name:<name>` | Rename your current owned room, up to 100 characters. |
| `/voice-limit users:<0–99>` | Set the room's user limit; 0 means unlimited. |
| `/voice-lock` / `/voice-unlock` | Restrict new connections / restore original role join permissions. |
| `/voice-hide` / `/voice-show` | Hide the room / restore original role visibility. |
| `/voice-permit member:<member>` | Explicitly allow a member to view and join your room, including while locked or hidden. |
| `/voice-reject member:<member>` | Deny a member view/connect access and disconnect them if they are in your room. |
| `/voice-kick member:<member>` | Disconnect a member who is currently in your room without banning re-entry. |
| `/voice-delete` | Delete your current owned room and disconnect its members. |

Locks and visibility restrictions preserve explicit member overwrites (including the creator, the bot, and permitted members). Discord administrators bypass channel restrictions. Locking does not disconnect existing occupants. Unlock/show restore role settings captured when the room was created; later category changes are not automatically synchronized into rooms.

Owners receive no additional server roles or general channel-management permissions. Use the bot controls to manage the room. New-room creation has a 30-second per-member cooldown to reduce channel churn. If you return to the trigger during the cooldown, recovery retries waiting members within a minute. Discord's own API rate limits still apply, including channel rename limits.

## Administration

- `/voice-setup`: configure or replace the guild's join/category/panel selection and publish a fresh panel. Requires **Manage Server**. Older panels stop working.
- `/voice-panel`: update the saved panel or replace it if deleted. Requires **Manage Server**.
- `/voice-disable`: prevent new rooms while preserving existing owners, controls, and automatic cleanup. Run setup again to re-enable.

Each guild has one configured trigger and one control panel. A member can own at most one room per guild. Returning to the trigger while a saved room still exists moves the member back into it. Ownership is not transferred when the creator leaves; remaining members can keep talking until the room becomes empty.

## Persistence and recovery

The bot reserves ownership in PostgreSQL **before** creating the Discord channel. A unique temporary channel name identifies an interrupted creation if the process exits before it saves the channel ID. Once saved, the room receives its display name and the creator is moved into it.

On startup and every minute, the bot reconciles only its saved rooms for guilds on the current shard:

- Occupied rooms and their ownership are preserved.
- Empty rooms are deleted, then their database records are removed.
- Records for confirmed missing channels are removed.
- Interrupted creations are recovered using their saved marker and category.
- Network/permission failures retain records for a later retry.
- Members still waiting in the configured join channel are retried.

Normal voice-state changes trigger immediate cleanup when the last occupant leaves. Shutdown leaves occupied rooms intact. Discord itself retains channel names, user limits, and permission overwrites; PostgreSQL retains ownership, original role permissions, and configuration.

Back up the bot database. Losing its voice tables loses the ownership registry. The bot intentionally does not take over or delete untracked channels based on their appearance.

## Deployment check

After deploying, use two accounts to check room creation, owner controls, denial of non-owner controls, and cleanup when everyone leaves. Restart the bot while a room is occupied and confirm the same owner can still use its controls. Leave a room empty while the bot is offline and confirm startup removes it. Automated tests cover these flows with mocked Discord and database boundaries; a live deployment check is still required.
