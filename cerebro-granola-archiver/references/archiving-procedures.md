# Granola Archiving Procedures

## Overview

This document provides step-by-step procedures for archiving Granola meetings at various scales, with guidance on token efficiency and batch processing.

## Procedure 1: Quick Gap Analysis (Low Token Cost)

**When to use:** At start of session to see what's missing before committing resources

**Steps:**

1. Run the sync script with `--dry-run`:
   ```bash
   python3 scripts/sync_granola.py "$(pwd)/.." 2026-02-09 2026-02-13 --dry-run
   ```

2. Review the output:
   - How many meetings exist?
   - How many are missing?
   - Which ones need archiving?

3. Decide next steps:
   - Archive all? → Use Procedure 2
   - Archive specific subset? → Use Procedure 3
   - Archive in batches? → Use Procedure 4

**Token cost:** ~500 tokens (metadata only, no transcript retrieval)

## Procedure 2: Full Week Archive (All Meetings)

**When to use:** Archive complete week of meetings after session review

**Prerequisites:**
- Identified all meetings needed (via gap analysis)
- Plan to spend tokens on full transcript + metadata retrieval

**Steps:**

1. Get list of meeting IDs from gap analysis:
   ```
   meeting-aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa
   meeting-aaaaaaaa-0001-0001-0001-bbbbbbbbbbbb
   [etc.]
   ```

2. Retrieve first batch of 5 meetings via `mcp__granola__get_meetings()`:
   ```json
   {
     "meeting_ids": [
       "aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa",
       "aaaaaaaa-0001-0001-0001-bbbbbbbbbbbb",
       "aaaaaaaa-0001-0001-0001-cccccccccccc",
       "aaaaaaaa-0001-0001-0001-dddddddddddd",
       "aaaaaaaa-0001-0001-0001-eeeeeeeeeeee"
     ]
   }
   ```

3. For each meeting returned, retrieve full transcript:
   ```
   mcp__granola__get_meeting_transcript(meeting_id)
   ```

4. Create markdown files in `Work/Meetings/` directory:
   - Filename: `meeting-<meeting-id>.md`
   - Include meeting metadata, summary, and full transcript

5. Repeat for remaining meetings (5 at a time)

6. Create weekly index file:
   - Filename: `Work/Meetings/2026-W06-index.md`
   - List all archived meetings for the week
   - Group by meeting type or CRM track

**Token cost:**
- ~500 tokens gap analysis
- ~3,000-5,000 tokens per batch of 5 meetings (transcripts + metadata)
- Total for 24 meetings: ~15,000-20,000 tokens

**Optimization:**
- Process 2-3 batches per session to manage context
- Reuse existing transcript text if already captured in notes

## Procedure 3: Targeted Subset Archive

**When to use:** Archive only specific meetings (e.g., CRM-related, specific project)

**Prerequisites:**
- Identified which meetings are priority
- Know the criteria (project, participants, date range)

**Steps:**

1. Identify target meetings from gap analysis:
   - Example: "Archive all CRM project meetings"
   - Filter list to: Sales/Service/Technical standup meetings

2. Retrieve only target meeting IDs:
   ```
   meeting-bbbbbbbb-0002-0002-0002-aaaaaaaaaaaa (CRM Sales)
   meeting-bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb (CRM Service)
   meeting-bbbbbbbb-0002-0002-0002-cccccccccccc (CRM Sponsor)
   ```

3. Retrieve and archive via same process as Procedure 2

4. Organize in subfolder:
   - `Work/Meetings/CRM/` - CRM project meetings
   - `Work/Meetings/Product/` - Product strategy meetings
   - `Work/Meetings/Engineering/` - Engineering sync meetings

**Token cost:** Proportional to number of meetings (3,000-5,000 tokens per 5 meetings)

## Procedure 4: Batch Processing (Most Efficient for Large Sets)

**When to use:** Archive 20+ meetings over multiple sessions

**Prerequisites:**
- Long-term archiving plan
- Willing to spread over multiple sessions
- Want to manage token budget carefully

**Steps:**

1. Create archiving schedule:
   - Session 1: Archive CRM meetings (10 meetings) = ~6,000 tokens
   - Session 2: Archive Product meetings (8 meetings) = ~5,000 tokens
   - Session 3: Archive Engineering meetings (6 meetings) = ~4,000 tokens

2. Each session:
   - Run gap analysis to confirm what's needed
   - Retrieve 5-10 meetings
   - Create markdown files
   - Update progress tracker

