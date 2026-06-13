import { WebClient } from '@slack/web-api';
import { ProcessedMeeting } from '../types';
import { Logger } from './logger';
import dotenv from 'dotenv';
dotenv.config();

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const channelId = process.env.SLACK_CHANNEL_ID!;

async function postMessage(payload: { text: string; blocks?: any[] }): Promise<boolean> {
  try {
    await slack.chat.postMessage({
      channel: channelId,
      ...payload,
    });
    return true;
  } catch (err: any) {
    const code = err?.data?.error || err?.message || '';

    if (code === 'not_in_channel' || code.includes('not_in_channel')) {
      Logger.error(
        `Slack bot is not in channel ${channelId}. ` +
        `Fix: open that Slack channel and type  /invite @<your-bot-name>  then retry.`
      );
    } else if (code === 'channel_not_found') {
      Logger.error(
        `Slack channel ID "${channelId}" not found. ` +
        `Check SLACK_CHANNEL_ID in your .env file.`
      );
    } else if (code.includes('invalid_auth') || code.includes('token')) {
      Logger.error(
        `Slack token is invalid or expired. ` +
        `Check SLACK_BOT_TOKEN in your .env file.`
      );
    } else {
      Logger.error(`Failed to post to Slack: ${code}`);
    }
    return false;
  }
}

export async function postSummaryToSlack(meeting: ProcessedMeeting): Promise<void> {
  const actionItemLines = meeting.meetingData.actionItems
    .map(a => `• *${a.task}* — ${a.assignee} (${a.priority}, due ${a.dueDate})`)
    .join('\n');

  const jiraSection = meeting.jiraTicketUrls.length > 0
    ? meeting.jiraTicketUrls.map(u => `• <${u}|${u.split('/').pop()}>`).join('\n')
    : 'No tickets created';

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Meeting Summary: ${meeting.fileName}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Summary*\n${meeting.meetingData.summary}` },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Action Items*\n${actionItemLines || '_None extracted_'}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Jira Tickets*\n${jiraSection}\n\n*Notion Page*\n${meeting.notionPageUrl ? `<${meeting.notionPageUrl}|Open in Notion>` : 'N/A'}`,
      },
    },
  ];

  const ok = await postMessage({
    text: `Meeting processed: ${meeting.fileName} | Notion: ${meeting.notionPageUrl || 'N/A'}`,
    blocks,
  });
  if (ok) Logger.info(`Slack summary posted for ${meeting.fileName}`);
}

export async function requestHumanReview(fileName: string, confidence: number): Promise<void> {
  const ok = await postMessage({
    text: `⚠️ Low Confidence (${confidence}%) — Manual review needed for: ${fileName}`,
  });
  if (ok) Logger.info(`Requested human review in Slack for ${fileName}`);
}
