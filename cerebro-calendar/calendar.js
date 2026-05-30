#!/usr/bin/env node

/**
 * cerebro-calendar: Fetch Outlook calendar events via Composio CLI
 *
 * Uses `~/.composio/composio execute OUTLOOK_GET_CALENDAR_VIEW` — avoids the
 * proxyExecute path (disabled on this Composio account).
 *
 * Usage:
 *   node calendar.js                      # today's events
 *   node calendar.js 2026-02-18           # specific date
 *   node calendar.js --from 2026-02-17 --to 2026-02-21   # date range
 *   node calendar.js --days 5            # today + next 5 days
 *   node calendar.js --format human      # human-readable (default: json)
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const TZ       = 'Europe/Madrid';
const COMPOSIO = path.join(process.env.HOME, '.composio/composio');

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { format: 'json' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      opts.format = args[++i];
    } else if (args[i] === '--from' && args[i + 1]) {
      opts.from = args[++i];
    } else if (args[i] === '--to' && args[i + 1]) {
      opts.to = args[++i];
    } else if (args[i] === '--days' && args[i + 1]) {
      opts.days = parseInt(args[++i], 10);
    } else if (!args[i].startsWith('--')) {
      opts.date = args[i];
    }
  }
  return opts;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().split('T')[0];
}

// ── Event normalisation ───────────────────────────────────────────────────────

function parseTime(dateTimeStr) {
  // "2026-05-26T10:00:00.0000000" → "10:00"  (already Europe/Madrid from CLI)
  return dateTimeStr.split('T')[1].slice(0, 5);
}

function parseDate(dateTimeStr) {
  // "2026-05-26T10:00:00.0000000" → "2026-05-26"
  return dateTimeStr.split('T')[0];
}

function normaliseEvent(e) {
  return {
    id:          e.id,
    subject:     e.subject,
    date:        parseDate(e.start.dateTime),
    start:       parseTime(e.start.dateTime),
    end:         parseTime(e.end.dateTime),
    timezone:    TZ,
    isAllDay:    !!e.isAllDay,
    isCancelled: !!e.isCancelled,
    isRecurring: !!(e.recurrence || e.seriesMasterId),
    location:    e.location?.displayName || null,
    onlineMeeting: e.onlineMeetingUrl || e.onlineMeeting?.joinUrl || (e.isOnlineMeeting ? true : null),
    attendees: (e.attendees || []).map(a => ({
      name:  a.emailAddress?.name    || '',
      email: a.emailAddress?.address || '',
      type:  a.type || 'required'
    })),
    organizer: {
      name:  e.organizer?.emailAddress?.name    || '',
      email: e.organizer?.emailAddress?.address || ''
    },
    body: e.bodyPreview || null
  };
}

// ── Composio CLI fetch ────────────────────────────────────────────────────────

function fetchViaCliSync(startISO, endISO) {
  const input = JSON.stringify({
    start_datetime: startISO,
    end_datetime:   endISO,
    timezone:       TZ,
    top:            100
  });

  let raw;
  try {
    raw = execSync(
      `${COMPOSIO} execute OUTLOOK_GET_CALENDAR_VIEW -d '${input}'`,
      { env: process.env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch (err) {
    const stderr = err.stderr || err.message || '';
    throw new Error(`CLI error: ${stderr.slice(0, 300)}`);
  }

  // Strip ANSI escape codes (CLI upgrade banner etc.)
  const clean = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();

  // Find first '{' to isolate JSON (CLI may prefix text)
  const jsonStart = clean.indexOf('{');
  if (jsonStart === -1) throw new Error(`No JSON in CLI output: ${clean.slice(0, 200)}`);

  let result;
  try {
    result = JSON.parse(clean.slice(jsonStart));
  } catch {
    throw new Error(`Failed to parse CLI JSON: ${clean.slice(0, 300)}`);
  }

  if (!result.successful) {
    throw new Error(`CLI execution failed: ${result.error || JSON.stringify(result)}`);
  }

  // Large responses are written to a temp file
  let data;
  if (result.storedInFile && result.outputFilePath) {
    data = JSON.parse(fs.readFileSync(result.outputFilePath, 'utf8'));
  } else {
    data = result.data || result;
  }

  return data?.value || data?.data?.value || [];
}

// ── Human-readable output ─────────────────────────────────────────────────────

function humanOutput(events) {
  if (events.length === 0) {
    console.log('No events found.');
    return;
  }

  const byDate = {};
  for (const e of events) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }

  for (const [date, dayEvents] of Object.entries(byDate).sort()) {
    const label = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC'
    });
    const tzAbbr = new Date().toLocaleTimeString('en-GB', { timeZone: TZ, timeZoneName: 'short' }).split(' ').pop();
    console.log(`\n📅 ${label}  (times in ${tzAbbr})`);
    console.log('─'.repeat(50));

    const visible = dayEvents
      .filter(e => !e.isCancelled)
      .sort((a, b) => a.start.localeCompare(b.start));

    for (const e of visible) {
      const time = e.isAllDay ? '[ALL DAY]' : `${e.start}–${e.end}`;
      console.log(`\n  ${time}  ${e.subject}`);
      if (e.location) console.log(`    📍 ${e.location}`);
      if (e.attendees.length > 1) {
        const names = e.attendees.map(a => a.name).filter(Boolean).slice(0, 6).join(', ');
        const extra = e.attendees.length > 6 ? ` +${e.attendees.length - 6} more` : '';
        console.log(`    👥 ${names}${extra}`);
      }
      if (e.onlineMeeting) console.log(`    🔗 Online meeting`);
    }
  }
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();

  // Build date list
  let dates = [];
  if (opts.from && opts.to) {
    let cur = opts.from;
    while (cur <= opts.to) { dates.push(cur); cur = addDays(cur, 1); }
  } else if (opts.days) {
    const today = todayStr();
    for (let i = 0; i < opts.days; i++) dates.push(addDays(today, i));
  } else {
    dates = [opts.date || todayStr()];
  }

  // Fetch over the full range (start of first day to end of last day, UTC)
  const [sy, sm, sd] = dates[0].split('-').map(Number);
  const [ey, em, ed] = dates[dates.length - 1].split('-').map(Number);
  const startISO = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0)).toISOString();
  const endISO   = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59)).toISOString();

  const raw    = fetchViaCliSync(startISO, endISO);
  const dateSet = new Set(dates);
  const seen   = new Set();

  const events = raw
    .map(normaliseEvent)
    .filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return dateSet.has(e.date);
    });

  if (opts.format === 'human') {
    humanOutput(events);
  } else {
    console.log(JSON.stringify(events, null, 2));
  }
}

try {
  main();
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
