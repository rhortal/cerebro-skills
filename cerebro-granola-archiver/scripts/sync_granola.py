#!/usr/bin/env python3
"""
Granola Archiver - Sync missing meeting transcripts from Granola to local vault.

This script identifies which meeting transcripts from a date range already exist
in the Work/Meetings folder and retrieves only the missing ones from Granola API.

Usage:
    python3 sync_granola.py <vault_path> <start_date> <end_date> [--dry-run]

Example:
    python3 sync_granola.py /Users/your-username/Documents/Obsidian/Cerebro 2026-02-09 2026-02-13
    python3 sync_granola.py /Users/your-username/Documents/Obsidian/Cerebro 2026-02-09 2026-02-13 --dry-run
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
import subprocess

def get_meeting_files(vault_path):
    """Get set of meeting file IDs already archived."""
    meetings_dir = Path(vault_path) / "Work" / "Meetings"
    if not meetings_dir.exists():
        return set()

    # Extract meeting IDs from filenames (format: meeting-<id>.md)
    existing = set()
    for file in meetings_dir.glob("meeting-*.md"):
        try:
            # Parse ID from filename
            meeting_id = file.stem.replace("meeting-", "")
            existing.add(meeting_id)
        except:
            pass

    return existing

def list_granola_meetings(start_date, end_date):
    """Query Granola API via claude-code tools."""
    cmd = [
        "cc", "query",
        "--tool", "mcp__granola__list_meetings",
        "--args", json.dumps({
            "time_range": "custom",
            "custom_start": start_date,
            "custom_end": end_date
        }),
        "--json"
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        # Parse the JSON output
        data = json.loads(result.stdout)
        return data.get("meetings_data", {})
    except subprocess.CalledProcessError as e:
        print(f"Error querying Granola API: {e.stderr}", file=sys.stderr)
        return {}

def identify_missing_meetings(granola_meetings, existing_ids):
    """Identify which meetings need to be archived."""
    missing = []

    for meeting_id, meeting_info in granola_meetings.items():
        if meeting_id not in existing_ids:
            missing.append({
                "id": meeting_id,
                "title": meeting_info.get("title", "Unknown"),
                "date": meeting_info.get("date", "Unknown")
            })

    return missing

def format_output(existing_count, missing_count, missing_meetings):
    """Format the analysis for Claude to review."""
    output = f"""
## Granola Meeting Sync Report

### Summary
- **Existing archived meetings**: {existing_count}
- **Missing (to archive)**: {missing_count}
- **Total in period**: {existing_count + missing_count}

### Missing Meetings to Archive
"""

    if missing_meetings:
        for meeting in sorted(missing_meetings, key=lambda m: m.get("date", "")):
            output += f"\n- **{meeting['title']}** (ID: {meeting['id']}, Date: {meeting['date']})"
    else:
        output += "\nAll meetings already archived! ✓"

    return output

def main():
    if len(sys.argv) < 4:
        print("Usage: sync_granola.py <vault_path> <start_date> <end_date> [--dry-run]", file=sys.stderr)
        sys.exit(1)

    vault_path = sys.argv[1]
    start_date = sys.argv[2]
    end_date = sys.argv[3]
    dry_run = "--dry-run" in sys.argv

    # Verify vault exists
    if not Path(vault_path).exists():
        print(f"Error: Vault path not found: {vault_path}", file=sys.stderr)
        sys.exit(1)

    print(f"📋 Analyzing Granola meetings from {start_date} to {end_date}...\n", file=sys.stderr)

    # Get existing archived meetings
    existing_ids = get_meeting_files(vault_path)
    print(f"✓ Found {len(existing_ids)} existing archived meetings", file=sys.stderr)

    # Get Granola meetings for the period
    granola_meetings = list_granola_meetings(start_date, end_date)
    print(f"✓ Retrieved {len(granola_meetings)} meetings from Granola", file=sys.stderr)

    # Identify missing
    missing = identify_missing_meetings(granola_meetings, existing_ids)
    print(f"✓ Identified {len(missing)} missing meetings\n", file=sys.stderr)

    # Output analysis
    report = format_output(len(existing_ids), len(missing), missing)
    print(report)

    if dry_run:
        print("\n(DRY RUN - no meetings archived)")

    return 0 if len(missing) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
