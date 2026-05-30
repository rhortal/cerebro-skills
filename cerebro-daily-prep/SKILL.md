---
name: cerebro-daily-prep
description: Daily prep: analyzes calendar, identifies prep needs, decisions, context. Run night before or morning of.
version: 2.0.0
tags: [cerebro, daily, calendar, preparation, analysis, outlook]
---

# Cerebro Daily Prep

## Usage
```
/daily-prep [optional: YYYY-MM-DD]
```

---

## Architecture

**Two-phase pipeline:** Phase 1 runs 3 agents in parallel (calendar, comms, vault). Phase 2 synthesises outputs.

```
Phase 0: Initialise (<5s)
    ↓
Phase 1: [Calendar] [Comms] [Vault] ← parallel
    ↓
Phase 2: [Manager] Scan → Daily Note → Open Surgery (Mon/Fri) → Commit
```

---

## Phase 0: Initialise

Run these two commands before spawning agents:

```bash
scutil --get LocalHostName 2>/dev/null || hostname    # detect machine
date "+Today is %A, %B %d, %Y"                       # confirm date — NEVER guess
```

Set DATE (today, YYYY-MM-DD format) and YESTERDAY (date -v-1d "+%Y-%m-%d" on Mac).

---

## Phase 1: Parallel Agents

Spawn all three agents in a single message (parallel tool calls). Each agent is independent and must return a structured result block. Use `model: haiku` for every agent.

---

### Agent A — Calendar Agent

**Input:** DATE, YESTERDAY, machine
**Output:** meetings, 1:1 status, agenda gaps, conflicts

**Steps:**

1. **Calendar fetch** — use the **Anthropic Outlook MCP** (preferred on work-machine):
   ```
   mcp__claude_ai_Microsoft_365__outlook_calendar_search
     query: "*"
     afterDateTime: "DATE"        # e.g. "2026-05-26"
     beforeDateTime: "DATE"       # same day — MCP treats this as end-of-day
     order: "oldest"
     limit: 25
   ```
   **MCP returns UTC — always add +2h in summer (CEST, Apr–Oct) or +1h in winter (CET, Nov–Mar) to get Barcelona local time.** The MCP has no timezone parameter; conversion is manual. If the MCP is unavailable, fall back to:
   ```bash
   node "Claude System/Skills/cerebro-calendar/calendar.js" --date DATE --format json
   ```
   Skip: Focus Time blocks, "WFH? Tell [coordinator]", "Review tasks for the day / week", Lunch (Viva Insights).

2. **1:1 Readiness** — identify 1:1s using these patterns (any match):
   - Subject contains: `1:1`, `1 on 1`, `one-on-one`, `[USER] & [Name]`, `[Name] & [USER]`, `catch-up`, `catch up`, `regular`
   - Exactly 1 non-[USER] attendee (required, not optional)
   - Known recurring: `[USER] & [DR1]`, `[USER] & [DR2]`, `1:1 [USER] ↔ [DR3]`, `Weekly Catch Up with [USER]`, `[Name] / [USER]`
   Do NOT restrict to direct reports — [USER] has 1:1s with peers, stakeholders, and external contacts.

   For each 1:1: check if `Work/1on1s/[Person].md` has today's session heading. Flag "ready" or "missing" in output.

3. **Agenda Watch (today only)** — for each collaborative meeting today with no real agenda (empty or Teams boilerplate only):
   - [USER] is organiser → draft a 3–5 item suggested agenda
   - [USER] is attendee → flag "ask [organiser name] for agenda"
   Skip: Focus Time, solo entries, WFH/Review reminders, Lunch.

**Output (max 8 lines — omit blank lines):**
```
CALENDAR AGENT RESULTS:
- Meetings: [with times]
- 1:1 status: [person: ready/missing]
- Agenda gaps: [issue]
- Conflicts: [if any]
```

---

### Agent B — Comms Agent

**Input:** DATE, YESTERDAY, machine
**Output:** inbox, Teams, Slack, Claude inbox tasks

**Steps:**

1. **Inbox review** (work machine only) — use the **Anthropic Outlook MCP** (preferred on work-machine):
   ```
   mcp__claude_ai_Microsoft_365__outlook_email_search
     afterDateTime: "YESTERDAY"
     order: "newest"
     limit: 10
   ```
   Categorise: needs reply / follow-up / can wait. If MCP unavailable, fall back to:
   ```bash
   node "Claude System/Skills/cerebro-lunch-check/inbox.js" --since YESTERDAY --format human
   ```

2. **Claude Inbox** — run immediately after inbox:
   ```bash
   node "Claude System/Skills/cerebro-claude-inbox/check.js"
   ```
   Execute any task instructions found. Report what was done.

