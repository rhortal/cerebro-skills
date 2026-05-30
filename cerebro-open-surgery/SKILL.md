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
| Friday | 09:30–10:50 | #product-team + #engineering | 🇪🇸 BCN + 🇮🇳 IST |
| Monday | 14:30–15:50 | #product-team only | 🇪🇸 BCN only |

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

### Friday message (both channels: YOUR_PROD_CHANNEL_ID and YOUR_ENG_CHANNEL_ID)

```
👋 Reminder: every Friday I keep 9:30–10:50 free for Open Surgery.

It's unstructured time I set aside for you — whether it's something you're stuck on, a decision you want a second opinion on, a project update, or just a chat. No agenda needed.

🇪🇸 [Your City]: 9:30–10:50
🇮🇳 [Other Office]: 13:00–14:20

Grab me on a Slack huddle or catch me in person if you're in the office. Just ping me here.
```

### Monday message (#product-team only: YOUR_PROD_CHANNEL_ID)

```
👋 Reminder: every Monday I keep 14:30–15:50 free for Open Surgery.

It's unstructured time I set aside for you — whether it's something you're stuck on, a decision you want a second opinion on, a project update, or just a chat. No agenda needed.

🇪🇸 [Your City]: 14:30–15:50

Grab me on a Slack huddle or catch me in person if you're in the office. Just ping me here.
```

---

## Output

Return one line summarising what happened:

- `Open Surgery: posted to #product-team + #engineering (Friday, 09:30–10:50).`
- `Open Surgery: posted to #product-team (Monday, 14:30–15:50).`
- `Open Surgery: not on calendar today — skipped.`