3. Create progress file: `Work/Meetings/_archiving-progress.md`
   ```markdown
   # Granola Archiving Progress

   ## Week of Feb 9-13, 2026

   - [x] CRM Sales/Service (10 meetings)
   - [ ] Product Strategy (8 meetings)
   - [ ] Engineering (6 meetings)
   - [ ] Misc (5 meetings)

   Total: 29 meetings
   Archived: 10/29
   ```

4. Update after each session

**Token cost:** Spread over multiple sessions, managed budget

**Advantages:**
- Manageable per-session token budget
- Can prioritize important meetings first
- Integrate with other session work
- Natural stopping points

## Procedure 5: Discovering Additional People While Archiving

**When to use:** While archiving, identify new people mentioned in meetings

**Steps:**

1. As you archive and read transcripts, note new people:
   - Names mentioned in discussions
   - Email addresses visible
   - Roles and responsibilities implied

2. Add to `Work/People/` profiles:
   - Create new profile file
   - Include name, role, relationship
   - Link from meeting files

3. Update `Work/People/People Index.md`:
   - Add new people to index
   - Document role and team
   - Note which meetings they appear in

**Example discovery workflow:**
```
While archiving meeting-bbbbbbbb-0002-0002-0002-cccccccccccc:
- See "Alex Chen" mentioned (regional project lead)
- Create Work/People/Alex Chen.md
- Add to People Index
- Link from CRM meeting file
```

## Procedure 6: Organization and Indexing

**When to use:** After archiving a week of meetings

**Steps:**

1. Create weekly index file:
   ```
   File: Work/Meetings/2026-W06-index.md
   ```

2. Include sections:
   - Summary of week's meetings
   - Meetings by track (CRM Sales, CRM Service, Product, etc.)
   - Key decisions and outcomes
   - Cross-links to related files

3. Update main `Work/Meetings/README.md`:
   - List all archived weeks
   - Quick stats (total meetings, date ranges)
   - Search tips

4. Link from weekly review:
   - `2026-W06 (Feb 9-13).md` references meeting archive
   - Cross-links between weekly review and transcripts

## Token Efficiency Checklist

When archiving, optimize tokens by:

- [ ] Run gap analysis first (--dry-run) before committing to retrieval
- [ ] Batch retrieve: 5-10 meetings per API call, not one-at-a-time
- [ ] Reuse transcript text: If already captured in notes, don't re-retrieve
- [ ] Process in sessions: 5-10 meetings per session to manage context window
- [ ] Organize as you go: Create files with metadata to avoid re-parsing later
- [ ] Link carefully: Add wiki-links to related files for context
- [ ] Update incrementally: Don't wait to organize everything at the end

## Common Scenarios

### Scenario: "I want to archive this week's meetings"

1. Run gap analysis: `sync_granola.py 2026-02-09 2026-02-13 --dry-run`
2. Review output
3. Retrieve first batch (5 meetings) via `get_meetings()`
4. Get full transcripts for each via `get_meeting_transcript()`
5. Create markdown files in `Work/Meetings/`
6. Repeat for remaining meetings
7. Create weekly index linking all files

**Expected tokens:** 500 (analysis) + 5,000 per batch

### Scenario: "I only need CRM project meetings archived"

1. Run gap analysis: `sync_granola.py 2026-02-09 2026-02-13 --dry-run`
2. Filter to CRM meetings only (10 meetings)
3. Retrieve these 10 via batched `get_meetings()` calls
4. Create markdown files in `Work/Meetings/CRM/`
5. Link from CRM project tracker

**Expected tokens:** 500 + 6,000-8,000

### Scenario: "Archive gradually over next 3 sessions"

1. Session 1: Gap analysis + CRM meetings (10)
2. Session 2: Product meetings (8)
3. Session 3: Engineering + misc (11)
4. Maintain progress file throughout

**Expected tokens:** Spread: 500 + 5,000/session

## Troubleshooting

### Problem: Script says meetings exist but I can't find the files

**Solution:**
- Check naming convention: `meeting-<id>.md`
- Verify `Work/Meetings/` folder exists
- Look for similar filenames (typos, different formatting)

### Problem: Transcript is very long, creating large file

**Solution:**
- Split into sections: summary + transcript
- Use callouts to structure content
- Consider separate files for transcript vs. notes

### Problem: Running out of tokens while archiving

**Solution:**
- Stop and commit current work (git)
- Continue in next session
- Use progress tracker to remember where you left off
- Prioritize most important meetings first

### Problem: Too many meetings, feeling overwhelmed

**Solution:**
- Use targeted archiving (specific projects only)
- Use batch processing over multiple weeks
- Focus on recent meetings first, work backward
- Start with gap analysis to see true scope