3. **Teams check:**
   ```bash
   node "Claude System/Skills/cerebro-composio/teams.js" --since YESTERDAY --format human
   ```
   Surface only: DMs awaiting reply, group chats with decisions/requests.

4. **Slack check** — run both searches in parallel:
   ```
   slack_search_public_and_private  query:"to:me after:YESTERDAY"  limit:10  response_format:concise  include_bots:false
   slack_search_public_and_private  query:"from:<@YOUR_SLACK_USER_ID> after:YESTERDAY"  limit:10  response_format:concise  include_bots:false
   ```
   If both return nothing actionable → Slack is clear. Only read starred channels if a search result references one.

   Starred channels:
   | Channel | ID |
   |---|---|
   | `#ai-general` | YOUR_AI_GENERAL_CHANNEL_ID |
   | `#engineering` | YOUR_ENG_CHANNEL_ID |
   | `#everything-ai` | YOUR_EVERYTHING_AI_CHANNEL_ID |
   | `#product_operations` | YOUR_PROD_OPS_CHANNEL_ID |
   | `#leadership-team` | YOUR_LEADERSHIP_CHANNEL_ID |
   | `#product-team` | YOUR_PROD_CHANNEL_ID |
   | `#product-management` | YOUR_PM_CHANNEL_ID |
   | `#technology-management` | YOUR_TECH_MGMT_CHANNEL_ID |
   | `#ways-of-working` | YOUR_WOW_CHANNEL_ID |

   **Monday only — channel discovery:** Run two searches (`from:<@YOUR_SLACK_USER_ID>` and `to:me` both `after:LAST_MONDAY`, limit 20). Extract active channels and update the table above.

5. **Stuff.md processing:**
   Read `Stuff.md` at the vault root. For each item:
   - `[x]` marked → delete it
   - Actionable work item → flag for today's daily note reminders
   Report what was routed or removed. Skip silently if Stuff.md is empty.

Surface at most 3 inbox items. Stop there.

**Output (max 8 lines — omit blank):**
```
COMMS AGENT RESULTS:
- Inbox: [≤3 items]
- Claude inbox: [tasks / clear]
- Teams: [actions / clear]
- Slack: [signals / clear]
- Stuff.md: [routed / clear]
```

---

### Agent C — Vault Agent

**Input:** DATE, YESTERDAY
**Output:** @Cerebro actions, watchlist alerts, Granola items, [Manager] candidates, wins

**Steps:**

1. **@Cerebro scan:**
   ```bash
   grep -rn "@[Cc]erebro" . --include="*.md" \
     --exclude-dir=".git" --exclude-dir="Claude System"
   ```
   For each match: action it, then **delete the entire line** — never leave ✅ markers.

2. **Watchlist check** — read `Claude System/Watchlist.md`. For each active item: run its check.
   If found → flag 🔔, add to today's reminders, move to Resolved. If not found → skip silently.

2b. **Persistent reminders** — read `Claude System/Persistent Reminders.md`. Surface any unchecked `[ ]` items tagged `[work]` or `[all]` in today's daily note under `## 📌`. Skip items marked `[x]` or tagged `[home]`.

3. **Granola scan:**

   **Non-Friday (scan yesterday only):**
   ```bash
   YESTERDAY=$(date -v-1d "+%Y-%m-%d")
   ls Work/Granola/ | grep "$YESTERDAY" | grep -v transcript
   ```

   **Friday (scan full week Mon–Thu):**
   ```bash
   # On Mac, get Mon of current week:
   MONDAY=$(date -v-mon "+%Y-%m-%d" 2>/dev/null || date -d "last monday" "+%Y-%m-%d")
   ls Work/Granola/ | grep -v transcript | while read f; do
     fdate=$(echo "$f" | cut -c1-10)
     [[ "$fdate" >= "$MONDAY" && "$fdate" < "$(date '+%Y-%m-%d')" ]] && echo "$f"
   done
   ```

   If none: skip. Read all files returned — never transcript files.

   From each note extract:
   - **Action items** ([USER]-owned) → append to today's daily note reminders
   - **[Manager] agenda candidates** → collect for Phase 2 [Manager] scan
   - **Wins (Fridays only)** → skip entirely unless today is Friday. If Friday: collect up to 10 wins spanning the full week's Granola notes — [USER] will whittle them down before posting. For each win, identify the [COMPANY] value it demonstrates:
     - 💙 **[VALUE_1]** — supported a colleague, improved customer experience
     - 🔴 **[VALUE_2]** — hard decision made, risk taken, challenge surfaced
     - 🤝 **[VALUE_3]** — integrity shown, accountability taken
     - 🔍 **[VALUE_4]** — something learned, new approach tried

