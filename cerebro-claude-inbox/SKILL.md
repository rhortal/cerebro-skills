---
name: cerebro-claude-inbox
description: Use when checking [USER]'s work email on work-machine — checks claude-inbox@company.com for forwarded emails containing instructions. Run every time work email is reviewed.
version: 1.0.0
tags: [cerebro, inbox, outlook, work, maclan, tasks]
---

# Cerebro Claude Inbox

Checks `claude-inbox@company.com` — [USER]'s forwarded-task inbox. [USER] forwards emails here with instructions in the body. Read and execute anything unread.

**Work machine only (work-machine).** Never send from this inbox — read-only.

## When to Run

Every time work email is reviewed: daily-prep, lunch-check, session-review, or any ad-hoc email check.

## How to Check

### CLI (Preferred)

```bash
~/.composio/composio execute OUTLOOK_QUERY_EMAILS \
  -d '{"folder": "inbox", "filter": "isRead eq false", "top": 20}'
```

> Note: This fetches from the primary mailbox. The dedicated `claude-inbox@` delegated inbox may require the Node script fallback if the CLI connection doesn't have delegated access.

### Node Script (Fallback)

```bash
node "Claude System/Skills/cerebro-claude-inbox/check.js"
```

Script fetches from the delegated `claude-inbox@company.com` mailbox with full delegated access.

## What to Do With Each Message

Each unread message is a task. For every message found:

1. **Read the body** — [USER]'s instruction is in the forward text above the original email
2. **Execute the instruction** — treat it the same as a direct user request
3. **Report back** — summarise what you did for each message

**Pattern:** "Here's [email context]. [Instruction]."
- e.g. *"Here's new information about the team offsite. Create / update the plan."*

## If Inbox is Empty

One line is enough: "Claude inbox clear."

## Key Details

- **Connected account:** `OUTLOOK_ID` (`YOUR_CLAUDE_INBOX_ACCOUNT_ID`) — same as all other Outlook access
- **API endpoint:** `/v1.0/users/claude-inbox@company.com/mailFolders/inbox/messages`
- **Never use** `USER_ID` for this inbox — it requires `OUTLOOK_ID` (delegated access)
- **Never send** from this inbox — receive-only
