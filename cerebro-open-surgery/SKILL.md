---
name: cerebro-open-surgery
description: Posts the weekly Open Surgery reminder to the relevant Slack channels. Called automatically by cerebro-daily-prep on Mondays and Fridays. Checks the calendar first — if the block has been moved or cancelled, skips silently.
version: 1.0.0
tags: [cerebro, slack, open-surgery, reminders]
---

# Cerebro Open Surgery

Posts [USER]'s Open Surgery availability reminder to Slack. Run as part of daily prep on Mondays and Fridays only.

## When to run

| Day | Time block | Channels | Timezones shown |
|---|---|---|---|
| Friday | [TIME_BLOCK] | [YOUR_CHANNEL_1] + [YOUR_CHANNEL_2] | [Your timezone flags] |
| Monday | [TIME_BLOCK] | [YOUR_CHANNEL_1] only | [Your timezone flag] |

**Never run on other days.**

---

## Step 1 — Calendar check

Fetch today's calendar:
```bash
node "Claude System/Skills/cerebro-calendar/calendar.js" --date DATE --format json
```

Search the results for an event whose title contains "Open Surgery" (case-insensitive).

- **Found** → proceed to Step 2.
- **Not found** → skip silently. Output one line: `Open Surgery: not on calendar today — skipped.` Do not post to Slack.

This handles cancellations, rescheduled blocks, and holidays automatically — if [USER] moved or removed it, it won't appear.

---

## Step 2 — Post to Slack

Use `mcp__claude_ai_Slack__slack_send_message`. Do not use a draft — post directly.

### Friday message (both channels: YOUR_CHANNEL_1_ID and YOUR_CHANNEL_2_ID)

```
👋 Reminder: every Friday I keep [TIME_BLOCK] free for Open Surgery.

It's unstructured time I set aside for you — whether it's something you're stuck on, a decision you want a second opinion on, a project update, or just a chat. No agenda needed.

[Your City / timezone]: [TIME_BLOCK]
[Other office / timezone]: [CONVERTED_TIME] (optional — remove if single-office)

Grab me on a Slack huddle or catch me in person if you're in the office. Just ping me here.
```

### Monday message ([YOUR_CHANNEL_1] only: YOUR_CHANNEL_1_ID)

```
👋 Reminder: every Monday I keep [TIME_BLOCK] free for Open Surgery.

It's unstructured time I set aside for you — whether it's something you're stuck on, a decision you want a second opinion on, a project update, or just a chat. No agenda needed.

[Your City / timezone]: [TIME_BLOCK]

Grab me on a Slack huddle or catch me in person if you're in the office. Just ping me here.
```

---

## Output

Return one line summarising what happened:

- `Open Surgery: posted to [YOUR_CHANNEL_1] + [YOUR_CHANNEL_2] (Friday, [TIME_BLOCK]).`
- `Open Surgery: posted to [YOUR_CHANNEL_1] (Monday, [TIME_BLOCK]).`
- `Open Surgery: not on calendar today — skipped.`
