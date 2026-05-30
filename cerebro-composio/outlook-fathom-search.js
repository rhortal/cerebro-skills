const path = require('path');
const { Composio } = require(path.join(__dirname, 'composio'));

const OUTLOOK_ACCOUNT_ID = 'YOUR_CLAUDE_INBOX_ACCOUNT_ID';

async function graphGet(composio, endpoint) {
  const result = await composio.tools.proxyExecute({
    connectedAccountId: OUTLOOK_ACCOUNT_ID,
    endpoint,
    method: 'GET',
    parameters: []
  });
  if (result.status >= 400) throw new Error(`Graph ${result.status}: ${JSON.stringify(result.data?.error || result.data)}`);
  return result.data;
}

async function main() {
  const composio = new Composio({ dangerouslySkipVersionCheck: true });

  // Try filter on subject, then on from name if needed
  let data;
  try {
    data = await graphGet(composio,
      `/v1.0/me/messages?$filter=contains(subject,'Fathom')&$top=20&$select=subject,from,bodyPreview,receivedDateTime`
    );
  } catch (e) {
    console.error('Filter failed:', e.message);
    return;
  }

  let messages = data?.value || [];

  // Also check bodyPreview contains Fathom via a second call
  let data2;
  try {
    data2 = await graphGet(composio,
      `/v1.0/me/messages?$filter=contains(body,'Fathom')&$top=20&$select=subject,from,bodyPreview,receivedDateTime`
    );
    const extra = (data2?.value || []).filter(m => !messages.find(e => e.id === m.id));
    messages = [...messages, ...extra];
  } catch (e) {
    // body filter might not be supported, ignore
  }

  console.log(`Found ${messages.length} emails mentioning Fathom\n`);

  for (const msg of messages) {
    const from = msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Unknown';
    const date = new Date(msg.receivedDateTime).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid'
    });
    console.log(`=== ${date} | From: ${from}`);
    console.log(`Subject: ${msg.subject}`);
    console.log(`Preview: ${(msg.bodyPreview || '').substring(0, 500)}`);
    console.log('');
  }
}

main().catch(console.error);
