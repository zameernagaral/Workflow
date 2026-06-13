import { WebClient } from '@slack/web-api';
import { ProcessedMeeting } from '../types';
import { Logger } from './logger';
import dotenv from 'dotenv';
dotenv.config();

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const channelId = process.env.SLACK_CHANNEL_ID!;

export async function postSummaryToSlack(meeting: ProcessedMeeting): Promise<void> {
  try {
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Meeting Processed: ${meeting.fileName}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Summary:*\n${meeting.meetingData.summary}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Jira Tickets Created:* ${meeting.jiraTicketUrls.length}\n*Notion Page:* ${meeting.notionPageUrl || 'N/A'}`
        }
      }
    ];

    try {
      await slack.conversations.join({ channel: channelId });
    } catch (joinError: any) {
      Logger.warn(`Could not join channel (might already be in it or lacking permissions): ${joinError.message}`);
    }

    await slack.chat.postMessage({
      channel: channelId,
      text: `Meeting Processed: ${meeting.fileName}`,
      blocks
    });

    Logger.info(`Successfully posted Slack summary for ${meeting.fileName}`);
  } catch (error) {
    Logger.error('Failed to post message to Slack', error);
    // Don't throw, we don't want the workflow to fail entirely if just the notification fails.
  }
}

export async function requestHumanReview(fileName: string, confidence: number): Promise<void> {
  try {
    await slack.chat.postMessage({
      channel: channelId,
      text: `⚠️ *Low Confidence Detected* (${confidence}%)\nThe transcript for ${fileName} was ambiguous. Action item creation has been paused. Please review manually.`,
    });
    Logger.info(`Requested human review for ${fileName}`);
  } catch (error) {
    Logger.error('Failed to post review request to Slack', error);
  }
}