**Output (max 8 lines — omit blank):**
```
VAULT AGENT RESULTS:
- @Cerebro: [actions / none]
- Watchlist: [alerts / clear]
- Granola: [items / candidates / wins / none]
```

---

## Phase 2: Synthesise (Sequential)

Run these steps after all Phase 1 agents complete.

### [Manager] Agenda Scan

Scan all Phase 1 outputs — calendar, inbox, Teams, Slack, Granola, @Cerebro actions — for items needing [Manager]'s steer:
- Strategic decisions needing sponsorship
- Cross-team blockers [USER] can't resolve alone
- Significant risks, wins, resource requests
- CEO-level decisions

If candidates found, read `Work/1on1s/[Manager] - Running Agenda.md` first (deduplicate), then append under `## Pending`:
```
- **[DATE] [topic]** — [1-2 sentences: what, why it matters, what steer needed]. _(Source: [origin])_
```
Skip silently if nothing qualifies.

---

### 1:1 Prep Check

If Calendar Agent flagged any 1:1 today as missing a session entry: run `/cerebro-1on1-prep` now, before writing the daily note. Do not skip this — prepared 1:1 notes are mandatory. Pass the specific person name(s) flagged.

---

### Write Daily Note

Write daily brief to `Daily/DATE.md`. Merge Phase 1 outputs:

```
## 🎯 Daily Prep — [Weekday, D Month YYYY]
### 📊 Day Overview
### ⚠️ Scheduling Conflicts — omit entirely unless there is an actual conflict; never write "None"
### 🗓️ Timeline & Prep Needs
### 📋 Agenda Watch — max 3 items; omit if all meetings are self-explanatory
### 📥 Inbox Highlights
### 💬 Teams / Slack
### 📋 Claude Inbox (if tasks executed)
### ✅ Pre-Day Checklist
### 🎲 Key Decisions Today — max 3 items, one line each; omit if none
### 👥 People Context — one line per person (`- [Name]: [one phrase]`), max 3 people; omit if nothing to add
### 📚 Reading Queue (Wednesdays and Fridays only — omit entirely on other days)
### 🧠 Focus Work Queue (only when a focus block exists in calendar — omit entirely otherwise)
### 🏆 Wins to celebrate (Fridays only — omit entirely on other days)
```

**Reading Queue (Wednesdays and Fridays only):** Read `Work/Reading List.md` and extract all unchecked `- [ ]` items from the Queue section. Include up to 3 in the daily note under `### 📚 Reading Queue`. Format as a plain checkbox list — [USER] ticks them off during his afternoon reading block. Omit the section entirely on all other days.

**Focus Work Queue (only when a focus block exists in calendar):** Read `Focus Work Queue.md` and extract the top 1–2 unchecked `- [ ]` items from the Backlog. Include them under `### 🧠 Focus Work Queue` as a plain checkbox list. Omit the section entirely on days with no focus blocks.

**Wins (Fridays only):** Up to 10 rows ([USER] selects final set). Table format with [COMPANY] values:

```markdown
| Person / Team | What they did | Value |
|---|---|---|
| [Name] | [Achievement] | 💙 [VALUE_1] |
```

Values: 💙 [VALUE_1] · 🔴 [VALUE_2] · 🤝 [VALUE_3] · 🔍 [VALUE_4]

**Post to #general (Friday):** Format for Slack, group by value. Use Slack emoji codes:



```
:trophy: Wins this week — [COMPANY] values in action

:red_circle: [VALUE_2]
- [Name] — [what they did]

:mag: [VALUE_4]
- [Name] — [what they did]

:blue_heart: [VALUE_1]
- [Name] — [what they did]

:handshake: [VALUE_3]
- [Name] — [what they did]
```

Omit empty value groups. Get approval before posting.

Skip Focus Time & personal reminders. People: meeting attendees only. **Omit empty sections — no blank headers.**

**Hard cap:** `## 🎯 Daily Prep` must be max 35 lines (Mon/Tue/Thu), max 40 (Wed + reading queue), max 45 (Fri + queue + wins). Trim lowest-priority content to fit.

---

## Monday Extras

- Archive notes older than today → `../Archives/cerebro-work/Daily/`
- Slack channel discovery (see Agent B)
- Run `/cerebro-claude-users-hub` — generate challenge brief, insert under `### 🎲 Monday Challenge`. Wait for approval.
- Run `/cerebro-open-surgery` — post Monday reminder to #product-team if block exists.

## Friday Extras

- Run `/cerebro-open-surgery` — post Friday reminder to #product-team & #engineering if block exists.
