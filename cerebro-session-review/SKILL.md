---
name: cerebro-session-review
description: Use at end of work sessions in Cerebro vault to review learnings, update user profile, rules, conventions, processes, and memory files
version: 2.0.0
---

# Session Review for Cerebro

> **Note**: This is a **process document**, not an invocable Claude Code skill. Follow this workflow manually as a checklist when conducting session reviews.

## Architecture: Parallel Phases

Session review runs in **two phases**. Phase 1 launches 4 specialised agents simultaneously to gather all external data. Phase 2 synthesises their outputs and updates knowledge files.

```
Phase 0: Initialise (sequential — date + machine)
    ↓
Phase 1: [Scan Agent] [Meetings Agent] [Comms Agent] [Calendar Agent]  ← all parallel
    ↓
Phase 2a: 1:1 file updates + [Manager] Agenda Scan (sequential — depends on Phase 1)
    ↓
Phase 2b: Knowledge file updates — parallel where independent
```

## Phase 0: Initialise

```bash
scutil --get LocalHostName 2>/dev/null || hostname    # machine
date "+Today is %A, %B %d, %Y"                       # date — NEVER guess
date -v+1d "+%Y-%m-%d"                               # tomorrow
date -v+1d "+%A"                                     # tomorrow DOW
date -v+1d "+%-d %B %Y"                              # tomorrow formatted
```

### Friday check — Weekly Review gate

If today is Friday, before proceeding further:

1. Check whether the weekly review has already run this week:
   ```bash
   WEEK=$(date "+%V")
   ls "Work/Weekly Reviews/" | grep "W${WEEK}" 2>/dev/null
   ```
2. If **no file found** → stop and offer:
   > "It's Friday and the weekly review hasn't run yet. Would you like me to run `/cerebro-weekly-review` first? It's best done before the session review while the week is fresh."
   Wait for [USER]'s response before continuing.
3. If **file exists** → proceed normally.

---

## Phase 1: Parallel Agents

Spawn all four agents in a single message. Each returns a structured result block. Use `model: haiku` for every agent. Each agent must output a single compact block — max 6 lines total. One item per line. Skip any category that has nothing to report.

---

### Agent A — Scan Agent

**Returns:** @Cerebro actions taken, watchlist alerts

**Steps:**

1. **@Cerebro scan:**
   ```bash
   grep -rn "@[Cc]erebro" . --include="*.md" \
     --exclude-dir=".git" --exclude-dir="Claude System"
   ```
   For each match: read surrounding context, action it, then **delete the entire `@Cerebro` line**. Do not leave a ✅ marker — processed items accumulate and waste grep tokens on every future scan.

**Output:**
```
SCAN AGENT: @Cerebro [actions taken / none] | Watchlist [alerts / clear]
```

---

### Agent B — Meetings Agent

**Returns:** today's Granola action items, [Manager] candidates, wins, 1:1 meeting data

**Steps:**

1. **Find today's Granola notes:**
   ```bash
   TODAY=$(date "+%Y-%m-%d")
   # Primary: extract file paths from daily note's Granola Meetings section (most reliable — curated by plugin)
   grep -oP '(?<=\[\[)Work/Granola/[^\]|]+' "Daily/${TODAY}.md" 2>/dev/null
   # Fallback: directory listing (in case daily note section is missing)
   ls Work/Granola/ | grep "$TODAY" | grep -v transcript
   ```
   Combine results (deduplicate). For each path from the daily note grep, the full file is at `[path].md` (relative to vault root).
   If none found via either method: skip. NEVER open transcript files (files with "transcript" in name).

2. From each note extract:
   - **Action items** — bullets with owners, "will", "to do", "next step"
     - [USER]-owned → add to tomorrow's daily note reminders
     - Team member commitments → note for People profile updates
   - **[Manager] agenda candidates** — strategic decisions, blockers, risks, resource requests, wins
   - **Wins and celebrations** — specific people + achievements

