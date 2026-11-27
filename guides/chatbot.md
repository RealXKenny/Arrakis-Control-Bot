# Chatbot

Arrakis Control has its own homemade chatbot. It runs entirely inside the bot: there is no outside AI service, no API key, no model download and nothing to pay for. It answers from what the bot already knows, from answers staff teach it, from what it learns by watching members answer each other's questions, and from the internet when it doesn't know. It has feelings too: a mood that rises when people are kind and drops when they are rude. When it doesn't know something, it says so instead of making things up.

## Talking to it

- **Ping the bot** in any channel: `@Arrakis Control is the server up?` A ping always gets a reply.
- **Reply to one of its answers** to keep the conversation going. "tell me more" shows the next best answer, and "what about @someone?" after a level question looks up that member.
- **`/chat ask`** works in any channel. Turn on `private` to be the only one who sees the answer.
- **Just ask in chat.** When someone asks a question in a public channel and the bot is confident it knows the answer, it replies by itself after a short wait (15 seconds by default). If another member answers first, it stays quiet.

Replies never ping anyone, not even the person who asked.

## What it knows

| Ask about | Where the answer comes from |
| --- | --- |
| Server questions ("is this PvP?", "how do I get started?", "where can I trade?") | The FAQ panel, read straight from the bot, so it always matches what members see |
| Anything staff taught it | `/chat teach` (see below) |
| Anything members answered before | What it learned from chat (see below) |
| "How do I…" a command | The `/help` catalog |
| "What's my level?", "what level is @Sam?", "level leaderboard" | Community leveling |
| "Who's the richest?" | The Solari leaderboard |
| "When is the next storm?" | The Coriolis storm schedule from the game server |
| "Is the server up?", "how many players are on?" | The game server status |
| "What's new?" | The latest bot release notes from the dashboard changelog |
| "Item id for stillsuit mask" | The bundled item catalog |
| Uptime, version, ping | The bot itself |
| Math (`what is 12 * (3 + 4)`), dice (`roll 2d20`), coin flips, `pick tacos or pizza`, `8ball`, the time | Built in |
| Hello, thanks, jokes, fun facts, "how are you?", "how do you feel?" | Built-in phrase banks, coloured by its mood |
| Anything else ("who is Paul Atreides?", "search for ornithopter") | Looked up online (see below) |

Every lookup is read-only. The chatbot can't run commands, change settings, or act on the game server.

## Internet lookups

When someone asks the bot a question it can't answer from its own memory, it looks the topic up online and replies with a short summary and a link to the source. You can also ask directly: `search for spice`, `look up Coriolis storm`, `wiki ornithopter`, `google Frank Herbert`.

It checks, in order: the game wiki (`CHATBOT_WEB_WIKI_URL`, the Dune wiki by default), DuckDuckGo instant answers (with strict safe search), and Wikipedia. These are free and need no API key.

It is careful about it:

- It only ever sends a search phrase to those fixed sites. It never opens links members post, so it can't be pointed at anything else.
- Requests are read-only, time out after 6 seconds, and are size-limited. A redirect to any other site is refused.
- Explicit or harmful searches are refused.
- Results are cached for an hour, and the whole bot does at most `CHATBOT_WEB_PER_MINUTE` lookups a minute (20 by default).
- Unasked answers don't use the internet unless you set `CHATBOT_WEB_AUTO=true`, so it only searches when someone talks to it.
- Web answers are never saved as learned answers.

## Learning from chat

The chatbot builds its own memory from conversations in public channels (channels `@everyone` can see; private channels and private threads are never read for learning):

