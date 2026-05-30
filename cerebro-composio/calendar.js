#!/usr/bin/env node
/**
 * cerebro-composio/calendar.js — Fetch Google Calendar events
 *
 * Usage:
 *   node calendar.js                        # today's events
 *   node calendar.js --days 3                # next 3 days (default: today)
 *   node calendar.js --days 7                # next 7 days
 *   node calendar.js --since 2026-03-28     # from date to now
 *   node calendar.js --format human          # human-readable (default)
 *   node calendar.js --format json           # JSON output
 *   node calendar.js --check-auth            # verify Google Calendar OAuth
 *   node calendar.js --ooo                   # check OOO today (returns exit code)
 */

const path = require('path');
const {
  Composio, createClient, GCAL_ID,
  TZ, bcnMidnightUTC, hoursAgoUTC, toBCNDateTime, toBCNTime, toBCNDate
} = require(path.join(__dirname, 'composio'));

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { format: 'human', checkOOO: false };

  for (let i = 0; i < args.length; i++) {
    if      (args[i] === '--format'  && args[i+1]) opts.format  = args[++i];
    else if (args[i] === '--days'   && args[i+1]) opts.days    = parseInt(args[++i], 10);
    else if (args[i] === '--since'   && args[i+1]) opts.since   = args[++i];
    else if (args[i] === '--check-auth')          opts.checkAuth = true;
    else if (args[i] === '--ooo')                 opts.checkOOO  = true;
  }
  return opts;
}

// ── Auth check ────────────────────────────────────────────────────────────────

async function checkAuth(client) {
  try {
    const r = await client.tools.proxyExecute({
      connectedAccountId: GCAL_ID,
      endpoint: 'https://www.googleapis.com/calendar/v3/calendars/primary?maxResults=1',
      method: 'GET',
      parameters: []
    });
    const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    console.log(JSON.stringify({
      connected: true,
      id:        d.id,
      summary:   d.summary,
      timezone:  d.timeZone,
      accountId: GCAL_ID,
    }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ connected: false, error: e.message }, null, 2));
  }
}

// ── Date range helpers ───────────────────────────────────────────────────────

function buildTimeRange(opts) {
  const now     = new Date();
  const bcnNow  = new Date(now.toLocaleString('sv-SE', { timeZone: TZ }));
  const bcnToday = new Date(bcnNow.toISOString().slice(0, 10));

  let timeMin, timeMax;

  if (opts.since) {
    timeMin = new Date(bcnMidnightUTC(opts.since));
    timeMax = new Date();
  } else if (opts.days) {
    timeMin = bcnToday;
    timeMax = new Date(bcnToday.getTime() + opts.days * 86400 * 1000);
  } else {
    // Default: today only
    timeMin = bcnToday;
    timeMax = new Date(bcnToday.getTime() + 86400 * 1000);
  }

  return {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  };
}

// ── Fetch events ──────────────────────────────────────────────────────────────

async function fetchEvents(client, opts) {
  const { timeMin, timeMax } = buildTimeRange(opts);
  const allEvents = [];

  let pageToken = undefined;

  do {
    const params = new URLSearchParams({
      maxResults:  '250',
      timeMin:      timeMin,
      timeMax:      timeMax,
      singleEvents: 'true',
      orderBy:      'startTime',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const r = await client.tools.proxyExecute({
      connectedAccountId: GCAL_ID,
      endpoint: `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      method: 'GET',
      parameters: []
    });

    const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    if (d.items) allEvents.push(...d.items);
    pageToken = d.nextPageToken || undefined;
  } while (pageToken);

  return allEvents
    .filter(e => e.status !== 'cancelled')
    .map(normalise);
}

function normalise(e) {
  const start = e.start || {};
  const end   = e.end   || {};

  const isAllDay = !start.dateTime;
  const startStr = start.dateTime || start.date || '';
  const endStr   = end.dateTime   || end.date   || '';

  // Parse start in BCN
  const startDate = new Date(startStr);
  const startBCN  = isAllDay
    ? start.date
    : startDate.toLocaleString('sv-SE', { timeZone: TZ });

  return {
    id:          e.id,
    summary:     e.summary || '(no title)',
    description: e.description || '',
    location:    e.location || '',
    isAllDay,
    start:       startStr,   // raw ISO
    startBCN,              // BCN-formatted
    end:         endStr,
    endBCN:      isAllDay ? end.date : new Date(endStr).toLocaleString('sv-SE', { timeZone: TZ }),
    startTime:   isAllDay ? null : startDate.toLocaleTimeString('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
    endTime:     isAllDay ? null : new Date(endStr).toLocaleTimeString('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
    organizer:   e.organizer?.displayName || e.organizer?.email || '',
    organizerEmail: e.organizer?.email || '',
    attendees:   (e.attendees || []).filter(a => !a.self).map(a => ({ name: a.displayName || a.email, email: a.email, response: a.responseStatus })),
    attendeesCount: (e.attendees || []).filter(a => !a.self).length,
    htmlLink:    e.htmlLink || '',
    created:     e.created,
    updated:     e.updated,
    // OOO detection
    isOOO: isAllDay && /out\s*of\s*office|ooo|oof|holiday|vacation|off\s*work/i.test(e.summary || ''),
  };
}

// ── Human output ──────────────────────────────────────────────────────────────

function printEvents(events, opts) {
  if (events.length === 0) {
    console.log('✅ No events found.');
    return;
  }

  // Group by date
  const byDate = {};
  for (const ev of events) {
    const dateKey = ev.isAllDay ? ev.startBCN.slice(0, 10) : ev.startBCN.slice(0, 10);
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(ev);
  }

  for (const [date, evts] of Object.entries(byDate)) {
    const isToday = date === new Date().toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 10);
    console.log(`\n📅 ${date}${isToday ? ' — TODAY' : ''}`);
    console.log('─'.repeat(50));

    for (const ev of evts.sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return a.start.localeCompare(b.start);
    })) {
      if (ev.isAllDay) {
        console.log(`  🌙 All day  ${ev.summary}`);
      } else {
        console.log(`  ${(ev.startTime || '').padEnd(6)} – ${(ev.endTime || '').padEnd(6)}  ${ev.summary}`);
      }
      if (ev.location) console.log(`  📍 ${ev.location}`);
      if (ev.attendeesCount > 0) console.log(`  👥 ${ev.attendeesCount} attendee${ev.attendeesCount !== 1 ? 's' : ''}`);
      if (ev.isOOO) console.log(`  🚫 OOO`);
    }
  }
  console.log();
}

function printOOO(events) {
  const today = new Date().toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 10);
  const oooToday = events.filter(e => e.isOOO && (e.startBCN.slice(0,10) === today || e.startBCN < today));
  if (oooToday.length > 0) {
    console.log('OOO_DETECTED');
    oooToday.forEach(e => console.log(`  🚫 ${e.summary} (${e.startBCN}${e.end ? ' → ' + e.endBCN : ''})`));
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const opts = parseArgs();
const client = createClient();

(async () => {
  if (opts.checkAuth) {
    await checkAuth(client);
    return;
  }

  try {
    const events = await fetchEvents(client, opts);

    if (opts.checkOOO) {
      printOOO(events);
      return;
    }

    if (opts.format === 'json') {
      console.log(JSON.stringify({ events, count: events.length }, null, 2));
    } else {
      printEvents(events, opts);
    }
  } catch (e) {
    console.error('Calendar fetch failed:', e.message);
    process.exit(1);
  }
})();
