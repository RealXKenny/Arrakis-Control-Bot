# Staff applications

The staff application system provides an in-Discord application and review workflow backed by PostgreSQL. It is enabled only when both application channel values are configured.

## Setup

1. Create a public channel for the application panel and a private channel visible only to leadership and the bot.
2. Copy both channel IDs into `STAFF_APPLICATION_PANEL_CHANNEL_ID` and `STAFF_APPLICATION_REVIEW_CHANNEL_ID`.
3. Set `STAFF_APPLICATION_REVIEWER_ROLE_ID` to the leadership role allowed to accept or deny applications. The server owner, administrators, and existing configured staff roles are also authorized.
4. Optionally configure `STAFF_APPLICATION_PENDING_ROLE_ID` and `STAFF_APPLICATION_ACCEPTED_ROLE_ID`. Keep both roles below the bot's highest role and grant the bot **Manage Roles**.
5. Set `STAFF_APPLICATION_COOLDOWN_DAYS` from `0` (no cooldown) through `365`; the default is `7`.
6. Configure `DATABASE_URL`, restart the bot, and confirm that the application panel appears. No manual SQL is required.

## Workflow

Members press **Apply for Staff** and complete all five questions. The bot prevents a second pending application and posts a private review card. Authorized reviewers choose **Accept** or **Deny**, enter a decision reason, and the bot atomically records the first decision. It then removes the pending role, adds the accepted role when configured, updates the review card, writes an audit entry, and privately messages the applicant when their DMs are open.

The reapplication cooldown starts from the prior application's submission time. Failed role changes are reported to the reviewer without rolling back the recorded decision.

## Required bot permissions

- View Channel and Send Messages in both panel channels
- Read Message History to update the persistent public panel and review cards
- Manage Roles when pending or accepted roles are configured

Keep the review channel private. Authorization is checked again when the decision modal is submitted, but channel privacy prevents application answers from being exposed to regular members.
