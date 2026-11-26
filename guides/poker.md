# Poker Activity

`/poker` opens Arrakis Hold'em, a play-money Texas Hold'em table, as a Discord Activity. Members can also start it from Discord's Activities menu.

## How it works

- The bot calls Discord's launch-activity interaction response for its own application. That response acknowledges the interaction, so the command sends no message when it succeeds.
- The table itself (game rules, sign-in, storage and the web page Discord embeds) lives in the Arrakis Control Dashboard under `src/features/poker/`. Its guide is `docs/features/poker-activity.md` in that repository.
- If Discord refuses the launch, for example because Activities are not enabled for the application, the member gets a private Components V2 notice without mentions and the refusal is logged under `POKER`. Expired interactions are ignored.
- The command is guild-only and uses the shared `InteractionRateLimit` precondition. It needs no environment variables, database, or HTTP listener in the bot.
- Lobbies hold up to four players. Anyone seated can add AI opponents to fill empty seats; the dashboard plays their turns, and a person who joins takes an AI seat.
- Chips are play money. They are never Solari and never touch the game, the casino, the economy, or any player data.

## Setup

1. In the Discord Developer Portal, open the bot's application and enable **Activities**.
2. Under **Activities → URL Mappings**, map the root prefix `/` to the dashboard host (the host part of the dashboard's `APP_URL`).
3. On the dashboard, use this same application's client ID, client secret and bot token, then set `POKER_ACTIVITY_ENABLED=true` and restart it.
4. Restart the bot (primary shard) so `/poker` is registered.

## Live verification still needed

Launching from `/poker`, the Activity iframe and the URL mapping were verified only against mocks. Before announcing it, run `/poker` in a text channel and a voice channel on desktop, web and mobile, and play one hand with two accounts.
