---
name: cerebro-composio
description: Shared Composio utilities for Outlook/Gmail/Google Calendar/SharePoint access. Central source of @composio/core. Provides Graph API helpers, auth, date utilities, inbox, attachments. v2.1.0
version: 2.1.0
tags: [cerebro, composio, outlook, email, calendar, sharepoint, graph-api]
---

# cerebro-composio

Shared utilities for all Microsoft Graph API and OAuth integrations via Composio. This is the **single source of truth** for `@composio/core` — no other skill installs it.

> **Outlook reads — priority order:**
> 1. **Anthropic Outlook MCP** (`mcp__claude_ai_Microsoft_365__outlook_calendar_search`, `outlook_email_search`) — **work-machine only**; may fail if MCP server is unavailable
> 2. **Composio CLI** (`~/.composio/composio execute`) — fallback for reads; primary for **write** operations (drafts, mark-as-read)
> 3. **Node scripts** (inbox.js etc.) — last resort; note that `proxyExecute` is blocked on this Composio account so Outlook scripts will fail
>
> On non-work-machine machines the MCP is not available — go straight to CLI.

## Files

| File | Purpose |
|------|---------|
| `composio.js` | Core client, Graph API helpers, date utils, account IDs |
| `inbox.js` | Personal + shared Outlook inbox fetching |
| `attachments.js` | Email attachment listing and download |
| `teams.js` | Microsoft Teams DMs and group chats |
| `draft-email.js` | Create Outlook draft emails |
| `email.js` | Legacy — superseded by inbox.js |

## CLI (Preferred)

Always use `~/.composio/composio` (full path). Connected toolkits: `outlook`, `slack`, `notion`.

```bash
# Fetch unread emails (inbox)
~/.composio/composio execute OUTLOOK_QUERY_EMAILS \
  -d '{"filter": "isRead eq false and receivedDateTime ge 2026-05-13T07:00:00Z", "top": 50}'

# Read a specific message
~/.composio/composio execute OUTLOOK_GET_MESSAGE \
  -d '{"message_id": "<id>"}'

# Mark messages as read
~/.composio/composio execute OUTLOOK_BATCH_UPDATE_MESSAGES \
  -d '{"updates": [{"message_id": "<id>", "patch": {"isRead": true}}]}'

# Create email draft (SAFE — never sends)
~/.composio/composio execute OUTLOOK_CREATE_DRAFT \
  -d '{"subject": "...", "body": "<p>Hi</p>", "is_html": true, "to_recipients": ["email@company.com"]}'

# List calendar events
~/.composio/composio execute OUTLOOK_LIST_EVENTS \
  -d '{"start_date_time": "2026-05-13T00:00:00Z", "end_date_time": "2026-05-13T23:59:59Z"}'

# Get calendar view (alternative, returns recurring instances expanded)
~/.composio/composio execute OUTLOOK_GET_CALENDAR_VIEW \
  -d '{"start_datetime": "2026-05-13T00:00:00Z", "end_datetime": "2026-05-13T23:59:59Z", "timezone": "Europe/Madrid"}'

# Inspect any tool schema
~/.composio/composio execute OUTLOOK_QUERY_EMAILS --get-schema
```

**Fall back to Node scripts** when: multi-step logic, attachment handling, timezone conversion, complex output formatting, or shared-mailbox delegation is needed.

---

## Quick Start (Node script fallback)

```bash
# Check auth
node "Claude System/Skills/cerebro-composio/inbox.js" --check-auth

# Fetch personal today's unread emails (JSON)
node "Claude System/Skills/cerebro-composio/inbox.js"

# Human-readable
node "Claude System/Skills/cerebro-composio/inbox.js" --format human

# Since a specific date
node "Claude System/Skills/cerebro-composio/inbox.js" --since 2026-03-24

# Last 4 hours (travel mode)
node "Claude System/Skills/cerebro-composio/inbox.js" --hours 4

# Shared inboxes (lunch-check only)
node "Claude System/Skills/cerebro-composio/inbox.js" --shared --format human

# Mark specific email as read (by messageId)
node "Claude System/Skills/cerebro-composio/inbox.js" --mark-read <messageId>

# Mark ALL unread emails as read
node "Claude System/Skills/cerebro-composio/inbox.js" --mark-read all

# List attachments on an email
node "Claude System/Skills/cerebro-composio/attachments.js" --message <messageId> --list

# Download an attachment
node "Claude System/Skills/cerebro-composio/attachments.js" --message <id> --attachment <attId> --out /tmp/file.png
```

## Connected Accounts

| Service | Account ID | Status |
|---------|-----------|--------|
| Outlook (primary) | `YOUR_OUTLOOK_ACCOUNT_ID` | Mail.Read/Write, Calendars.Read, shared mailboxes |
| Outlook (secondary) | `YOUR_OUTLOOK_ACCOUNT_ID_2` | Active |
| Gmail | `YOUR_GMAIL_ACCOUNT_ID` | Active — `your-username@gmail.com`, 103k messages |
| Google Calendar | `YOUR_GCAL_ACCOUNT_ID` | Active |
| SharePoint | `YOUR_SHAREPOINT_ACCOUNT_ID` | company.sharepoint.com, AllSites.FullControl |

**Always use the constants from composio.js:** `OUTLOOK_ID`, `GMAIL_ID`, `GCAL_ID`, `SHAREPOINT_ID`

## Google Calendar

Uses `proxyExecute` with Google Calendar API. Script: `calendar.js`

