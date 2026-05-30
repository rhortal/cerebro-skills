#!/usr/bin/env node

const path = require('path');
const { Composio } = require(path.join(__dirname, '../cerebro-composio/composio'));
const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

// Helper to read vault files
async function searchVault(searchTerm) {
  const files = await glob('**/*.md', {
    cwd: process.cwd(),
    ignore: ['node_modules/**', '.git/**']
  });

  const matches = [];
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      if (content.toLowerCase().includes(searchTerm.toLowerCase())) {
        matches.push({ file, content });
      }
    } catch (e) {
      // Skip files we can't read
    }
  }
  return matches;
}

// Helper to find person profile
async function findPersonContext(name) {
  const personFiles = await glob('People/**/*.md', { cwd: process.cwd() });

  for (const file of personFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const filename = path.basename(file, '.md');

      if (filename.toLowerCase().includes(name.toLowerCase()) ||
          content.toLowerCase().includes(name.toLowerCase())) {
        return { file, content, name: filename };
      }
    } catch (e) {
      // Skip
    }
  }
  return null;
}

// Analyze a single event
async function analyzeEvent(event, allEvents) {
  const analysis = {
    title: event.subject,
    startTime: new Date(event.start.dateTime),
    endTime: new Date(event.end.dateTime),
    location: event.location?.displayName || 'No location',
    attendees: event.attendees?.map(a => a.emailAddress.name) || [],
    isRecurring: event.recurrence !== null,
    isFocusTime: event.subject.toLowerCase().includes('focus'),
    isTravel: event.subject.toLowerCase().includes('travel'),
    prepNeeds: [],
    decisions: [],
    context: [],
    priority: 'normal'
  };

  // Determine priority based on keywords
  const highPriorityKeywords = ['urgent', 'critical', '1:1', 'review', 'decision'];
  if (highPriorityKeywords.some(kw => event.subject.toLowerCase().includes(kw))) {
    analysis.priority = 'high';
  }

  // Identify prep needs based on meeting type
  if (event.subject.toLowerCase().includes('review')) {
    analysis.prepNeeds.push('Review relevant materials and metrics');
    analysis.decisions.push('Approval or feedback needed');
  }

  if (event.subject.toLowerCase().includes('design')) {
    analysis.prepNeeds.push('Review design artifacts and previous decisions');
    analysis.decisions.push('Design direction and user experience choices');
  }

  if (event.subject.toLowerCase().includes('technical') ||
      event.subject.toLowerCase().includes('engineering')) {
    analysis.prepNeeds.push('Review technical requirements and constraints');
    analysis.decisions.push('Technical approach and implementation strategy');
  }

  if (event.subject.toLowerCase().includes('1:1') ||
      event.attendees?.length === 2) {
    analysis.prepNeeds.push('Review person\'s recent work and open items');
    analysis.decisions.push('Feedback, guidance, or resource allocation');
  }

  if (event.subject.toLowerCase().includes('planning') ||
      event.subject.toLowerCase().includes('roadmap')) {
    analysis.prepNeeds.push('Review priorities and dependencies');
    analysis.decisions.push('Priority ordering and timeline commitments');
  }

  // Search for context about attendees
  for (const attendee of analysis.attendees.slice(0, 3)) { // Limit to first 3
    const personContext = await findPersonContext(attendee);
    if (personContext) {
      analysis.context.push({
        name: attendee,
        hasProfile: true,
        profileLink: personContext.file
      });
    }
  }

  return analysis;
}

