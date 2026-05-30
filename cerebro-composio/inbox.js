#!/usr/bin/env node

/**
 * cerebro-composio/inbox.js — Fetch Outlook inbox emails
 *
 * Moved here from cerebro-lunch-check. This is the canonical location.
 * cerebro-lunch-check/inbox.js is a forwarding shim.
 *
 * Usage:
 *   node inbox.js                        # unread emails since BCN midnight
 *   node inbox.js --hours 4              # received in last 4 hours
 *   node inbox.js --since 2026-03-24     # since BCN midnight of that date
 *   node inbox.js --all                  # include already-read emails
 *   node inbox.js --importance high      # high importance only
 *   node inbox.js --top 50               # fetch up to 50 (default: 30)
 *   node inbox.js --format human         # human-readable (default: json)
 *   node inbox.js --shared               # fetch shared inboxes instead
 *   node inbox.js --check-auth           # verify Composio OAuth
 */

const path = require('path');
const {
  Composio, createClient, USER_ID, TZ, OUTLOOK_ID,
  graphGet, graphPatch, bcnMidnightUTC, hoursAgoUTC, toBCNTime, toBCNDateTime
} = require(path.join(__dirname, 'composio'));

// ── Shared mailboxes (checked with --shared flag) ─────────────────────────────

const SHARED_INBOXES = [
  'licensemanagement@company.com',
  '[USER]@company.com',
  'tools.admin@company.onmicrosoft.com',
  'techinnovation@company.com',
  'newsletters-prod@company.com'
];

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { format: 'json', unreadOnly: true, checkAuth: false, shared: false, markRead: null };

  for (let i = 0; i < args.length; i++) {
    if      (args[i] === '--format'     && args[i+1]) opts.format     = args[++i];
    else if (args[i] === '--hours'      && args[i+1]) opts.hours      = parseInt(args[++i], 10);
    else if (args[i] === '--since'      && args[i+1]) opts.since      = args[++i];
    else if (args[i] === '--importance' && args[i+1]) opts.importance = args[++i];
    else if (args[i] === '--top'        && args[i+1]) opts.top        = parseInt(args[++i], 10);
    else if (args[i] === '--all')                     opts.unreadOnly = false;
    else if (args[i] === '--check-auth')              opts.checkAuth  = true;
    else if (args[i] === '--shared')                  opts.shared     = true;
    else if (args[i] === '--mark-read' && args[i+1])  opts.markRead   = args[++i];
    else if (args[i] === '--mark-read')              opts.markRead   = 'all';
  }
  return opts;
}

// ── Filter builder ────────────────────────────────────────────────────────────

function buildFilter(opts) {
  const parts = [];

  if (opts.unreadOnly) parts.push('isRead eq false');
  if (opts.importance) parts.push(`importance eq '${opts.importance}'`);

  const sinceISO = opts.hours   ? hoursAgoUTC(opts.hours)
                 : opts.since   ? bcnMidnightUTC(opts.since)
                                : bcnMidnightUTC();
  parts.push(`receivedDateTime ge ${sinceISO}`);

  return parts.join(' and ');
}

// ── Fetch personal inbox ──────────────────────────────────────────────────────
// Uses Composio OUTLOOK_QUERY_EMAILS action (supports OData filter + select)

async function fetchEmails(client, opts) {
  const result = await client.tools.execute('OUTLOOK_QUERY_EMAILS', {
    userId: USER_ID,
    arguments: {
      folder:  'inbox',
      filter:  buildFilter(opts),
      orderby: 'receivedDateTime desc',
      top:     opts.top || 30,
      select:  ['from', 'subject', 'receivedDateTime', 'importance', 'isRead', 'bodyPreview', 'hasAttachments', 'id']
    },
    dangerouslySkipVersionCheck: true
  });

  if (!result?.data?.value) {
    throw new Error('No email data from Outlook. Run --check-auth to verify connection.');
  }
  return result.data.value;
}

// ── Fetch shared mailbox (proxyExecute — required for delegated access) ───────

async function fetchSharedInbox(client, email, opts) {
  const filter = buildFilter(opts);
  const top    = opts.top || 20;
  const select = 'id,subject,from,receivedDateTime,importance,isRead,hasAttachments,bodyPreview';
  const endpoint = `/v1.0/users/${encodeURIComponent(email)}/mailFolders/inbox/messages` +
    `?$filter=${encodeURIComponent(filter)}&$top=${top}&$select=${select}&$orderby=receivedDateTime desc`;

  try {
    const data = await graphGet(client, OUTLOOK_ID, endpoint);
    return (data.value || []).map(e => ({ ...normalise(e), inbox: email }));
  } catch (e) {
    return [{ inbox: email, error: e.message.slice(0, 120) }];
  }
}

// ── Normalise ─────────────────────────────────────────────────────────────────

