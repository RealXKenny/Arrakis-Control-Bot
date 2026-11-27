# Suggestion forum assistant

The suggestion assistant manages a Discord forum channel of community suggestions. It runs inside the bot with no paid AI service, no model download and no GPU, so it fits the same shared hosting as the bot. Everything is classical text analysis in plain TypeScript: a keyword lexicon, a TF-IDF similarity index, and extractive summaries. The index for a few thousand posts uses a few megabytes of memory.

## What it does

- **Tags new posts.** When a member opens a post with no category tag, the assistant picks up to two of Idea, Game, Server, Bots, Events, Rules and Cosmetic, and adds Under Review. Members' own tag choices are never removed. The classifier starts from a keyword list and also learns from posts staff have already tagged, so it improves as the forum grows.
- **Replies to the suggester.** Each new post gets a short reply that mentions the post's own topic, quotes the detail that says the most, names the tags it chose and any very similar earlier post, and asks a follow-up question when the post is short. Replies are put together from many phrase variations, so they read differently from post to post.
- **Staff status panel.** The same reply carries the status buttons. Only staff can press them.

  | Button | Forum tag | Meaning |
  |---|---|---|
  | 📋 Planned | Planned | Accepted and on the to-do list. |
  | 🔨 Working on it | In Progress | Someone is building it now. |
  | ⏸️ Back burner | Back Burner | Good idea, on hold for later. |
  | ❌ Not doing | Not Doing | Declined. The thread stays open. |
  | ✅ Added | Implemented | Done and live on the server. |

  Pressing a button swaps the status tag, refreshes the panel, and posts a short message that tells the suggester (with a mention) what changed. The message is worded for the status and the post, and mentions how many members supported it when that is relevant. The existing Approved tag is kept, except when a post goes back to review or is marked Not doing.
- **Talks back.** Mention the bot (or reply to one of its messages) inside a suggestion post and ask in your own words: "any update?", "is this a duplicate?", "sum it up", "what do you think?", "thanks". It works out what you mean and answers from what it actually knows about the post: its status, the GitHub work it has linked, similar posts and the discussion. It never invents dates, stays neutral on whether an idea is good, and pings only the member who asked. Each member gets one answer every 15 seconds per post, and a post gets at most five answers a minute.
- **Finds duplicates.** New posts list up to three similar posts. Anyone can press **Find similar** or run `/suggestions similar` for a longer list.
- **Summarizes discussions.** Anyone can press **Summarize discussion** or run `/suggestions summary` to see a private summary: how many members took part, how many are in favour or against, the most discussed words, and up to four key points quoted from the discussion. By default the assistant also posts a summary publicly every 50 replies.
- **Follows GitHub by itself (autopilot).** Every 15 minutes the assistant reads the configured GitHub repositories (read-only): open issues, open and merged pull requests, commits on the default branch, and published releases. When one matches a suggestion, it moves the suggestion forward without anyone pressing a button:

  | On GitHub | Suggestion becomes |
  |---|---|
  | An open issue (for example a roadmap item) | Planned |
  | An open or merged pull request, or a commit | In Progress |
  | A release whose notes mention it, or a release published after its linked work was merged | Implemented |

  Each move posts a reply in its own words with a link to the issue, pull request, commit or release, mentions only the suggester, and lists the work under **On GitHub** in the panel. To link work directly, put the suggestion's Discord link (or `suggestion: <post ID>`) in an issue, pull request or commit message.

  Staff buttons always win. The autopilot only moves a suggestion forward (Under Review, Planned, In Progress, Implemented), never touches a post marked Back burner, Not doing or Added, and acts on each piece of GitHub work once, so a status staff set back by hand stays there. Finished work only counts for suggestions posted before it happened. At most 10 suggestions move per check; the rest follow on the next one.
- **Catches up older posts.** On startup the assistant adds category and Under Review tags and its panel to older posts that have none, one post every couple of seconds, without pinging anyone. Archived posts are put back to sleep afterwards.
- **Links your work to suggestions.** When you start on a feature, `/suggestions feature start` finds the matching suggestions. Pick the ones it covers and they all move to Working on it, with a message in each thread. When it ships, `/suggestions feature done` moves every linked suggestion to Added and can include a release or roadmap link.

## Setup

1. Set `SUGGESTIONS_FORUM_CHANNEL_ID` to the forum channel's ID. PostgreSQL (`DATABASE_URL`) is required; the assistant keeps its index, panel message IDs and feature links there.
2. Give the bot these permissions in the forum: View Channel, Send Messages in Threads, Read Message History, Manage Threads (to change tags on members' posts and reopen archived posts), and Manage Channels (only needed once, to create missing status tags).
3. Restart the bot. On startup it creates any missing status tags (Planned, In Progress, Back Burner, Not Doing, Implemented, Under Review) as staff-only tags, then reads up to `SUGGESTIONS_BACKFILL_LIMIT` older posts into the index. Discord allows 20 tags per forum; if there is no room, the log says which tags are missing.
4. Older posts get tags and a panel automatically at startup (`SUGGESTIONS_CATCHUP`). `/suggestions panel` inside a post refreshes it.
5. The autopilot reads `RealXKenny/Arrakis-Control-Bot` and `RealXKenny/Arrakis-Control-Dashboard` by default. Without a token GitHub allows 60 requests an hour, which covers both repositories at the default 15-minute interval because unchanged answers are revalidated and cost nothing. For private repositories or a shorter interval, set `SUGGESTIONS_GITHUB_TOKEN` to a fine-grained token with **read-only** access to Contents, Issues, Pull requests and Metadata. The token is never logged. When the limit runs low the autopilot pauses until GitHub resets it.

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
| `SUGGESTIONS_CATCHUP` | `true` | Add tags and the panel to older posts that have none, without pings. |
| `SUGGESTIONS_AUTOPILOT` | `true` | Follow GitHub and move statuses automatically. |
| `SUGGESTIONS_GITHUB_REPOS` | both Arrakis Control repositories | Comma-separated `owner/name` repositories to read (up to 10). |
| `SUGGESTIONS_GITHUB_TOKEN` | empty | Optional read-only token; raises GitHub's limit to 5000 requests an hour. |
| `SUGGESTIONS_GITHUB_INTERVAL_MINUTES` | `15` | Minutes between checks (5 to 1440). |
| `SUGGESTIONS_AUTOPILOT_THRESHOLD` | `0.3` | How alike GitHub work and a suggestion must be (0.1 to 0.95) before it moves. Higher means fewer, surer moves. |

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
- Summaries describe the discussion in a few plain sentences built from counts and the most used words, then quote what members wrote; they never put words in anyone's mouth. Support and opposition are counted from clear phrases such as "+1", "agree" or "bad idea", using each member's latest stance.
- Replies are generated from phrase banks and the post's own title, so they are varied but never invent facts.
- The index lives in memory and is rebuilt from PostgreSQL at startup.
- The autopilot matches GitHub work by wording too, and needs at least two shared words. A pull request titled very differently from the suggestion will not match; link the suggestion in its description instead. Labels named security, private, internal, confidential or embargoed are never read, nor are bot-authored items, merge commits or release housekeeping.
