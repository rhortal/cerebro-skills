---
name: cerebro-lunch-check
description: Midday check-in — recap morning meetings, archive Granola, refresh afternoon calendar, review inbox, update afternoon priorities. Run at lunch or between morning and afternoon blocks.
version: 2.0.0
tags: [cerebro, daily, lunch, midday, meetings, inbox, priorities, outlook]
---

# Cerebro Lunch Check

Midday reset. Bridges morning and afternoon. Surfaces what happened vs. planned, inbox arrivals, updated afternoon priorities.

**Work machine only** (work-machine) — requires Outlook access and Granola MCP.

## Usage

```
/lunch-check
```

Or specify a date (defaults to today):
```
/lunch-check 2026-02-18
```

---

## Architecture

```
Phase 0: Initialise (<5s)
    ↓
Phase 1: [Meetings Agent] [Calendar Agent] [Comms Agent]  ← parallel
    ↓
Phase 2: [Manager] Scan → Priority Update → Daily Note → Commit
```

---

## Phase 0: Initialise

```bash
scutil --get LocalHostName 2>/dev/null || hostname    # detect machine
date "+Today is %A, %B %d, %Y"                       # confirm date — NEVER guess
```

Set DATE (YYYY-MM-DD). Confirm work-machine before proceeding.

---

## Phase 1: Parallel Agents

Spawn all three agents in a single message. Each is independent — pass all necessary context in the prompt. Use `model: haiku` for every agent.

---

### Agent A — Meetings Agent

**Input:** DATE
**Output:** morning recap, 1:1 notes status, [Manager] candidates, wins

**Steps:**

**1. Morning Recap (Granola):**

Find today's morning notes (never transcripts):
```bash
TODAY=DATE
ls Work/Granola/ | grep "$TODAY" | grep -v transcript
```
Filter to files with hour < 12 in filename (`YYYY-MM-DD-HH-...`). If none: skip silently.

Read each notes file:
```bash
obsidian read file="Work/Granola/[filename-without-extension]"
```

Extract from each:
- **Key outcomes** — decisions made, things shipped, blockers surfaced
- **Action items** ([USER]-owned) → append to today's daily note:
  ```bash
  obsidian daily:append content="- **[Reminder]** [what] — from [Meeting Title]"
  ```
- **[Manager] agenda candidates** — strategic decisions, blockers, risks, wins, resource questions. Read `Work/1on1s/[Manager] - Running Agenda` first to deduplicate, then append under `## Pending`:
  ```bash
  obsidian append file="Work/1on1s/[Manager] - Running Agenda" content="- **[DATE] [topic]** — [context]. _(Source: Granola — [Meeting Title])_"
  ```
- **Wins** — specific people + achievements. Surface in output. **On Fridays: always include wins explicitly in Phase 2 synthesis and in the midday check-in write-up** — they feed the weekly review and must not be silently held.

**2. Process Completed Morning 1:1s:**

From Granola notes above, identify meetings where `attendees:` lists exactly one direct report — these are 1:1s.

For each completed morning 1:1:
1. Open `Work/1on1s/[Person].md`
2. Check if Notes, Decisions, Actions under today's session heading are blank
3. If blank: leave blank, note it in output
4. If [USER] left notes in daily note `📝 Your Notes` tagged with person's name: incorporate them
5. Update `Work/People/[Name].md` if new context emerged (role changes, priorities, personal context)

If no morning 1:1s: skip silently.

**Output (max 8 lines):**
```
MEETINGS AGENT:
- Meetings completed: [titles / none]
- Key outcomes: [3 bullets max]
- [Manager] candidates added: [topics / none]
- Wins: [names + achievements / none]
- 1:1 notes: [person: updated/blank / none]
```

---

### Agent B — Calendar Agent

**Input:** DATE
**Output:** afternoon calendar changes, 1:1 readiness, @Cerebro actions, watchlist alerts

**Steps:**

**1. @Cerebro Scan:**
```bash
grep -rn "@[Cc]erebro" . --include="*.md" \
  --exclude-dir=".git" --exclude-dir="Claude System"
```
For each match: read context, action it, **delete the entire line** — never leave ✅ markers. If ambiguous: surface for clarification in output.

**2. Watchlist Check:**

Read `Claude System/Watchlist.md`. For each active item: run its check.
- Found → flag 🔔 in output, append reminder to today's daily note under 📌, move item to Resolved with today's date
- Not found → skip silently

**3. Calendar Refresh:**

Fetch full day schedule using **Anthropic Outlook MCP** (preferred on work-machine):
```
mcp__claude_ai_Microsoft_365__outlook_calendar_search  query:"*"  afterDateTime:"DATE"  beforeDateTime:"DATE"  order:"oldest"  limit:25
```
**MCP returns UTC — always add +2h in summer (CEST, Apr–Oct) or +1h in winter (CET, Nov–Mar) to get Barcelona local time.** Fallback if unavailable:
```bash
node "Claude System/Skills/cerebro-calendar/calendar.js" DATE --format human
```

Compare against morning plan. Flag:
- New meetings added (prep needed?)
- Meetings cancelled (time freed)
- Time changes (knock-on effects)
- New conflicts

If unchanged: one-liner "Afternoon schedule unchanged".

**4. Afternoon 1:1 Readiness:**