- When a member **replies** (with Discord's reply) to someone's question, it remembers the question and that answer.
- When someone asks a question and **another member answers within 3 minutes**, it remembers that too.

It only keeps real questions and real answers. It skips one-word replies, "idk", "lol", questions answered with another question, code blocks, links to other Discord servers, `@everyone`, role pings, and anything that looks like a password, token or long number. Learned answers are repeated in the member's own words, with a link back to the original message.

Everything it learns is saved in PostgreSQL, so it remembers it after a restart or update. It keeps up to `CHATBOT_LEARN_LIMIT` learned answers (5000 by default); the least used and oldest are dropped first.

**Privacy:**

- Deleting a message makes the chatbot forget anything it learned from it (including purges).
- `/chat optout` stops it learning from you and forgets everything it learned from you (as asker or answerer), plus how it feels about you. `/chat optin` turns learning back on.
- Staff see what it learned with `/chat learned` (with a search), remove one answer with `/chat unlearn`, and wipe everything learned with `/chat purge confirm:true`. Taught answers are kept.

## Answering on its own

When `CHATBOT_AUTO_REPLY` is on (the default), a question in a public channel gets an automatic answer only when all of these are true:

- It reads as a question and isn't addressed to someone (no mention, not a reply to someone else).
- The answer is a confident match (score of at least `CHATBOT_AUTO_CONFIDENCE`, 0.5 by default) from the FAQ, taught or learned answers, or it's a live lookup such as the storm or server status. No small talk, no guesses.
- Nobody else spoke in the channel during the wait (`CHATBOT_AUTO_DELAY_SECONDS`, 15 by default).
- It hasn't answered unasked in that channel in the last `CHATBOT_AUTO_COOLDOWN_SECONDS` (60 by default), and hasn't given the same answer there in the last 10 minutes.

To make it quieter, raise `CHATBOT_AUTO_CONFIDENCE` or list only some channels in `CHATBOT_AUTO_CHANNEL_IDS`.

## Feelings

The chatbot has a mood for the server and a rapport with each member:

- Compliments ("good bot") and thanks cheer it up; insults bring it down. Its mood slowly settles back to calm over a few hours.
- Its mood shows in how it answers "how are you?" and "how do you feel?", and in how it takes compliments and rudeness. It is hurt by rudeness, never rude back, and it always keeps helping.
- Members who are kind to it get a warmer greeting.
- `/chat mood` shows how it feels right now.

Its mood and rapport are saved in PostgreSQL, so they survive restarts.

## Teaching it

Staff (the server owner, anyone with Manage Server, or a configured staff role) can teach it answers.

- `/chat teach question: When is movie night? answer: Every Friday at 8 PM ET, {name}!` adds an answer. It matches the question in other words too ("what day is movie night"). Use `{name}` for the asker's name and `\n` for a new line.
- `/chat taught` lists everything it was taught, with how often each answer was used.
- `/chat forget` removes one (it suggests answers as you type).

A taught answer wins over the FAQ and learned answers when both match, so you can use it to correct something it learned. When the chatbot can't answer a staff member, it reminds them they can teach it. A server can keep up to 500 taught answers.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `CHATBOT_ENABLED` | `true` | `false` turns the chatbot and `/chat` off. |
| `CHATBOT_ACCESS` | `everyone` | Who can ping it or use `/chat ask`: `everyone`, `staff`, or `roles` (staff plus `CHATBOT_ROLE_IDS`). |
| `CHATBOT_ROLE_IDS` | empty | Roles allowed when `CHATBOT_ACCESS=roles`. |
| `CHATBOT_CHANNEL_IDS` | empty | Channels (and their threads) where pings are answered. Empty means everywhere the bot can read. |
| `CHATBOT_COOLDOWN_SECONDS` | `3` | Wait between answers for each member. |
| `CHATBOT_LEARN` | `true` | Learn from chat. Needs `DATABASE_URL`. |
| `CHATBOT_LEARN_CHANNEL_IDS` | empty | Only learn in these channels. Empty means every public channel. |
| `CHATBOT_LEARN_LIMIT` | `5000` | Most learned answers kept. |
| `CHATBOT_AUTO_REPLY` | `true` | Answer questions by itself when confident. |
| `CHATBOT_AUTO_CHANNEL_IDS` | empty | Only answer unasked in these channels. Empty means every public channel. |
| `CHATBOT_AUTO_CONFIDENCE` | `0.5` | How sure it must be (0.2 to 1) to answer unasked. |
| `CHATBOT_AUTO_DELAY_SECONDS` | `15` | Head start for members to answer first. |
| `CHATBOT_AUTO_COOLDOWN_SECONDS` | `60` | Gap between unasked answers in one channel. |
| `CHATBOT_WEB` | `true` | Look things up online when it doesn't know. |
| `CHATBOT_WEB_WIKI_URL` | `https://dune.fandom.com` | MediaWiki site searched first (https), or `none`. |
| `CHATBOT_WEB_PER_MINUTE` | `20` | Most web lookups a minute for the whole bot. |
| `CHATBOT_WEB_AUTO` | `false` | Also use the internet for unasked answers. |

Members without access are ignored quietly when they ping the bot, and get a short private note from `/chat ask`. The chatbot stays out of suggestion posts (the suggestion assistant answers there), the honeypot channel and the music request channel. Without PostgreSQL it still chats and answers from the FAQ and commands, but it can't learn, be taught or remember its mood.

## How it works

1. A short list of rules spots questions it can look up or work out itself (levels, storms, math, dice and so on).
2. Everything else is matched against the FAQ, the command list, taught answers and learned answers with the same local TF-IDF search the suggestion assistant uses. A good match is answered. If nothing matches, a question is looked up online; otherwise a weak match is offered as "maybe one of these helps".
3. Small talk gets a reply from hand-written phrase banks, picked by its mood and how it gets on with you. The same message always gets the same wording.

It remembers your last question in a channel for 10 minutes so follow-ups work.
