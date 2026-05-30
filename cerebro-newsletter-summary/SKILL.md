---
name: cerebro-newsletter-summary
description: "Fetches and summarises [COMPANY] product and tech newsletters distributed via newsletters-prod@company.com. These are [COMPANY]-curated reading sent to the team — not personal subscriptions. Work machine (work-machine) only. Saves to Work/Newsletters/YYYY-WXX.md. Auto-triggered on Fridays during cerebro-weekly-review. Invocable manually as /cerebro-newsletter-summary."
---

# Cerebro Newsletter Summary — Work

Fetches [COMPANY] newsletters from Outlook and summarises them. One weekly file, generated incrementally — re-running the same week appends new items rather than overwriting.

**Work machine (work-machine) only.** For personal/Gmail newsletters, run `/cerebro-newsletter-summary` from the personal vault.

## State Tracking

State file: `Claude System/newsletter_state.json` — key: `work.last_run` (ISO date).

Read the file (create if missing). If `last_run` == today → stop silently. Otherwise set `since_date = max(last_run + 1 day, today − 14 days)`. Update `last_run` to today on success.

---

## Workflow (Outlook)

**Connection:** Composio CLI (preferred). MCP tools as fallback.

### Step 1 — Fetch newsletter emails

**CLI (preferred):**

```bash
~/.composio/composio execute OUTLOOK_QUERY_EMAILS \
  -d '{"filter": "receivedDateTime ge YYYY-MM-DDTHH:MM:SSZ", "top": 50}'
```

Then filter client-side for `from == newsletters-prod@company.com` (Graph API `from` filter is unreliable via CLI).

**MCP fallback:** `OUTLOOK_QUERY_EMAILS` with folder `inbox`, filter `from/emailAddress/address eq 'newsletters-prod@company.com' and receivedDateTime ge YYYY-MM-DDTHH:MM:SSZ`, top 50.

### Step 2 — Read full content

**CLI (preferred):**

```bash
~/.composio/composio execute OUTLOOK_GET_MESSAGE -d '{"message_id": "<id>"}'
```

**MCP fallback:** `OUTLOOK_GET_MESSAGE` with `select: [subject, body, receivedDateTime, from]`. Strip HTML.

### Step 3 — Summarise

For each newsletter:

```markdown
### [Publication / Author] — [YYYY-MM-DD]

**[Subject line or headline]**
- [Key point 1 — specific, one idea]
- [Key point 2]
- [Key point 3]
```

Max 3 bullets per newsletter. One idea each, plain English. Specific insight or data point where possible. Skip promotional filler.

### Step 4 — Write output

Output: `Work/Newsletters/YYYY-WXX.md` (ISO week of today). Create the folder if it doesn't exist.

If the file already exists, **append** new summaries (don't overwrite). Add a `---` separator before new content.

File header (on first creation):

```markdown
# Newsletter Summary — Week XX, YYYY
_Last updated: YYYY-MM-DD_

---
```

When invoked automatically, surface one line: `📰 Newsletters: X newsletters summarised → Work/Newsletters/YYYY-WXX.md` or `📰 Newsletters: nothing new since [date]`. Already run today → skip silently.
