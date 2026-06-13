import { createMeetingSpace } from './services/meet';
import { Logger } from './services/logger';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  Logger.info('Creating a Google Meet link...');
  try {
    const { meetingUri } = await createMeetingSpace();

    console.log('\n==================================================');
    console.log('GOOGLE MEET LINK READY');
    console.log(`Meeting Link: ${meetingUri}`);
    console.log('==================================================');
    console.log('');
    console.log('Share this link with your participants.');
    console.log('');
    console.log('When the meeting is ready to start, run:');
    console.log('');
    console.log(`  curl -X POST http://localhost:3000/join-meeting \\`);
    console.log(`       -H "Content-Type: application/json" \\`);
    console.log(`       -d '{"url":"${meetingUri}","name":"My Meeting"}'`);
    console.log('');
    console.log('The bot will join, capture captions, and post the');
    console.log('summary to Notion, Slack, and Jira when the meeting ends.');
    console.log('==================================================\n');
  } catch (error) {
    Logger.error('Failed to create meeting link', error);
    process.exit(1);
  }
}

main();
