#!/usr/bin/env node
/**
 * cerebro-composio/gmail.js — Fetch Gmail inbox emails
 *
 * Usage:
 *   node gmail.js                        # unread emails since BCN midnight
 *   node gmail.js --hours 4              # received in last 4 hours
 *   node gmail.js --since 2026-03-24     # since BCN midnight of that date
 *   node gmail.js --all                  # include already-read emails
 *   node gmail.js --top 50               # fetch up to 50 (default: 30)
 *   node gmail.js --format human          # human-readable (default: json)
 *   node gmail.js --check-auth           # verify Gmail OAuth
 */

const path = require('path');
const {
  Composio, createClient, GMAIL_ID,
  bcnMidnightUTC, hoursAgoUTC, toBCNDateTime, toBCNTime, toBCNDate
} = require(path.join(__dirname, 'composio'));

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { format: 'json', unreadOnly: true, checkAuth: false, markRead: null };

  for (let i = 0; i < args.length; i++) {
    if      (args[i] === '--format'     && args[i+1]) opts.format     = args[++i];
    else if (args[i] === '--hours'      && args[i+1]) opts.hours      = parseInt(args[++i], 10);
    else if (args[i] === '--since'      && args[i+1]) opts.since      = args[++i];
    else if (args[i] === '--top'        && args[i+1]) opts.top        = parseInt(args[++i], 10);
    else if (args[i] === '--all')                     opts.unreadOnly = false;
    else if (args[i] === '--check-auth')              opts.checkAuth  = true;
    else if (args[i] === '--mark-read' && args[i+1])  opts.markRead   = args[++i];
    else if (args[i] === '--mark-read')              opts.markRead   = 'all';
  }
  return opts;
}

// ── Auth check ────────────────────────────────────────────────────────────────

async function checkAuth(client) {
  try {
    const r = await client.tools.proxyExecute({
      connectedAccountId: GMAIL_ID,
      endpoint: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      method: 'GET',
      parameters: []
    });
    const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    console.log(JSON.stringify({
      connected: true,
      email: data.emailAddress,
      messagesTotal: data.messagesTotal,
      threadsTotal: data.threadsTotal,
      historyId: data.historyId,
      accountId: GMAIL_ID,
    }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ connected: false, error: e.message }, null, 2));
  }
}

// ── Gmail query builder ───────────────────────────────────────────────────────

function buildGmailQuery(opts) {
  const parts = [];

  if (opts.unreadOnly) parts.push('is:unread');

  // Date filter: Gmail uses Unix timestamp (seconds) with after:/before:
  const sinceISO = opts.hours
    ? new Date(Date.now() - opts.hours * 3600 * 1000).toISOString()
    : opts.since
      ? bcnMidnightUTC(opts.since)
      : bcnMidnightUTC();

  const sinceUnix = Math.floor(Date.parse(sinceISO) / 1000);
  parts.push(`after:${sinceUnix}`);

  return parts.join(' ');
}

// ── Fetch emails ──────────────────────────────────────────────────────────────

async function fetchEmails(client, opts) {
  const query = buildGmailQuery(opts);
  const top   = opts.top || 30;

  // First get message IDs
  const listRes = await client.tools.proxyExecute({
    connectedAccountId: GMAIL_ID,
    endpoint: `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${top}&q=${encodeURIComponent(query)}`,
    method: 'GET',
    parameters: []
  });

  const listData = typeof listRes.data === 'string' ? JSON.parse(listRes.data) : listRes.data;
  const messages = listData.messages || [];
  const results  = [];

  // Then fetch metadata for each (batch in groups of 10)
  for (let i = 0; i < messages.length; i += 10) {
    const batch = messages.slice(i, i + 10);
    const metaPromises = batch.map(m =>
      client.tools.proxyExecute({
        connectedAccountId: GMAIL_ID,
        endpoint: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To`,
        method: 'GET',
        parameters: []
      }).then(r => {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        const headers = (d.payload?.headers || []).reduce((acc, h) => { acc[h.name] = h.value; return acc; }, {});
        return {
          id:          m.id,
          threadId:    d.threadId,
          internalDate: d.internalDate, // ms timestamp
          from: {
            name:  headers.From?.match(/^"?([^"]+)"?\s*<.*>/)?.[1] || headers.From || '',
            email: headers.From?.match(/<(.+)>/)?.[1] || headers.From || ''
          },
          subject:     headers.Subject || '(no subject)',
          date:        headers.Date || '',
          snippet:     d.snippet || '',
          labelIds:    d.labelIds || [],
          isRead:      !(d.labelIds || []).includes('UNREAD'),
        };
      }).catch(() => null)
    );
    const batchResults = await Promise.all(metaPromises);
    results.push(...batchResults.filter(Boolean));
  }

  // Sort by internalDate descending
  results.sort((a, b) => parseInt(b.internalDate) - parseInt(a.internalDate));

  // Add BCN datetime
  return results.map(e => ({
    id:          e.id,
    threadId:    e.threadId,
    subject:     e.subject,
    from:        e.from,
    receivedDate: e.date,
    receivedBCN:  new Date(parseInt(e.internalDate)).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }),
    receivedTime: new Date(parseInt(e.internalDate)).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }),
    snippet:     e.snippet,
    isRead:      e.isRead,
    labelIds:    e.labelIds,
  }));
}

// ── Human output ──────────────────────────────────────────────────────────────

function printEmails(emails, opts) {
  if (emails.length === 0) {
    console.log(opts.unreadOnly ? '✅ No unread emails.' : '✅ No emails found.');
    return;
  }
  const label = opts.unreadOnly ? 'unread' : 'recent';
  console.log(`\n📬 ${emails.length} ${label} email${emails.length !== 1 ? 's' : ''}\n${'─'.repeat(60)}`);
  for (const e of emails) {
    const flags = [e.isRead ? '' : '🔵 UNREAD'].filter(Boolean).join(' ');
    console.log(`\n  ${e.receivedBCN}${flags ? '  ' + flags : ''}`);
    console.log(`  📧 ${e.subject}`);
    console.log(`  👤 ${e.from.name || e.from.email}`);
    if (e.snippet) console.log(`  💬 ${e.snippet.replace(/\s+/g, ' ')}`);
  }
  console.log();
}

// ── Mark emails as read (remove UNREAD label) ───────────────────────────────

async function markRead(client, messageId) {
  await client.tools.proxyExecute({
    connectedAccountId: GMAIL_ID,
    endpoint: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    method: 'POST',
    parameters: [{ name: 'Content-Type', value: 'application/json', in: 'header' }],
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
  });
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
    const emails = await fetchEmails(client, opts);

    if (opts.markRead) {
      const toMark = opts.markRead === 'all'
        ? emails.filter(e => !e.isRead)
        : emails.filter(e => e.id === opts.markRead);
      await Promise.all(toMark.map(e => markRead(client, e.id).catch(err => {
        console.error(`⚠️  Failed to mark ${e.id} as read: ${err.message}`);
      })));
      const ids = toMark.map(e => e.id);
      console.log(`✅ Marked ${ids.length} email(s) as read: ${ids.join(', ')}`);
    }

    if (opts.format === 'human') {
      printEmails(emails, opts);
    } else {
      console.log(JSON.stringify({ emails, count: emails.length }, null, 2));
    }
  } catch (e) {
    console.error('Gmail fetch failed:', e.message);
    process.exit(1);
  }
})();

// ── Legacy exports (for backward compat) ─────────────────────────────────────
// module.exports = { fetchEmails, checkAuth }; // uncomment if needed
