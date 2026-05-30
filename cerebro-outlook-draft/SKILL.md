# cerebro-outlook-draft

Prepare a Microsoft **Outlook** draft email — **work machine only, never Gmail**.
Saves to Drafts folder for [USER] to review and send. Never sends automatically.

## Availability

| Machine | Available |
|---------|-----------|
| Work (work-machine) | ✅ Outlook / [COMPANY] account |
| Home (home-machine) | ❌ No Outlook — use Gmail MCP instead |

Do **not** invoke this skill at home. At home, email = Gmail (personal account).

## When to use

- User asks to "draft an email", "prepare an email", "write an email to [person]"
- Context is work-related ([COMPANY] colleagues, work topics)
- Running on the work machine (work-machine)

## Critical rule

**NEVER send.** Always create a draft for [USER] to review:
- CLI: use `OUTLOOK_CREATE_DRAFT` — **never** `OUTLOOK_SEND_EMAIL`
- Node: use `draft-email.js` — **never** pass send flags

## Workflow

1. **Gather required info** — ask if not provided:
   - Recipients (names / roles acceptable; resolve to emails via Outlook or Granola)
   - Subject
   - Body content + context (tone, purpose, any links to include)

2. **Draft the body** — write it yourself based on context. British English. Concise.
   Do not show the draft to the user first — just create it. They review in Outlook.
   **Never add a signature or sign-off** (e.g. "Best regards, [USER]", "[USER]") — Outlook inserts the signature automatically.
   **Always write the body as HTML** — plain text renders markdown literally in Outlook.

3. **Create the draft:**

### CLI (Preferred)

```bash
~/.composio/composio execute OUTLOOK_CREATE_DRAFT \
  -d '{
    "subject": "Subject here",
    "body": "<p>Hi all,</p><p>Body text here.</p>",
    "is_html": true,
    "to_recipients": ["email1@company.com", "email2@company.com"]
  }'
```

For CC: add `"cc_recipients": ["email@domain.com"]` to the JSON.

### Node Script (Fallback)

```bash
node "Claude System/Skills/cerebro-composio/draft-email.js" \
  --to "email1@company.com,email2@company.com" \
  --subject "Subject here" \
  --body "<p>Body text here</p>"
```

With a body file (preferred for structured emails):

```bash
node "Claude System/Skills/cerebro-composio/draft-email.js" \
  --to "email@company.com" \
  --subject "Subject" \
  --body-file /tmp/email-body.html
```

4. **Confirm to user:** Tell them the draft is in Outlook Drafts, subject + recipients. Done.

## Getting recipient emails

Priority order:
1. From the conversation context (already known)
2. From Granola meeting attendees (`mcp__granola__get_meetings`)
3. From Outlook calendar event attendees (`OUTLOOK_LIST_EVENTS` via cerebro-composio)

[COMPANY] format: `firstname.lastname@company.com`

## Example invocation

```bash
node "Claude System/Skills/cerebro-composio/draft-email.js" \
  --to "person1@company.com,person2@company.com" \
  --subject "Team Update — Reading & Resources" \
  --body-file /tmp/email-body.html
```

Where `/tmp/email-body.html` contains:
```html
<p>Hi all,</p>
<p>Following Thursday's session, I've put together a reading list...</p>
```

Expected output:
```
✓ Draft saved (id: AAMkADQ...)
  Subject : Team Update — Reading & Resources
  To      : person1@company.com, ...
  Open Outlook → Drafts to review and send.
```
