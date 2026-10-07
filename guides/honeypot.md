# Discord honeypot

The honeypot detects ordinary user messages in a dedicated trap channel, removes the triggering message, and bans the sender by default. It is disabled until both honeypot channel IDs are configured. It needs no database or new slash command.

1. Create a dedicated text channel in the server selected by `GUILD_ID`. Name it clearly, such as `do-not-post`, and put an explicit warning in its topic and a pinned staff message: **Do not send messages here. Posting here results in an automatic ban.** Allow members to view and send messages so the trap can detect automated spam.
2. Create a separate private staff log channel in the same server. Give the bot View Channel and Send Messages there.
3. Set `HONEYPOT_CHANNEL_ID` to the trap channel and `HONEYPOT_LOG_CHANNEL_ID` to the staff log channel. Keep `HONEYPOT_ACTION=ban` for automatic bans. The bot needs Ban Members and a role above members it should ban, plus View Channel and Manage Messages in the trap channel. Existing Guild Messages and Guild Members gateway intents are used.
4. Restart the bot. First verify the setup with `HONEYPOT_ACTION=log` and a disposable non-staff test account. Log mode deletes the message but applies no member sanction. Then select `ban` and restart.

`HONEYPOT_ACTION=timeout` applies a timeout instead; `HONEYPOT_TIMEOUT_MINUTES` defaults to 1440 and accepts 1 through 40320. Timeouts require Moderate Members permission and do not shorten an existing longer timeout. To disable the feature, clear both channel IDs and restart. Partial channel configuration, invalid IDs or actions, and identical trap/log channels fail startup validation.

Guild owners, configured staff roles, and members with Administrator, Manage Server, Ban Members, Kick Members, or Moderate Members permission are exempt. The service fetches current membership before taking action. Bots, webhooks, system messages, DMs, other guilds, and other channels are ignored. Only the exact configured channel is monitored; threads and forum posts are not included. Do not reuse verification, music, chat bridge, ticket, or command channels as the trap. Honeypot messages do not earn XP or trigger music replies.

Incident logs include guild, channel, message and user IDs, configured action, and separate deletion and sanction outcomes. They contain no message body and generate no mentions. Bans preserve other messages (`deleteMessageSeconds: 0`). A deletion failure does not prevent the member sanction. A membership lookup failure prevents deletion and sanction; role hierarchy or permission failures are reported without claiming success. If Discord logging fails, the incident remains in the bot's process logs. Duplicate message IDs and concurrent sanctions for one member are suppressed within a process; the recent message cache is bounded to 1000 IDs and is cleared on restart.

Local tests use mocked Discord boundaries. Validate actual channel access, staff exemptions, permissions, and ban behavior in your server before relying on the feature.
