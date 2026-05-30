---
name: cerebro-1on1-prep
description: Use when [USER] asks to prepare 1:1 notes for today, or before a block of 1:1 meetings. Creates agenda-ready session entries in Work/1on1s/ for each upcoming 1:1, linked from the daily note.
---

# Cerebro 1:1 Prep

Scans calendar for 1:1s. Gathers context from meetings, Slack, vault, email. Prepares session entry in each person's 1:1 file.

**work-machine only** — requires Outlook & Slack.

## Usage

```
/cerebro-1on1-prep
```

Or for a specific date:
```
/cerebro-1on1-prep 2026-02-17
```

---

## Phase 0 — Identify Today's 1:1s

Fetch today's calendar using the **Anthropic Outlook MCP** (preferred on work-machine):

```
mcp__claude_ai_Microsoft_365__outlook_calendar_search  query:"*"  afterDateTime:"DATE"  beforeDateTime:"DATE"  order:"oldest"  limit:25
```
Times are already Europe/Madrid — never re-convert. Fallback if MCP unavailable:
```bash
node "Claude System/Skills/cerebro-calendar/calendar.js" [DATE] --format human
```

Filter for 1:1 meetings using these patterns (any match):
- Subject contains: `1:1`, `1 on 1`, `one-on-one`, `[USER] & [Name]`, `[Name] & [USER]`
- Exactly 1 non-[USER] attendee (required, not optional)
- Known recurring 1:1 subjects: `[USER] & [DR1]`, `[USER] & [DR2]`, `1:1 [USER] ↔ [DR3]`, `Weekly Catch Up with [USER]`, `Catch up — [Name]`

Skip: cancelled events (`isCancelled: true`), focus time, all-day events.

For each 1:1 found, note the person's **full name**, **email**, and **meeting time**.

If no 1:1s found: report and stop.

---

## Phase 1 — Per-Person Agents (parallel)

Spawn one agent per person simultaneously. Use `model: haiku`. Each agent is fully self-contained — pass all necessary context in the prompt.

**Agent prompt template (customise per person):**