function toBCNDate(utcIso) {
  return new Date(utcIso).toLocaleDateString('sv-SE', { timeZone: TZ });
}

function normalise(e) {
  return {
    id:             e.id,
    subject:        e.subject || '(no subject)',
    from: {
      name:  e.from?.emailAddress?.name  || '',
      email: e.from?.emailAddress?.address || ''
    },
    receivedDateTime: e.receivedDateTime,
    receivedBCN:      e.receivedDateTime ? toBCNDateTime(e.receivedDateTime) : null,
    receivedDate:     e.receivedDateTime ? toBCNDate(e.receivedDateTime)     : null,
    receivedTime:     e.receivedDateTime ? toBCNTime(e.receivedDateTime)     : null,
    importance:       e.importance || 'normal',
    isRead:           !!e.isRead,
    hasAttachments:   !!e.hasAttachments,
    preview:          e.bodyPreview ? e.bodyPreview.slice(0, 200) : null
  };
}

// ── Human output ──────────────────────────────────────────────────────────────

function printEmails(emails, opts) {
  if (emails.length === 0) {
    console.log(opts.unreadOnly ? '✅ No unread emails since the specified time.' : '✅ No emails found.');
    return;
  }
  const label = opts.unreadOnly ? 'unread' : 'recent';
  console.log(`\n📬 ${emails.length} ${label} email${emails.length !== 1 ? 's' : ''}\n${'─'.repeat(60)}`);
  for (const e of emails) {
    const flags = [e.importance === 'high' ? '🔴 HIGH' : '', e.hasAttachments ? '📎' : ''].filter(Boolean).join(' ');
    console.log(`\n  ${e.receivedBCN}${flags ? '  ' + flags : ''}`);
    console.log(`  📧 ${e.subject}`);
    console.log(`  👤 ${e.from.name || e.from.email}`);
    if (e.preview) console.log(`  💬 ${e.preview.replace(/\s+/g, ' ')}`);
  }
  console.log('\n' + '─'.repeat(60));
}

function printShared(results) {
  const emails = results.filter(r => !r.error);
  const errors = results.filter(r => r.error);
  for (const e of errors) console.log(`⚠️  ${e.inbox}: ${e.error}`);
  if (emails.length === 0) { console.log('✅ All shared inboxes clear.'); return; }

  const byInbox = {};
  for (const e of emails) (byInbox[e.inbox] = byInbox[e.inbox] || []).push(e);

  for (const [inbox, list] of Object.entries(byInbox)) {
    if (!list.length) continue;
    console.log(`\n📬 ${inbox} — ${list.length} message${list.length !== 1 ? 's' : ''}`);
    console.log('─'.repeat(60));
    for (const e of list) {
      const flags = [e.importance === 'high' ? '🔴 HIGH' : '', e.hasAttachments ? '📎' : '', !e.isRead ? '[UNREAD]' : ''].filter(Boolean).join(' ');
      console.log(`  ${e.receivedBCN}${flags ? '  ' + flags : ''}`);
      console.log(`  📧 ${e.subject}`);
      console.log(`  👤 ${e.from.name || e.from.email}`);
      if (e.preview) console.log(`  💬 ${e.preview.replace(/\s+/g, ' ')}`);
    }
  }
  console.log('\n' + '─'.repeat(60));
}

// ── Auth check ────────────────────────────────────────────────────────────────

async function checkAuth(client) {
  try {
    const accounts = await client.connectedAccounts.list({ userId: USER_ID });
    const items = accounts?.items || [];
    const outlook = items.find(a => a.toolkit?.slug === 'outlook');
    return {
      connected: !!outlook,
      account:   outlook || null,
      all:       items.map(a => ({ name: a.toolkit?.slug, status: a.status, id: a.id }))
    };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

// ── Mark emails as read ───────────────────────────────────────────────────────

async function markRead(client, messageId) {
  const endpoint = `/v1.0/me/messages/${messageId}`;
  await graphPatch(client, OUTLOOK_ID, endpoint, { isRead: true });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts   = parseArgs();
  const client = new Composio();

  if (opts.checkAuth) {
    const auth = await checkAuth(client);
    console.log(JSON.stringify(auth, null, 2));
    if (!auth.connected) process.exit(1);
    return;
  }

  const auth = await checkAuth(client);
  if (!auth.connected) {
    console.error('❌ Outlook not connected. Run: node inbox.js --check-auth');
    process.exit(1);
  }

  if (opts.shared) {
    const results = await Promise.all(SHARED_INBOXES.map(e => fetchSharedInbox(client, e, opts)));
    const flat = results.flat();
    opts.format === 'human' ? printShared(flat) : console.log(JSON.stringify(flat, null, 2));
    return;
  }

  const raw    = await fetchEmails(client, opts);
  const emails = raw.map(normalise);

  // Mark as read
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

  opts.format === 'human' ? printEmails(emails, opts) : console.log(JSON.stringify(emails, null, 2));
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