// Generate markdown for daily prep
function generatePrepMarkdown(date, events, analyses) {
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let md = `\n## 🎯 Daily Prep - ${dateStr}\n\n`;

  // Calculate overview stats
  const totalMeetings = analyses.filter(a => !a.isFocusTime && !a.isTravel).length;
  const totalMeetingHours = analyses
    .filter(a => !a.isFocusTime && !a.isTravel)
    .reduce((sum, a) => sum + (a.endTime - a.startTime) / (1000 * 60 * 60), 0);

  const focusBlocks = analyses.filter(a => a.isFocusTime).length;
  const totalFocusHours = analyses
    .filter(a => a.isFocusTime)
    .reduce((sum, a) => sum + (a.endTime - a.startTime) / (1000 * 60 * 60), 0);

  md += `### 📊 Day Overview\n\n`;
  md += `- ${totalMeetings} meetings (${totalMeetingHours.toFixed(1)} hours)\n`;
  md += `- ${focusBlocks} focus blocks (${totalFocusHours.toFixed(1)} hours)\n`;

  if (totalMeetingHours > 6) {
    md += `- ⚠️ **Heavy meeting day** - protect focus time\n`;
  }

  md += `\n### 🗓️ Timeline & Prep Needs\n\n`;

  // Sort events by time
  const sortedAnalyses = [...analyses].sort((a, b) => a.startTime - b.startTime);

  for (const analysis of sortedAnalyses) {
    const startStr = analysis.startTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const endStr = analysis.endTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Skip pure focus time blocks or travel from detailed analysis
    if (analysis.isFocusTime || analysis.isTravel) {
      md += `**${startStr} - ${endStr}: ${analysis.title}**\n`;
      if (analysis.isFocusTime) {
        md += `- 🎯 Recommended: Deep work on high-priority tasks\n`;
      }
      md += `\n`;
      continue;
    }

    md += `**${startStr} - ${endStr}: ${analysis.title}**`;
    if (analysis.priority === 'high') {
      md += ` 🔴`;
    }
    md += `\n`;

    // Attendees
    if (analysis.attendees.length > 0) {
      md += `- 👥 Attendees: ${analysis.attendees.slice(0, 5).join(', ')}`;
      if (analysis.attendees.length > 5) {
        md += ` +${analysis.attendees.length - 5} more`;
      }
      md += `\n`;
    }

    // Location
    if (analysis.location && analysis.location !== 'No location') {
      md += `- 📍 ${analysis.location}\n`;
    }

    // Prep needs
    if (analysis.prepNeeds.length > 0) {
      md += `- 📝 Prep: ${analysis.prepNeeds[0]}\n`;
    }

    // Decisions
    if (analysis.decisions.length > 0) {
      md += `- 🎯 Decisions: ${analysis.decisions[0]}\n`;
    }

    // Context from vault
    const contextsWithProfiles = analysis.context.filter(c => c.hasProfile);
    if (contextsWithProfiles.length > 0) {
      md += `- 💡 Context: See [[${path.basename(contextsWithProfiles[0].profileLink, '.md')}]]`;
      if (contextsWithProfiles.length > 1) {
        md += `, [[${path.basename(contextsWithProfiles[1].profileLink, '.md')}]]`;
      }
      md += `\n`;
    }

    md += `\n`;
  }

  // Pre-day checklist
  md += `### ✅ Pre-Day Checklist\n\n`;

  const allPrepNeeds = [...new Set(
    analyses
      .filter(a => !a.isFocusTime && !a.isTravel)
      .flatMap(a => a.prepNeeds)
  )];

  if (allPrepNeeds.length > 0) {
    allPrepNeeds.forEach(prep => {
      md += `- [ ] ${prep}\n`;
    });
  } else {
    md += `- [ ] Review meeting agendas\n`;
    md += `- [ ] Check email for urgent items\n`;
  }

  // Key decisions
  md += `\n### 🎲 Key Decisions Today\n\n`;

  const allDecisions = analyses
    .filter(a => !a.isFocusTime && !a.isTravel && a.decisions.length > 0)
    .map(a => `${a.title}: ${a.decisions[0]}`);

  if (allDecisions.length > 0) {
    allDecisions.forEach((decision, i) => {
      md += `${i + 1}. ${decision}\n`;
    });
  } else {
    md += `(No major decisions identified)\n`;
  }

  // People context
  const peopleWithContext = analyses
    .flatMap(a => a.context)
    .filter(c => c.hasProfile)
    .reduce((acc, c) => {
      if (!acc.find(p => p.name === c.name)) {
        acc.push(c);
      }
      return acc;
    }, []);

  if (peopleWithContext.length > 0) {
    md += `\n### 👥 People Context\n\n`;
    for (const person of peopleWithContext.slice(0, 5)) {
      md += `- **[[${path.basename(person.profileLink, '.md')}]]**: Meeting today\n`;
    }
  }

  // Focus time strategy
  if (focusBlocks > 0) {
    md += `\n### 🚀 Focus Time Strategy\n\n`;
    const focusAnalyses = analyses.filter(a => a.isFocusTime);

    for (const focus of focusAnalyses) {
      const startStr = focus.startTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const endStr = focus.endTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });

      md += `- **${startStr} - ${endStr}**: Deep work on priority tasks\n`;
    }

    md += `\n💡 Use focus blocks for tasks requiring concentration before/after meetings.\n`;
  }

  return md;
}

