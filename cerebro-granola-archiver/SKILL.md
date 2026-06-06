---
name: cerebro-granola-archiver
description: Archives Granola transcripts, meeting notes, summaries to local vault as permanent backup. Prevents data loss.
version: 0.6.0
---

# Granola Archiver Skill

## Purpose

Backup Granola summaries, notes, transcripts to Obsidian vault.

**How it works:**
- MCP: metadata & AI summaries only (low cost)
- Transcripts: extracted from local cache via shell script — never in context
- No subagents

**Tools:**
- `mcp__granola__list_meetings` — date range queries
- `mcp__granola__get_meetings` — summary, attendees, notes
- `scripts/granola-append-transcript.sh` — local cache → file

**Transcript availability:** Cached ~5 most recent meetings only. Older ones show "*Transcript not available in local cache*" — normal.

---

## Step 1: Identify the Date Range

Determine the week or range to archive:
- **This week / last week**: Use Monday–Friday ISO dates (e.g., 2026-02-23 to 2026-02-27)
- **Custom range**: Any YYYY-MM-DD start/end
- **Limit**: Never archive more than 5 days at a time to protect context window
- **Lookback cap**: Default to no more than 3 months back from today unless [USER] explicitly requests an older date range.

---

## Step 2: Gap Analysis

Call `mcp__granola__list_meetings` with:
```
time_range: "custom"
custom_start: "<start_date>"
custom_end: "<end_date>"
```

Then check which meetings are already archived:
```bash
ls Work/Meetings/meeting-*.md | sed 's/.*meeting-//' | sed 's/\.md//'
```

Compare the two lists. Identify meetings from Granola **not** present in the vault.

Present the gap report:
```
## Gap Report — W08 (Feb 23–27)
- Granola meetings in range: X
- Already archived: Y
- Missing (to archive): Z

Missing:
- <title> (ID: <id>, Date: <date>)
- ...
```

Stop here and review with the user if more than 10 are missing. Ask which to prioritise.

---

## Step 3: Archive Missing Meetings

**For each missing meeting** (process in the main context — no subagents needed):

### 3a. Fetch summary and metadata via MCP

Call `mcp__granola__get_meetings` with the meeting ID to get: title, date, participants, AI summary, and private notes.

### 3a-ii. Detect and recover poor metadata (late-start meetings)

Granola sometimes fails to properly start a recording when a meeting begins late. Symptoms:
- Title is empty, "Untitled", "New Meeting", or a raw timestamp
- Participants list is empty or contains only [USER]

**If any symptom is present, enrich from the calendar:**

1. Extract the meeting's date and start time from Granola metadata
2. Fetch calendar events for that day using `mcp__claude_ai_Google_Calendar__gcal_list_events` (home machine) or the `scripts/calendar.js` script (work machine):

```bash
# Work machine
node "$CLAUDE_PROJECT_DIR/scripts/calendar.js" --date <YYYY-MM-DD>
```

3. Find the calendar event that overlaps with the Granola meeting time (allow ±15 min for late starts)
4. Use the calendar event's **title** and **attendees** to replace the missing Granola metadata
5. Note the recovery in the meeting file under `## Notes`:

```markdown
> **Note:** Granola metadata was incomplete (late start). Title and participants recovered from calendar.
```

If no calendar access is available or no matching event is found, flag the meeting with `⚠️ metadata-incomplete` in the frontmatter tags and continue — do not block archival.

### 3b. Write the meeting file

Use the Write tool to create `Work/Meetings/meeting-<id>.md`:

```markdown
---
title: <Meeting Title>
date: <YYYY-MM-DD>
time: <HH:MM>
participants: [Name 1, Name 2, ...]
granola_id: <id>
tags: [work, meeting]
---

# <Meeting Title>

**Date:** <Month DD, YYYY at HH:MM>
**Participants:** <comma-separated list>

## AI Summary

<AI summary from get_meetings — verbatim>

## Notes

<Private notes from Granola, if any — omit section if empty>
```

Do NOT include a transcript section yet — the shell script handles that.

### 3c. Append transcript via shell script

Run this command (never read its output — it writes directly to the file):

```bash
bash "$CLAUDE_PROJECT_DIR/Claude System/Skills/cerebro-granola-archiver/scripts/granola-append-transcript.sh" "<meeting-id>" "$CLAUDE_PROJECT_DIR/Work/Meetings/meeting-<id>.md"
```

The script reads from `~/Library/Application Support/Granola/cache-v6.json` and appends a `## Full Transcript` section directly to the file. The transcript text **never enters Claude's context**.

### 3d. Confirm

```bash
ls -lh "$CLAUDE_PROJECT_DIR/Work/Meetings/meeting-<id>.md"
```

Report: `Archived: <title> → meeting-<id>.md`

---

### Batching

You can call `get_meetings` for all meetings in a batch **before** writing any files — this fetches all summaries in one pass. Then write files and run the shell script for each in sequence. Typical batch of 5–7 meetings is fine in a single context.

---

## Step 4: Create Weekly Index

After archiving all meetings for a week, create `Work/Meetings/YYYY-WNN-meetings-index.md`.

**Always verify ISO week number with:**
```bash
node -e "const d=new Date('<YYYY-MM-DD>'); const thu=new Date(d); thu.setDate(d.getDate()+4-(d.getDay()||7)); const y=new Date(thu.getFullYear(),0,1); console.log('W'+Math.ceil(((thu-y)/86400000+1)/7))"
```

```markdown
---
week: YYYY-WNN
dates: Mon DD – Fri DD MMM YYYY
tags: [work, meetings, index]
---

# Meetings Index — Week NN (Mon DD – Fri DD)

| Date | Meeting | Participants | Key Topics |
|------|---------|--------------|------------|
| Mon DD | [[meeting-<id>\|<Title>]] | Name, Name | Topic 1, Topic 2 |
| ...  | ...     | ...          | ...        |

## Key Themes This Week

- <Theme 1>

## Decisions Made

- <Decision>

## Open Actions

- [ ] <Action item>
```

---

## Token Efficiency Rules

- **Gap analysis first** — always list before fetching anything
- **No `get_meeting_transcript` MCP calls** — transcripts come from local cache only
- **No subagents** — summaries are small enough to process in the main context
- **≤5 days per run** — if the gap is larger, ask the user which tranche to do first
- **No double-fetching** — skip meetings already in the vault
- **Shell script for transcripts** — never read its output, just run and confirm the file grew

---

## Vault Integration

### File Organisation
```
Work/
└── Meetings/
    ├── meeting-<id>.md          # Individual meeting archives
    └── YYYY-WNN-meetings-index.md  # Weekly index
```

### Cross-Referencing
- Link meetings from People profiles: `[[meeting-<id>|<Title>]]`
- Reference in project notes when relevant
- Git auto-backup via cerebro-session-review

### Earliest Available Granola Data
Update this to reflect the date of your first Granola meeting.

---

## Troubleshooting

### MCP tools returning errors or not responding

**Green tick ≠ authenticated.** The Granola MCP can show as connected in `/mcp` while actually requiring re-authorisation.

**First step when anything goes wrong:**
1. Run `/mcp` in the session
2. Re-authenticate Granola even if it shows a green tick
3. Retry

### Transcript script fails

Check that the script is executable:
```bash
chmod +x "$CLAUDE_PROJECT_DIR/Claude System/Skills/cerebro-granola-archiver/scripts/granola-append-transcript.sh"
```

If the Granola app hasn't been opened recently, the local cache may be stale. The script will fall back gracefully with a placeholder note.
