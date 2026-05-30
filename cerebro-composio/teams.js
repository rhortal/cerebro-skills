#!/usr/bin/env node

/**
 * cerebro-teams: Fetch Teams DMs and group chats via Microsoft Graph API
 *
 * Uses the Outlook connected account (Chat.ReadWrite scope) to query Graph.
 * Covers: 1:1 DMs, group chats. Does NOT cover Teams channels (requires
 * Team.ReadBasic.All + ChannelMessage.Read.All — not in current scope).
 *
 * Usage:
 *   node teams.js                        # new messages since today (BCN midnight)
 *   node teams.js --hours 4              # received in last 4 hours
 *   node teams.js --since 2026-02-18     # since start of that date (BCN midnight)
 *   node teams.js --all                  # include your own sent messages too
 *   node teams.js --meetings             # include meeting chats (excluded by default)
 *   node teams.js --top 50               # fetch up to 50 chats to scan (default 15)
 *   node teams.js --format human         # human-readable (default: json)
 *   node teams.js --check-auth           # verify Graph API access
 */

const path = require('path');
const { Composio, USER_ID, TZ } = require(path.join(__dirname, 'composio'));

const OUTLOOK_ACCOUNT_ID = 'YOUR_CLAUDE_INBOX_ACCOUNT_ID'; // Outlook connection with Chat.ReadWrite

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { format: 'json', includeMeetings: false, includeOwn: false, checkAuth: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      opts.format = args[++i];
    } else if (args[i] === '--hours' && args[i + 1]) {
      opts.hours = parseInt(args[++i], 10);
    } else if (args[i] === '--since' && args[i + 1]) {
      opts.since = args[++i];
    } else if (args[i] === '--all') {
      opts.includeOwn = true;
    } else if (args[i] === '--meetings') {
      opts.includeMeetings = true;
    } else if (args[i] === '--check-auth') {
      opts.checkAuth = true;
    } else if (args[i] === '--top' && args[i + 1]) {
      opts.top = parseInt(args[++i], 10);
    }
  }

  return opts;
}

// ── Date / timezone helpers ───────────────────────────────────────────────────

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

function todayMidnightUTC() {
  const today = todayStr();
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1, 22, 0, 0)).toISOString();
}

function hoursAgoUTC(n) {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

function sinceDateUTC(dateStr) {
  if (dateStr.includes('T')) return new Date(dateStr).toISOString();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1, 22, 0, 0)).toISOString();
}

function toBCNDateTime(utcIso) {
  return new Date(utcIso).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: TZ
  });
}

// ── Graph API proxy ───────────────────────────────────────────────────────────

async function graphGet(composio, endpoint) {
  const result = await composio.tools.proxyExecute({
    connectedAccountId: OUTLOOK_ACCOUNT_ID,
    endpoint,
    method: 'GET',
    parameters: []
  });

  if (result.status === 401 || result.status === 403) {
    const msg = result.data?.error?.message || 'Forbidden';
    throw new Error(`Graph ${result.status}: ${msg.slice(0, 150)}`);
  }

  return result.data;
}

// ── Auth check ────────────────────────────────────────────────────────────────

