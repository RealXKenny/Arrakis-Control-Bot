# Chatbot

Arrakis Control has its own homemade chatbot. It runs entirely inside the bot: there is no outside AI service, no API key, no model download and nothing to pay for. It answers from what the bot already knows and from answers your staff teach it, and when it doesn't know something it says so instead of making things up.

## Talking to it

- **Mention the bot** in any channel: `@Arrakis Control is the server up?`
- **Reply to one of its answers** to keep the conversation going. "tell me more" shows the next best answer, and "what about @someone?" after a level question looks up that member.
- **`/chat ask`** works in any channel. Turn on `private` to be the only one who sees the answer.

Replies never ping anyone, not even the person who asked.

## What it knows

| Ask about | Where the answer comes from |
| --- | --- |
| Server questions ("is this PvP?", "how do I get started?", "where can I trade?") | The FAQ panel, read straight from the bot, so it always matches what members see |
| Anything you taught it | `/chat teach` (see below) |
| "How do I…" a command | The `/help` catalog |
| "What's my level?", "what level is @Sam?", "level leaderboard" | Community leveling |
| "Who's the richest?" | The Solari leaderboard |
| "When is the next storm?" | The Coriolis storm schedule from the game server |
| "Is the server up?", "how many players are on?" | The game server status |
| "What's new?" | The latest bot release notes from the dashboard changelog |
| "Item id for stillsuit mask" | The bundled item catalog |
| Uptime, version, ping | The bot itself |
| Math (`what is 12 * (3 + 4)`), dice (`roll 2d20`), coin flips, `pick tacos or pizza`, `8ball`, the time | Built in |
| Hello, thanks, jokes, fun facts | Built-in phrase banks |

Every lookup is read-only. The chatbot can't run commands, change settings, or act on the game server.

## Teaching it

Staff (the server owner, anyone with Manage Server, or a configured staff role) can teach it new answers. This needs PostgreSQL (`DATABASE_URL`).

- `/chat teach question: When is movie night? answer: Every Friday at 8 PM ET, {name}!` adds an answer. It matches the question in other words too ("what day is movie night"). Use `{name}` for the asker's name and `\n` for a new line.
- `/chat taught` lists everything it was taught, with how often each answer was used.
- `/chat forget` removes one (it suggests answers as you type).

A taught answer wins over the FAQ when both match, so you can also use it to correct an answer. When the chatbot can't answer a staff member, it reminds them they can teach it. A server can keep up to 500 taught answers.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `CHATBOT_ENABLED` | `true` | `false` turns the chatbot and `/chat` off. |
| `CHATBOT_ACCESS` | `staff` | `staff`, `roles` (staff plus `CHATBOT_ROLE_IDS`) or `everyone`. Staff can always use it. |
| `CHATBOT_ROLE_IDS` | empty | Roles allowed when `CHATBOT_ACCESS=roles`. |
| `CHATBOT_CHANNEL_IDS` | empty | Channels (and their threads) where mentions are answered. Empty means everywhere the bot can read. |
| `CHATBOT_COOLDOWN_SECONDS` | `3` | Wait between answers for each member. |

Members without access are ignored quietly when they mention the bot, and get a short private note from `/chat ask`. The chatbot stays out of suggestion posts (the suggestion assistant answers there), the honeypot channel and the music request channel.

## How it works

1. A short list of rules spots questions it can look up or work out itself (levels, storms, math, dice and so on).
2. Everything else is matched against the FAQ, the command list and the taught answers with the same local TF-IDF search the suggestion assistant uses. A good match is answered; a weak one is offered as "maybe one of these helps".
3. Short greetings and small talk get a reply from hand-written phrase banks. The same message always gets the same wording.

It remembers your last question in a channel for 10 minutes so follow-ups work. Nothing is stored except taught answers.
