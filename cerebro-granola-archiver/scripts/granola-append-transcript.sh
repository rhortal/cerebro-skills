#!/bin/bash
# granola-append-transcript.sh
# Appends a meeting transcript from the local Granola cache to an existing vault file.
# Transcript text never passes through Claude's context window.
#
# Usage: granola-append-transcript.sh <meeting-id> <target-file>
# Exit 0 always — failure to find transcript just writes a note.

set -uo pipefail

MEETING_ID="${1:-}"
TARGET_FILE="${2:-}"

if [ -z "$MEETING_ID" ] || [ -z "$TARGET_FILE" ]; then
    echo "Usage: $0 <meeting-id> <target-file>" >&2
    exit 1
fi

if [ ! -f "$TARGET_FILE" ]; then
    echo "Target file not found: $TARGET_FILE" >&2
    exit 1
fi

CACHE_FILE="$HOME/Library/Application Support/Granola/cache-v6.json"

if [ ! -f "$CACHE_FILE" ]; then
    printf '\n## Full Transcript\n\n*Transcript not available: Granola cache not found.*\n' >> "$TARGET_FILE"
    exit 0
fi

python3 - "$MEETING_ID" "$TARGET_FILE" "$CACHE_FILE" <<'PYEOF'
import json, sys

meeting_id = sys.argv[1]
target_file = sys.argv[2]
cache_file = sys.argv[3]

try:
    with open(cache_file) as f:
        data = json.load(f)
    transcripts = data.get('cache', {}).get('state', {}).get('transcripts', {})
    segments = transcripts.get(meeting_id)
except Exception as e:
    with open(target_file, 'a') as out:
        out.write(f'\n## Full Transcript\n\n*Transcript unavailable (cache read error: {e})*\n')
    sys.exit(0)

with open(target_file, 'a') as out:
    if not segments:
        out.write('\n## Full Transcript\n\n*Transcript not available in local cache.*\n')
        sys.exit(0)

    out.write('\n## Full Transcript\n\n')

    # Format segments — group consecutive segments by source channel
    # source: "system" = other participants (system audio), "microphone" = [USER]
    prev_source = None
    buffer = []

    def flush(out, source, buf):
        if not buf:
            return
        label = '[USER]' if source == 'microphone' else 'Other'
        out.write(f'**[{label}]** {" ".join(buf)}\n\n')

    for seg in segments:
        text = seg.get('text', '').strip()
        if not text:
            continue
        source = seg.get('source', 'system')
        if source != prev_source:
            flush(out, prev_source, buffer)
            buffer = [text]
            prev_source = source
        else:
            buffer.append(text)

    flush(out, prev_source, buffer)
    out.write(f'*Transcript extracted from local Granola cache ({len(segments)} segments).*\n')

PYEOF