async function checkAuth(composio) {
  try {
    const data = await graphGet(composio, '/v1.0/me');
    return { connected: true, displayName: data.displayName, email: data.mail, userId: data.id };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

// ── HTML stripping ────────────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Fetch new messages ────────────────────────────────────────────────────────

async function fetchNewMessages(composio, myUserId, opts) {
  let sinceISO;
  if (opts.hours) {
    sinceISO = hoursAgoUTC(opts.hours);
  } else if (opts.since) {
    sinceISO = sinceDateUTC(opts.since);
  } else {
    sinceISO = todayMidnightUTC();
  }

  const sinceDate = new Date(sinceISO);
  const top = opts.top || 15;

  // Get chats with last message preview (to cheaply filter active ones)
  const chatsData = await graphGet(
    composio,
    `/v1.0/me/chats?$top=${top}&$expand=lastMessagePreview,members&$orderby=lastMessagePreview/createdDateTime desc`
  );

  const allChats = chatsData?.value || [];

  // Filter to chats with activity since sinceISO
  const activeChats = allChats.filter(chat => {
    if (!opts.includeMeetings && chat.chatType === 'meeting') return false;
    const lastMsgTime = chat.lastMessagePreview?.createdDateTime;
    if (!lastMsgTime) return false;
    return new Date(lastMsgTime) >= sinceDate;
  });

  const results = [];

  for (const chat of activeChats) {
    // Get messages (top 20 per chat, Graph doesn't support filter on createdDateTime here)
    const msgsData = await graphGet(
      composio,
      `/v1.0/me/chats/${chat.id}/messages?$top=20&$orderby=createdDateTime desc`
    );

    const rawMessages = msgsData?.value || [];

    const messages = rawMessages
      .filter(m => {
        if (m.messageType !== 'message') return false;    // skip system messages
        if (m.deletedDateTime) return false;              // skip deleted
        if (new Date(m.createdDateTime) < sinceDate) return false; // outside window
        if (!opts.includeOwn && m.from?.user?.id === myUserId) return false; // skip own
        return true;
      })
      .map(m => ({
        id: m.id,
        from: {
          name: m.from?.user?.displayName || m.from?.application?.displayName || 'Unknown',
          id: m.from?.user?.id || null
        },
        createdDateTime: m.createdDateTime,
        createdBCN: toBCNDateTime(m.createdDateTime),
        body: m.body?.content ? stripHtml(m.body.content).slice(0, 300) : null,
        hasAttachments: (m.attachments?.length || 0) > 0,
        importance: m.importance || 'normal',
        mentions: (m.mentions || [])
          .filter(mn => mn.mentioned?.user?.id === myUserId)
          .map(mn => mn.mentioned?.user?.displayName)
      }));

    if (messages.length === 0) continue;

    results.push({
      chatId: chat.id,
      chatType: chat.chatType,
      chatName: resolveChatName(chat, myUserId),
      members: (chat.members || [])
        .filter(m => m.userId !== myUserId)
        .map(m => m.displayName)
        .filter(Boolean),
      messages
    });
  }

  return results;
}

function resolveChatName(chat, myUserId) {
  if (chat.topic) return chat.topic;
  if (chat.chatType === 'oneOnOne') {
    const other = (chat.members || []).find(m => m.userId !== myUserId);
    return other?.displayName || '1:1 Chat';
  }
  const others = (chat.members || []).filter(m => m.userId !== myUserId);
  return others.map(m => m.displayName).join(', ') || `Group Chat`;
}

// ── Human-readable output ─────────────────────────────────────────────────────

function humanOutput(chats) {
  const totalMessages = chats.reduce((sum, c) => sum + c.messages.length, 0);

  if (totalMessages === 0) {
    console.log('✅ No new Teams messages found.');
    return;
  }

  const chatCount = chats.length;
  console.log(`\n💬 ${totalMessages} new Teams message${totalMessages === 1 ? '' : 's'} across ${chatCount} chat${chatCount === 1 ? '' : 's'}\n${'─'.repeat(60)}`);

  for (const chat of chats) {
    const icon = chat.chatType === 'oneOnOne' ? '👤' : chat.chatType === 'meeting' ? '📹' : '👥';
    console.log(`\n${icon} ${chat.chatName}`);

    for (const m of chat.messages) {
      const flags = [
        m.importance === 'high' ? '🔴 HIGH' : '',
        m.hasAttachments ? '📎' : '',
        m.mentions.length > 0 ? '@ mentioned you' : ''
      ].filter(Boolean).join('  ');

      console.log(`  ${m.createdBCN}${flags ? '  ' + flags : ''}`);
      console.log(`  👤 ${m.from.name}`);
      if (m.body) console.log(`  💬 ${m.body}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const composio = new Composio();

  if (opts.checkAuth) {
    const auth = await checkAuth(composio);
    console.log(JSON.stringify(auth, null, 2));
    if (!auth.connected) process.exit(1);
    return;
  }

  const auth = await checkAuth(composio);
  if (!auth.connected) {
    console.error('❌ Teams not accessible. Run: node teams.js --check-auth');
    process.exit(1);
  }

  const chats = await fetchNewMessages(composio, auth.userId, opts);

  if (opts.format === 'human') {
    humanOutput(chats);
  } else {
    console.log(JSON.stringify(chats, null, 2));
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
