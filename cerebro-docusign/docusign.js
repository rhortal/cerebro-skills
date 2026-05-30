#!/usr/bin/env node

/**
 * cerebro-docusign: Find and sign Docusign documents from Outlook emails
 *
 * Workflow:
 * 1. Fetch today's emails containing Docusign
 * 2. Extract signing URLs from Safelinks-wrapped HTML
 * 3. Output JSON with email info and signing URLs
 * 4. After signing, mark emails as read via Graph API
 *
 * Usage:
 *   node docusign.js                    # Find pending Docusign documents (JSON)
 *   node docusign.js --check            # Check for documents only
 *   node docusign.js --mark-read <id>   # Mark specific email as read
 *
 * For browser signing, the skill invokes Playwright directly.
 */

const path = require('path');
const { Composio } = require('../cerebro-composio/composio');

const OUTLOOK_ACCOUNT_ID = 'YOUR_CLAUDE_INBOX_ACCOUNT_ID';
const TZ = 'Europe/Madrid';

// CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { check: false, markRead: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') {
      opts.check = true;
    } else if (args[i] === '--mark-read' && args[i + 1]) {
      opts.markRead = args[++i];
    }
  }
  return opts;
}

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

// Extract Docusign signing URLs from email body HTML
function extractSigningUrls(html) {
  const urls = [];

  // Find href attributes containing docusign signing links
  const hrefMatches = html.match(/href\s*=\s*["']([^"']+)["']/gi) || [];

  for (const match of hrefMatches) {
    const urlMatch = match.match(/href\s*=\s*["']([^"']+)["']/);
    if (!urlMatch) continue;

    let url = urlMatch[1];

    // Handle Outlook Safelinks - extract the actual URL from the query param
    if (url.includes('safelinks.protection.outlook.com')) {
      try {
        const urlObj = new URL(url);
        const actualUrl = urlObj.searchParams.get('url');
        if (actualUrl && actualUrl.includes('docusign')) {
          // Decode URL-encoded destination
          urls.push(decodeURIComponent(actualUrl));
        }
      } catch (e) {
        // Skip malformed URLs
      }
    } else if (url.includes('docusign') && url.includes('signing')) {
      urls.push(url);
    }
  }

  // Remove duplicates
  return [...new Set(urls)];
}

// Fetch emails containing Docusign
async function findDocusignEmails(composio, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

  const filter = `receivedDateTime ge ${startOfDay.toISOString()} and receivedDateTime le ${endOfDay.toISOString()}`;
  const select = 'id,subject,from,receivedDateTime,isRead,hasAttachments';
  const endpoint = `/v1.0/me/messages?$filter=${encodeURIComponent(filter)}&$top=50&$select=${select}&$orderby=receivedDateTime desc`;

  const result = await composio.tools.proxyExecute({
    connectedAccountId: OUTLOOK_ACCOUNT_ID,
    endpoint,
    method: 'GET',
    parameters: []
  });

  const emails = result.data.value || [];

  // Filter for Docusign emails
  const docusignEmails = emails.filter(e =>
    e.subject && e.subject.toLowerCase().includes('docusign')
  );

  // Get full body for each to extract URLs
  const enriched = [];

  for (const email of docusignEmails) {
    const bodyEndpoint = `/v1.0/me/messages/${email.id}?$select=subject,body,from`;
    const bodyResult = await composio.tools.proxyExecute({
      connectedAccountId: OUTLOOK_ACCOUNT_ID,
      endpoint: bodyEndpoint,
      method: 'GET',
      parameters: []
    });

    const html = bodyResult.data.body?.content || '';
    const urls = extractSigningUrls(html);

    // Get the first signing URL (the main one)
    const signingUrl = urls.find(u => u.includes('/signing/emails/'));

    if (signingUrl) {
      enriched.push({
        id: email.id,
        subject: email.subject,
        from: email.from?.emailAddress?.name || 'Unknown',
        isRead: email.isRead,
        signingUrl
      });
    }
  }

  return enriched;
}

// Mark email as read via Graph API PATCH
// Note: This uses the proxyExecute with body in a format Graph API accepts
async function markAsRead(composio, messageId) {
  const endpoint = `/v1.0/me/messages/${messageId}`;

  // Use the tools.proxyExecute method - for PATCH, body goes in parameters
  // This is a workaround - the proper way would be via SDK's native method
  const result = await composio.tools.proxyExecute({
    connectedAccountId: OUTLOOK_ACCOUNT_ID,
    endpoint: endpoint,
    method: 'PATCH',
    parameters: [],
    body: JSON.stringify({ isRead: true })
  });

  return result.data;
}

// Main
async function main() {
  const opts = parseArgs();
  const composio = new Composio();

  // Handle --mark-read
  if (opts.markRead) {
    try {
      await markAsRead(composio, opts.markRead);
      console.log(`Marked email ${opts.markRead} as read`);
    } catch (e) {
      console.error('Failed to mark as read:', e.message);
      process.exit(1);
    }
    return;
  }

  // Find Docusign emails
  const dateStr = opts.date || todayStr();
  const emails = await findDocusignEmails(composio, dateStr);

  if (opts.check) {
    // Just check if there are documents
    console.log(emails.length > 0 ? 'Documents found' : 'No documents');
    process.exit(emails.length > 0 ? 0 : 1);
  }

  // Output as JSON for programmatic use
  console.log(JSON.stringify({
    count: emails.length,
    emails: emails.map(e => ({
      id: e.id,
      subject: e.subject,
      from: e.from,
      isRead: e.isRead,
      signingUrl: e.signingUrl
    }))
  }, null, 2));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});