async function main() {
  const composio = new Composio();

  // Parse date argument (default to today)
  const dateArg = process.argv[2];
  const targetDate = dateArg ? new Date(dateArg) : new Date();
  const dateStr = targetDate.toISOString().split('T')[0];

  console.log(`🎯 Preparing day for ${dateStr}...\n`);

  // Fetch calendar events
  console.log('📅 Fetching Outlook calendar...');

  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const result = await composio.tools.execute('OUTLOOK_LIST_EVENTS', {
    userId: 'user-cerebro',
    arguments: {
      startDateTime: startOfDay.toISOString(),
      endDateTime: endOfDay.toISOString()
    },
    dangerouslySkipVersionCheck: true
  });

  if (!result.data?.value) {
    console.log('⚠️  Could not fetch calendar events');
    return;
  }

  const events = result.data.value;
  console.log(`✅ Found ${events.length} events\n`);

  // Analyze events
  console.log('🔍 Analyzing events and gathering context...');
  const analyses = [];

  for (const event of events) {
    const analysis = await analyzeEvent(event, events);
    analyses.push(analysis);
  }

  console.log(`✅ Analysis complete\n`);

  // Generate prep markdown
  const prepMarkdown = generatePrepMarkdown(targetDate, events, analyses);

  // Update daily note
  const dailyNotePath = path.join(process.cwd(), 'Daily', `${dateStr}.md`);

  let noteContent;
  try {
    noteContent = await fs.readFile(dailyNotePath, 'utf-8');
    console.log('✅ Found existing daily note');
  } catch (error) {
    // Create new daily note
    noteContent = `---
date: ${dateStr}
---

# ${dateStr}

## 📌 Claude's Reminders

## 📝 Your Notes

## ✅ Processed
`;
    console.log('✅ Creating new daily note');
  }

  // Remove existing prep section if present
  noteContent = noteContent.replace(/\n## 🎯 Daily Prep.*?(?=\n## |\n# |$)/s, '');

  // Insert prep section after frontmatter
  const frontmatterEnd = noteContent.indexOf('---', 3) + 3;
  noteContent =
    noteContent.slice(0, frontmatterEnd) +
    '\n' + prepMarkdown +
    noteContent.slice(frontmatterEnd);

  // Write updated note
  await fs.mkdir(path.dirname(dailyNotePath), { recursive: true });
  await fs.writeFile(dailyNotePath, noteContent);

  console.log(`\n🎉 Daily prep complete!`);
  console.log(`📝 Updated: ${dailyNotePath}\n`);
  console.log(`📊 Summary:`);
  console.log(`   - ${analyses.filter(a => !a.isFocusTime && !a.isTravel).length} meetings to prep for`);
  console.log(`   - ${analyses.filter(a => a.prepNeeds.length > 0).length} items need preparation`);
  console.log(`   - ${analyses.filter(a => a.decisions.length > 0).length} decision points identified`);
  console.log(`   - ${analyses.filter(a => a.context.length > 0).length} meetings have vault context`);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