3. **Identify today's 1:1s:**
   ```bash
   grep -rl "$(date +%Y-%m-%d)" Work/1on1s/ 2>/dev/null

   ```
   Also check Granola notes for meetings with exactly one direct-report attendee.

   For each 1:1 found, extract from the Granola notes file:
   - Decisions — "we agreed", "we'll go with", "decision:", "confirmed"
   - Actions — items with clear owner and action

**Output:**
```
MEETINGS AGENT:
- Action items: [list with owners]
- [Manager] candidates: [list / none]
- Wins: [list / none]
- 1:1s today: [people / none]
- 1:1 decisions+actions: [per person]
```

---

### Agent C — Comms Agent

**Returns:** unread emails, Teams messages, Claude inbox tasks, items for tomorrow's reminders

**Steps:**

1. **EOD Inbox review** (work machine / work-machine only — skip on home):
   ```bash
   node "Claude System/Skills/cerebro-lunch-check/inbox.js" --format human
   ```
   Categorise each item: needs reply / follow-up / can wait.

2. **Claude Inbox** (REQUIRED — every work email session):
   ```bash
   node "Claude System/Skills/cerebro-claude-inbox/check.js"
   ```
   Execute any task instructions. Report what was done.

3. **EOD Teams check:**
   ```bash
   node "Claude System/Skills/cerebro-composio/teams.js" --hours 10 --format human
   ```
   Identify: DMs awaiting reply, group chats requiring follow-through.

**Output:**
```
COMMS AGENT:
- Inbox: [needs-reply items / clear]
- Claude inbox: [tasks done / clear]
- Teams: [actionable items / clear]
- Tomorrow reminders: [list]
```

---

### Agent D — Calendar Agent

**Returns:** tomorrow's meetings, 1:1 prep status per person

> **Skip on Fridays** — tomorrow is the weekend. Return `CALENDAR AGENT: skipped (Friday — weekend tomorrow)`.

**Steps:**

1. **Fetch tomorrow's calendar:**
   ```bash
   node "Claude System/Skills/cerebro-calendar/calendar.js" TOMORROW --format human
   ```

2. **For each 1:1 on tomorrow's calendar:**
   Check if `Work/1on1s/[Person].md` has tomorrow's session entry already.
   - Missing → note it for Phase 2a (will create using cerebro-1on1-prep logic)
   - Already prepared → confirm with one line

**Output:**
```
CALENDAR AGENT:
- Tomorrow meetings: [list]
- 1:1 prep needed: [people / all ready]
```

---

## Phase 2a: Action Phase (Sequential)

Run after all Phase 1 agents complete.

### Update 1:1 Files

For each completed 1:1 today (from Meetings Agent):

Open `Work/1on1s/[Person].md` and find today's session heading. Fill blank sections:
- **Notes** blank → fill from Granola notes
- **Decisions** blank → from Meetings Agent extraction
- **Actions** blank → format as `- [ ] [Owner]: [what]`

**Sources (use all):**
1. Granola notes file (from Meetings Agent) — decisions and actions
2. [USER]'s Notes in today's daily note `📝 Your Notes` section
3. [USER]'s Notes written directly into the 1on1 file under `### Notes`

**Update People profiles** — for each person in today's 1:1:
Open `Personal/People/[Name].md` and update:
- Current priorities if changed
- Open actions (mark completed, add new)
- Key context (personal updates, career developments, sentiment)

### Create Missing 1:1 Prep for Tomorrow

> **Skip on Fridays** — no 1:1 prep needed when tomorrow is the weekend.

For each person from Calendar Agent marked as "prep needed":
Create tomorrow's session entry using cerebro-1on1-prep skill logic:
- Agenda items from open actions
- Pending carry-forwards from last session
- Slack/inbox context from Comms Agent

**Do NOT prompt [USER] to run `/cerebro-1on1-prep` himself.**

### Add Tomorrow's Reminders to Daily Note