> You are preparing a 1:1 session entry for [USER]'s meeting with **[Full Name]** ([email]) at [time] on [date].
>
> Complete all steps below, then write the session entry to `Work/1on1s/[Person Name].md`.
>
> **Step 1 — Read vault context (run in parallel):**
>
> a. Read `Work/People/[Full Name].md`. Extract: open `- [ ]` action items assigned to [USER] or to the person; key context, current priorities, known pain points.
>
> b. Read `Work/1on1s/[Full Name].md` (last 2 sessions only). Extract: all `- [ ]` open actions; deferred/unresolved items (blank Decisions sections, topics that didn't produce an action, explicit "TBD"/"to follow up" language); date of last session.
>
> c. Find recent Granola meeting notes involving this person:
> ```bash
> ls Work/Granola/ | grep -v transcript
> ```
> From the output, identify the 3 most recent files that include [Full Name] (check by reading — exclude `-transcript` files). Extract: commitments made, unresolved questions, action items not yet in the 1:1 file.
>
> d. [If person has a people/ instructions file — see table below]: Read it for additional data sources.
>
> e. Search Outlook email exchanged with this person (last 2 weeks):
> ```js
> // Use cerebro-composio: getConnectedAccount(client, 'outlook') to get acct
> // Fetch received: /v1.0/me/messages?$filter=contains(from/emailAddress/address,'[email]')&$orderby=receivedDateTime desc&$top=8&$select=subject,receivedDateTime,bodyPreview,from
> // Fetch sent: /v1.0/me/sentItems?$filter=contains(toRecipients/any(r:r/emailAddress/address),'[email]')&$orderby=sentDateTime desc&$top=5&$select=subject,sentDateTime,bodyPreview
> ```
> Surface: unanswered threads, decisions promised, requests pending.
>
> [If [Manager] on a Monday]: Also read `Work/1on1s/[Manager] - Running Agenda.md` in full. Surface all pending items; recommend the top 3–4 for today based on recency and stakes.
>
> **Step 2 — Write the session entry:**
>
> Prepend a new session block to `Work/1on1s/[Person Name].md` using the obsidian CLI:
> ```bash
> obsidian read file="[Person Name]"   # check if file exists first
> ```
> If file doesn't exist, create it with this header first:
> ```markdown
> ---
> person: [Full Name]
> role: [Role from People profile]
> frequency: [frequency from calendar pattern]
> tags: [1on1, work]
> ---
>
> # 1:1 — [[Work/People/[Name]|[Full Name]]]
>
> Running log of 1:1 meetings. Newest first.
>
> ---
> ```
>
> Then prepend the session block (use `obsidian` CLI to read current content, prepend block, rewrite):
> ```markdown
> ## [D Month YYYY] — [optional theme] ([HH:MM])
>
> ### Agenda
> 1. [Item]
> 2. [Item]
> ...
>
> ### Prep
>
> #### 1. [Item]
> [Full detail — background, what happened, what to discuss, ask/decision needed if any]
>
> ---
>
> #### 2. [Item]
> [Full detail]
>
> ---
>
> ### Notes
> <!-- Live notes during meeting -->
>
> ### Decisions
>
> ### Actions
>
> ---
> ```
>
> **Agenda:** Clean numbered list — no inline detail. [USER] shares this in the meeting. 4–8 items. Lead urgent/time-sensitive first. Carry forward open actions and deferred decisions explicitly.
>
> **Prep:** One `####` sub-section per agenda item. Include background, relevant numbers, what happened since last session, and the specific ask or decision needed. Source from Granola, inbox, Slack. This is what [USER] reads before walking in.
>
> **Return (max 6 lines):** person name, meeting time, 2–3 key agenda items. One item per line. Skip empty categories.

---

### Person-specific instructions files

Create a `people/` subdirectory with one file per person for custom instructions on top of the universal steps. The file name is the person's slug (e.g. `people/person-name.md`).

| Person | Instructions file | Notes |
|--------|-------------------|-------|
| [Manager] | `Claude System/Skills/cerebro-1on1-prep/people/manager.md` | |
| [DR1] | `Claude System/Skills/cerebro-1on1-prep/people/dr1.md` | |
| [DR2] | `Claude System/Skills/cerebro-1on1-prep/people/dr2.md` | |
| [DR3] | `Claude System/Skills/cerebro-1on1-prep/people/dr3.md` | |
| [DR4] | `Claude System/Skills/cerebro-1on1-prep/people/dr4.md` | Teams preferred — check before Slack |
| [DR5] | `Claude System/Skills/cerebro-1on1-prep/people/dr5.md` | Teams preferred — check before Slack |
| [DR6] | `Claude System/Skills/cerebro-1on1-prep/people/dr6.md` | Teams preferred — check before Slack |

**Unknown person (ad hoc 1:1):** Universal steps are sufficient. Also search Slack DMs: `from:[firstname.lastname] after:[2-weeks-ago]` and try their name in public channels if no DMs found.

**Monday / Tuesday only:** Check if a [Manager]/[USER]/[DR1] or [Manager]/[DR2]/[USER] meeting happened yesterday — those are rich sources of agenda items for [DR1] and [DR2] 1:1s that week.

---

## Phase 2 — Wrap-Up (sequential, after all agents return)

### Link in Daily Note

Find today's daily note at `Daily/[YYYY-MM-DD].md`. For each 1:1, find the meeting block and add the link if not already there:

```markdown
- 👥 [Name] — [[Work/1on1s/[Name]|→ 1:1 notes & agenda]]
```

If the meeting block doesn't exist in the daily note, add a brief entry at the top of the timeline section.

### Summary

```
## 1:1 Prep Complete — [Date]

- **[Time] — [Person]**: [2–3 key agenda items]
- **[Time] — [Person]**: [2–3 key agenda items]
...

All files updated in Work/1on1s/. Links added to daily note.
```

---

## Notes

- People files in `people/` add sources on top of the universal steps — they don't replace them.
- The Composio `acct` variable: use `getConnectedAccount(client, 'outlook')` to retrieve it before Graph API calls.
