---
name: cerebro-calendar
description: Fetch Outlook calendar events via Composio. Handles self-bootstrap, OAuth check, and UTC→BCN timezone conversion. Use when accessing [USER]'s calendar for any purpose.
version: 1.0.0
tags: [cerebro, calendar, outlook, composio, work]
---

# cerebro-calendar

Reusable Outlook calendar access via Composio. Handles all the plumbing:
- Self-installs `@composio/core` if `node_modules` missing
- Validates OAuth before fetching (warns clearly if expired)
- Converts Outlook's UTC timestamps to Europe/Madrid (Barcelona) time
- Outputs clean JSON for programmatic use, or human-readable for direct display

**Work machine only** (work-machine) — Outlook is only connected at work.

## Script Location

```
Claude System/Skills/cerebro-calendar/calendar.js
```

## Usage

### CLI (Preferred)

```bash
# Today's events
~/.composio/composio execute OUTLOOK_GET_CALENDAR_VIEW \
  -d '{"start_date_time": "2026-05-13T00:00:00Z", "end_date_time": "2026-05-13T23:59:59Z"}'

# Date range
~/.composio/composio execute OUTLOOK_GET_CALENDAR_VIEW \
  -d '{"start_date_time": "2026-05-13T00:00:00Z", "end_date_time": "2026-05-16T23:59:59Z"}'

# Alternatively — returns recurring instances expanded
~/.composio/composio execute OUTLOOK_LIST_EVENTS \
  -d '{"start_date_time": "2026-05-13T00:00:00Z", "end_date_time": "2026-05-13T23:59:59Z"}'
```

> CLI output is UTC — add 2 hours for Barcelona (CEST). Use the Node script when timezone-formatted output is needed for display.

### Node Script (Fallback — timezone conversion, formatted output)

Run from any directory — the script uses its own directory for deps:

```bash
# Auth check (run first if things seem broken)
node "Claude System/Skills/cerebro-calendar/calendar.js" --check-auth

# Today's events (JSON)
node "Claude System/Skills/cerebro-calendar/calendar.js"

# Specific date (JSON)
node "Claude System/Skills/cerebro-calendar/calendar.js" 2026-02-18

# Date range (JSON)
node "Claude System/Skills/cerebro-calendar/calendar.js" --from 2026-02-17 --to 2026-02-21

# Next N days (JSON)
node "Claude System/Skills/cerebro-calendar/calendar.js" --days 5

# Human-readable output (for display)
node "Claude System/Skills/cerebro-calendar/calendar.js" --format human
node "Claude System/Skills/cerebro-calendar/calendar.js" 2026-02-18 --format human
```

## JSON Output Structure

Each event in the returned array:

```json
{
  "id": "AAMkADc...",
  "subject": "Product Design Weekly",
  "date": "2026-02-17",
  "start": "10:30",
  "end": "11:00",
  "isAllDay": false,
  "isCancelled": false,
  "isRecurring": true,
  "location": "Microsoft Teams",
  "onlineMeeting": "https://teams.microsoft.com/...",
  "attendees": [
    { "name": "[DR3]", "email": "sofia@...", "type": "required" }
  ],
  "organizer": { "name": "[USER]", "email": "..." },
  "body": "First 500 chars of meeting body (HTML stripped)..."
}
```

## Creating & Updating Events

**CRITICAL — Timezone rule:** Outlook's API stores times in UTC. [USER] is always in Barcelona (Europe/Madrid). You MUST convert before passing any datetime:

| Barcelona (local) | UTC to pass |
|---|---|
| CEST (late Mar–late Oct) | subtract 2 hours |
| CET (late Oct–late Mar) | subtract 1 hour |

**Always pass UTC to the API, never local time.**

```bash
# Create event at 15:30 BCN (CEST, UTC+2) → pass 13:30 UTC
~/.composio/composio execute OUTLOOK_CALENDAR_CREATE_EVENT -d '{
  "subject": "Event title",
  "start_datetime": "2026-05-20T13:30:00Z",
  "end_datetime": "2026-05-20T14:30:00Z",
  "time_zone": "UTC",
  "show_as": "busy"
}'

# Update event — same rule applies
~/.composio/composio execute OUTLOOK_UPDATE_EVENT -d '{
  "event_id": "AAMk...",
  "start_datetime": "2026-05-20T13:30:00Z",
  "end_datetime": "2026-05-20T14:30:00Z"
}'
```


## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Outlook not connected` | Run `--check-auth`, then `/connect-apps` to re-auth |
| `No events data returned` | Auth likely expired — same fix as above |
| `Cannot find module '@composio/core'` | Delete `node_modules/` in skill dir and re-run (auto-installs) |
| Events on wrong day | UTC pagination bug — script already handles via UTC→BCN conversion |

## Auth Pattern (Critical)

Composio OAuth **expires**. Before using in a new session, verify:

```bash
node "Claude System/Skills/cerebro-calendar/calendar.js" --check-auth
```

If `connected: false`:
1. Run the `connect-apps` skill to get a re-auth link
2. Complete OAuth in browser
3. Re-run calendar.js

The `COMPOSIO_API_KEY` must be set in the environment (it's in `~/.zshrc`).

## Notes

- `isCancelled: true` events are included in JSON but marked — filter for display
- Focus Time events have "Focus" in subject — skip for meeting analysis
- All-day events: `isAllDay: true`, start/end times show "00:00"
- Multi-day fetches deduplicate by event `id`