From Comms Agent "needs reply" items:
- Get tomorrow's date from Phase 0 shell output
- Open or create `Daily/[YYYY-MM-DD].md`
- If creating: heading `# [DOW], [D Month YYYY]` (shell values, not inferred)
- Add items under `## 📌 Claude's Reminders`

### [Manager] Agenda Scan

Scan everything from Phase 1 — 1:1 notes, meeting outcomes, inbox items, decisions, blockers — for topics needing [Manager]'s steer:
- Strategic decisions needing sponsorship
- Cross-team blockers [USER] can't resolve alone
- Risks, delays, or significant developments [Manager] should know about
- Resource requests (headcount, budget, tools, vendors)
- Wins worth flagging to leadership

If candidates found: read `Work/1on1s/[Manager] - Running Agenda.md` first (deduplicate), append under `## Pending`:
```markdown
- **[DATE] [Brief topic]** — [1-2 sentence context]. _(Source: [session review / 1:1 with X / inbox / etc.])_
```
If nothing qualifies: skip silently.

---

## Phase 2b: Knowledge File Updates

These can be done in parallel where independent. Update only what actually changed this session.

### Review the Session

Scan the conversation for:
- User preferences expressed or demonstrated
- Rules established (naming, organization, tagging)
- Conventions agreed upon
- Workflows developed or documented
- Vault changes (folders, structure, templates)
- Problems solved and solutions found

### Update User Profile

File: `Claude System/User Profile.md`
**Only update if** a new preference, working style observation, or personal context was learned this session.

### Update Rules and Conventions

File: `Claude System/Rules and Conventions.md`
**Only update if** a new naming convention, folder rule, or tagging pattern was established this session.

### Update Processes

File: `Claude System/Processes.md`
**Only update if** a workflow was created or meaningfully changed this session.

### Update Vault Evolution

File: `Claude System/Vault Evolution.md`
**Always prepend at the top of the file** (after the frontmatter header), newest entry first. Max 3 bullets under "What Changed":
```markdown
### [Date] - [Brief Description]

**Context**: Why changes were made

**What Changed**:
- [bullet 1]
- [bullet 2 — max 3 total]

**Learnings**: What we discovered
```

### Update Auto Memory

File: `~/.claude-team/projects/-Users-your-username-cerebro-cerebro-work/memory/MEMORY.md`
**Only update if** a rule, critical preference, or structural change occurred. Keep under 200 lines total.

### Update CLAUDE.md (If Needed)

File: `CLAUDE.md`
Only update if: new plugins configured, structural vault changes, new conventions affecting all future work, changes to Claude System folder structure.

### Update Welcome.md

File: `Welcome.md`
**Update only on Mondays or if vault structure changed this session** (new folders, renamed sections, etc.).

**Format for Recent Activity:**
```markdown
### YYYY-MM-DD (Session #)
- **[Category]**: [What was done and links to files created]
```

### Verify Section Index Files

Only check and update the index file for a section **if you created a new note in that section this session**:
- People → `People/People Index.md`
- Companies → `Companies/Companies Index.md`
- Tech → `Tech/Tools & Software.md`
- Tasks → `Tasks/Tasks Index.md`
- Travel → `Travel/Travel Index.md`

---

## Friday Extras (Fridays Only)

### Skill Review

Review daily workflow skills for improvements:
- `Claude System/Skills/cerebro-daily-prep/SKILL.md`
- `Claude System/Skills/cerebro-lunch-check/SKILL.md`

Assess: steps producing value? noisy/routine items? new signals to add? tool calls failing? context changes needed? Output 2–5 bullet suggestions. Implement clear improvements. Ask before structural changes.

### Weekly Review

After Granola archive complete: run `cerebro-weekly-review` skill to generate:
- Actions & Insights (WXX) — retrospective synthesis
- Urgent Tasks (WXX+1) — forward-looking task list

---

Before finishing, verify: 1:1 files updated, [Manager] agenda scanned, Vault Evolution appended.
