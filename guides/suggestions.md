# Suggestion forum assistant

The suggestion assistant manages a Discord forum channel of community suggestions. It runs inside the bot with no paid AI service, no model download and no GPU, so it fits the same shared hosting as the bot. Everything is classical text analysis in plain TypeScript: a keyword lexicon, a TF-IDF similarity index, and extractive summaries. The index for a few thousand posts uses a few megabytes of memory.

## What it does

- **Tags new posts.** When a member opens a post with no category tag, the assistant picks up to two of Idea, Game, Server, Bots, Events, Rules and Cosmetic, and adds Under Review. Members' own tag choices are never removed. The classifier starts from a keyword list and also learns from posts staff have already tagged, so it improves as the forum grows.
- **Replies to the suggester.** Each new post gets a short reply that mentions the post's own topic, the tags it chose, and any similar earlier posts. Replies are put together from many phrase variations, so they read differently from post to post.
- **Staff status panel.** The same reply carries the status buttons. Only staff can press them.

  | Button | Forum tag | Meaning |
  |---|---|---|
  | 📋 Planned | Planned | Accepted and on the to-do list. |
  | 🔨 Working on it | In Progress | Someone is building it now. |
  | ⏸️ Back burner | Back Burner | Good idea, on hold for later. |
  | ❌ Not doing | Not Doing | Declined. The thread stays open. |
  | ✅ Added | Implemented | Done and live on the server. |

  Pressing a button swaps the status tag, refreshes the panel, and posts a short message that tells the suggester (with a mention) what changed. The message is worded for the status and the post, and mentions how many members supported it when that is relevant. The existing Approved tag is kept, except when a post goes back to review or is marked Not doing.
- **Finds duplicates.** New posts list up to three similar posts. Anyone can press **Find similar** or run `/suggestions similar` for a longer list.
- **Summarizes discussions.** Anyone can press **Summarize discussion** or run `/suggestions summary` to see a private summary: how many members took part, how many are in favour or against, the most discussed words, and up to four key points quoted from the discussion. By default the assistant also posts a summary publicly every 50 replies.
- **Links your work to suggestions.** When you start on a feature, `/suggestions feature start` finds the matching suggestions. Pick the ones it covers and they all move to Working on it, with a message in each thread. When it ships, `/suggestions feature done` moves every linked suggestion to Added and can include a release or roadmap link.

## Setup

1. Set `SUGGESTIONS_FORUM_CHANNEL_ID` to the forum channel's ID. PostgreSQL (`DATABASE_URL`) is required; the assistant keeps its index, panel message IDs and feature links there.
2. Give the bot these permissions in the forum: View Channel, Send Messages in Threads, Read Message History, Manage Threads (to change tags on members' posts and reopen archived posts), and Manage Channels (only needed once, to create missing status tags).
3. Restart the bot. On startup it creates any missing status tags (Planned, In Progress, Back Burner, Not Doing, Implemented, Under Review) as staff-only tags, then reads up to `SUGGESTIONS_BACKFILL_LIMIT` older posts into the index. Discord allows 20 tags per forum; if there is no room, the log says which tags are missing.
4. Existing posts do not get a panel automatically. Run `/suggestions panel` inside a post to add one.

Staff means the server owner, anyone with Manage Threads, or anyone with a role from `TRIAL_STAFF_ROLE_ID`, `MODERATOR_ROLE_ID`, `SENIOR_MODERATOR_ROLE_ID`, `ADMINISTRATOR_ROLE_ID`, `HEAD_ADMINISTRATOR_ROLE_ID` or `OWNER_ROLE_ID`. Access is checked every time a button or command is used.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `SUGGESTIONS_FORUM_CHANNEL_ID` | empty (off) | Forum channel to manage. |
| `SUGGESTIONS_AUTO_TAG` | `true` | Tag new posts that have no category or status. |
| `SUGGESTIONS_STATUS_PANEL` | `true` | Post the reply and status buttons under new posts. |
| `SUGGESTIONS_NOTIFY_AUTHOR` | `true` | Mention the suggester in status updates. |
| `SUGGESTIONS_CREATE_TAGS` | `true` | Create missing status tags at startup. |
| `SUGGESTIONS_DUPLICATE_THRESHOLD` | `0.35` | How alike posts must be (0.1 to 0.95) to be listed as related. Lower finds more, with more false matches. |
| `SUGGESTIONS_AUTO_SUMMARY_MESSAGES` | `50` | Post a public summary every N replies. `0` turns this off. |
| `SUGGESTIONS_BACKFILL_LIMIT` | `500` | Most older posts read into the index at startup (0 to 5000). |

## Commands

| Command | Who | What it does |
|---|---|---|
| `/suggestions similar [post]` | Everyone | Private list of similar posts. |
| `/suggestions summary [post] [public]` | Everyone; `public` is staff only | Discussion summary. |
| `/suggestions status <status> [post] [note]` | Staff | Set any status, with an optional note shown in the thread. |
| `/suggestions panel [post]` | Staff | Post or refresh the assistant panel. |
| `/suggestions feature start <name> [keywords] [reference]` | Staff | Create a feature and choose the suggestions it covers. |
| `/suggestions feature link <feature> [post]` | Staff | Link one more suggestion to a feature in progress. |
| `/suggestions feature done <feature> [reference] [note]` | Staff | Mark the feature added and update all its suggestions. |
| `/suggestions feature list` | Staff | Features and how many suggestions each covers. |

`post` defaults to the post the command is run in. `reference` must be an `https://` link, such as a GitHub roadmap issue or release.

## Limits

- Matching is by wording, not meaning. "Desert heat" and "heat damage in the desert" match; two posts that describe the same idea in completely different words may not. Lower `SUGGESTIONS_DUPLICATE_THRESHOLD` or add keywords to `feature start` to widen the search.
- Summaries quote what members wrote; they do not write new sentences. Support and opposition are counted from clear phrases such as "+1", "agree" or "bad idea", using each member's latest stance.
- Replies are generated from phrase banks and the post's own title, so they are varied but never invent facts.
- The index lives in memory and is rebuilt from PostgreSQL at startup.