Identify 1:1s in the afternoon schedule using these patterns (any match):
- Subject contains: `1:1`, `1 on 1`, `one-on-one`, `[USER] & [Name]`, `[Name] & [USER]`, `catch-up`, `catch up`, `regular`
- Exactly 1 non-[USER] attendee (required, not optional)
- Known recurring subjects: `[USER] & [DR1]`, `[USER] & [DR2]`, `1:1 [USER] ↔ [DR3]`, `Weekly Catch Up with [USER]`, `Catch up — [Name]`, `[Name] / [USER]`

Do NOT restrict to direct reports — [USER] has 1:1s with peers, stakeholders, and external contacts too.

For each: check `Work/1on1s/[Person].md` — does today's session entry exist?
- Not prepared → flag for Phase 2 (will trigger `/cerebro-1on1-prep`)
- Already prepared → note "ready"

If a 1:1 is within 2 hours: flag prominently.

**Output (max 8 lines):**
```
CALENDAR AGENT:
- @Cerebro: [actions taken / none]
- Watchlist: [alerts / clear]
- Calendar changes: [changes / unchanged]
- Afternoon 1:1s: [person: ready/needs prep / none]
```

---

### Agent C — Comms Agent

**Input:** DATE
**Output:** inbox, Teams, Slack

**Steps:**

**1. Inbox Review:**

Fetch using **Anthropic Outlook MCP** (preferred on work-machine):
```
mcp__claude_ai_Microsoft_365__outlook_email_search  afterDateTime:"6 hours ago"  order:"newest"  limit:10
```
Fallback:
```bash
node "Claude System/Skills/cerebro-lunch-check/inbox.js" --hours 6 --format human
```

Surface at most 3 items, categorised: action required / urgent / FYI. If clean: one line.

Shared inbox check (only if expecting activity — skip silently otherwise):
```bash
node "Claude System/Skills/cerebro-lunch-check/inbox.js" --hours 6 --shared --format human
```
Shared inboxes: `shared-inbox1@`, `user@`, `tools-admin@company`, `shared-inbox2@`.

**2. Claude Inbox:**
```bash
node "Claude System/Skills/cerebro-claude-inbox/check.js"
```
Execute any task instructions found. Report what was done.

**3. Teams Check:**
```bash
node "Claude System/Skills/cerebro-composio/teams.js" --hours 6 --format human
```
Surface: DMs needing reply, group chat decisions/requests. Skip social chatter. If nothing: "Teams clear."

**4. Slack Check** (run both in parallel):
```
slack_search_public_and_private  query:"to:me after:DATE"  limit:10  sort:timestamp  sort_dir:desc  response_format:concise  include_bots:false
slack_search_public_and_private  query:"from:<@YOUR_SLACK_USER_ID> after:DATE"  limit:10  sort:timestamp  sort_dir:desc  response_format:concise  include_bots:false
```
Surface only what needs action before end of day. If nothing: "Slack clear."

**Output (max 8 lines):**
```
COMMS AGENT:
- Inbox: [≤3 items / clear]
- Claude inbox: [tasks / clear]
- Shared: [notable / clear]
- Teams: [actions / clear]
- Slack: [signals / clear]
```

---

## Phase 2: Synthesise (Sequential)

Run after all Phase 1 agents complete.

### Trigger 1:1 Prep if Needed

If Calendar Agent flagged any afternoon 1:1 as unprepared: run `/cerebro-1on1-prep` now before continuing.

### [Manager] Agenda Scan

Review all Phase 1 outputs for [Manager] candidates not already added by the Meetings Agent:
- Inbox items with strategic/cross-team significance
- Teams/Slack signals needing [Manager]'s steer
- Any blocker [USER] can't resolve alone

If found: read `Work/1on1s/[Manager] - Running Agenda` to deduplicate, then append under `## Pending`:
```markdown
- **[DATE] [topic]** — [context]. _(Source: lunch check)_
```
Skip silently if nothing qualifies.

### Friday Wins Surface

**On Fridays only:** before writing the daily note, compile the wins list from the Meetings Agent output. Include it in the midday check-in under a `### 🏆 Wins` section. Format as a bullet list: person + achievement. This feeds the weekly review and must not be skipped.

### Priority Update

Synthesise all inputs into updated afternoon priorities:
- What changed from the morning plan
- What moved up based on morning meetings
- What can be deferred
- What prep is still needed for afternoon meetings

### Write Daily Note

Add `## 🕐 Midday Check-in` to today's daily note, immediately before `## 📝 Your Notes`:

```markdown
## 🕐 Midday Check-in — [HH:MM]

### 📋 Morning Recap (max 3 lines)
- Meetings: [key outcomes, one line each]
- Decisions: [any made this morning]
- Surprises: [what changed from plan — omit if none]

### 📬 Inbox
- [Action item 1] / [Action item 2] — or "Clear"
- Shared: [notable items — or "Clear"]

### 💬 Teams / Slack
- Teams: [DMs/group items, or "Clear"]
- Slack: [mentions/threads, or "Clear"]

### 🗓️ Afternoon Schedule
[Changes from morning plan — or "Unchanged"]

### 🎯 Updated Afternoon Priorities (max 3 items)
1. [Highest value item]
2. [Second priority]
3. [Third if genuinely distinct]

**Deferred to tomorrow**: [items that no longer make today's cut]
```

**Hard cap:** Entire `## 🕐 Midday Check-in` block must be **max 20 lines**. Subsections with nothing to report: one line (e.g. `📬 Inbox: Clear`) — no empty bullets.