```bash
# Check auth
node "Claude System/Skills/cerebro-composio/calendar.js" --check-auth

# Today's events (default)
node "Claude System/Skills/cerebro-composio/calendar.js" --format human

# Next 3 days
node "Claude System/Skills/cerebro-composio/calendar.js" --days 3 --format human

# Next 7 days
node "Claude System/Skills/cerebro-composio/calendar.js" --days 7 --format human

# Since specific date
node "Claude System/Skills/cerebro-composio/calendar.js" --since 2026-03-28 --format human

# Check OOO today (exit code 0 = OOO found, 1 = not OOO)
node "Claude System/Skills/cerebro-composio/calendar.js" --ooo; echo "OOO=$?"

# JSON output
node "Claude System/Skills/cerebro-composio/calendar.js" --days 7 --format json
```

Note: All-day events with names like "Kirsi" are birthday reminders. "Review tasks" self-reminder blocks should be skipped.

## Gmail

Uses `proxyExecute` with Gmail API (not Graph API). Script: `gmail.js`

```bash
# Check auth
node "Claude System/Skills/cerebro-composio/gmail.js" --check-auth

# Fetch unread since BCN midnight (default)
node "Claude System/Skills/cerebro-composio/gmail.js" --format human

# Last 4 hours
node "Claude System/Skills/cerebro-composio/gmail.js" --hours 4 --format human

# Since specific date
node "Claude System/Skills/cerebro-composio/gmail.js" --since 2026-03-24 --format human

# Include read emails
node "Claude System/Skills/cerebro-composio/gmail.js" --all --format human

# Mark specific email as read (by messageId)
node "Claude System/Skills/cerebro-composio/gmail.js" --mark-read <messageId>

# Mark ALL unread emails as read
node "Claude System/Skills/cerebro-composio/gmail.js" --mark-read all

# JSON output
node "Claude System/Skills/cerebro-composio/gmail.js" --top 50
```

Gmail API uses Unix timestamps for date filtering (seconds). Uses `proxyExecute` with endpoint pattern:
```
GET https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=N&q=after:<unix_ts>
```

## Correct proxyExecute Pattern

```js
const { createClient, OUTLOOK_ID, graphGet, graphPost } = require('./composio');

const client = createClient();          // 60s timeout (default)
const client = createClient(120000);    // 2-min timeout for attachments

// GET — use graphGet() helper, not raw proxyExecute
const data = await graphGet(client, OUTLOOK_ID, '/v1.0/me/messages?$filter=...');
// data.value = array of messages; data = single object for non-list endpoints

// POST — use graphPost() helper
const created = await graphPost(client, OUTLOOK_ID, '/v1.0/me/messages', {
  subject: 'Draft',
  body: { contentType: 'HTML', content: '<p>Hello</p>' },
  toRecipients: [{ emailAddress: { address: 'someone@example.com' } }]
});
```

## Graph API Filter Rules

```js
// ✅ WORKS — date range filter (always use this)
`receivedDateTime ge ${sinceISO} and isRead eq false`

// ✅ WORKS — then filter client-side
emails.filter(m => m.subject?.toLowerCase().includes('keyword'))

// ❌ FAILS — Graph returns InefficientFilter error
`$filter=contains(subject,'keyword')`
`$search="keyword"`    // fails on /messages without special request headers
```

## Attachment Rules

```js
const { listAttachments, fetchAttachment } = require('./attachments');

// 1. List metadata (safe — no contentBytes in $select)
const list = await listAttachments(client, messageId);
// → [{ id, name, contentType, isInline, size }]

// 2. Download to disk (always use 2-min timeout client)
const longClient = createClient(120000);
await fetchAttachment(longClient, messageId, list[0].id, '/tmp/file.png');
```

**Critical rules:**
- `hasAttachments: false` does NOT mean no inline images — `cid:` references appear in `/attachments` with `isInline: true`
- Never add `$select=contentBytes` to attachment endpoint — it breaks the response (Graph casts to base type)
- Files >50KB require `createClient(120000)` — default 60s proxy timeout is too short

## Shared Mailboxes (lunch-check only)

```js
// proxyExecute to delegated mailbox
const endpoint = `/v1.0/users/${encodeURIComponent(email)}/mailFolders/inbox/messages?$filter=...`;
const data = await graphGet(client, OUTLOOK_ID, endpoint);
```

Shared inboxes checked during lunch-check:
- `licensemanagement@company.com`
- `[USER]@company.com`
- `tools.admin@company.onmicrosoft.com`
- `techinnovation@company.com`

## SharePoint Access

```js
const { graphGet, SHAREPOINT_ID } = require('./composio');

// List all sites
const data = await graphGet(client, SHAREPOINT_ID, '/v1.0/sites?search=*');

// Get site drive
await graphGet(client, SHAREPOINT_ID, '/v1.0/sites/company.sharepoint.com:/sites/SITENAME:/drive/root/children');
```

**Use on-demand only** — when [USER] shares a SharePoint link and needs a doc read. Do not poll routinely.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `getEntity is not a function` | Use `createClient()` / `graphGet()` — not `client.getEntity()` |
| `proxyExecute is not a function` on connectedAccounts | `proxyExecute` is on `client.tools`, not `client.connectedAccounts` |
| `InefficientFilter` error | Remove `contains(subject,...)` — filter client-side instead |
| `BadRequest` on attachment | Remove `$select` from attachment endpoint |
| Timeout on large attachment | Use `createClient(120000)` (2-minute timeout) |
| No emails returned | Check OData filter syntax; verify `isRead eq false` logic |
| Auth expired / null account | Re-authenticate via Composio dashboard |
| Toolkit slug returns null | Use **lowercase** slug: `'outlook'` not `'OUTLOOK'` |
| Module not found | Ensure `node_modules/` present in `cerebro-composio/` — never npm install elsewhere |
