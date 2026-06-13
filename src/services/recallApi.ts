import axios from 'axios';
import { Logger } from './logger';
import dotenv from 'dotenv';
dotenv.config();

const RECALL_API_KEY = process.env.RECALL_API_KEY || '';
const RECALL_REGION = process.env.RECALL_REGION || 'us-west-2';

const BASE_URL = `https://${RECALL_REGION}.recall.ai/api/v1`;

interface RecallBot {
  id: string;
  bot_name: string;
  meeting_url: string;
  status: 'ready' | 'joining' | 'in_call' | 'done' | 'fatal';
  status_changes: any[];
}

export interface BotStatus {
  status: 'idle' | 'joining' | 'capturing' | 'processing' | 'completed' | 'failed';
  meetingUrl?: string;
  meetingName?: string;
  capturedEntriesCount: number;
  message?: string;
  error?: string;
}

export async function sendBotToMeeting(meetingUrl: string): Promise<RecallBot> {
  if (!RECALL_API_KEY) {
    throw new Error('RECALL_API_KEY is not set in .env');
  }

  Logger.info(`Requesting Recall.ai bot for meeting: ${meetingUrl}`);

  try {
    const response = await axios.post(
      `${BASE_URL}/bot`,
      {
        meeting_url: meetingUrl,
        bot_name: 'Transcript Bot',
        recording_config: {
          transcript: {
            provider: {
              meeting_captions: {}
            }
          }
        }
      },
      {
        headers: {
          'Authorization': `Token ${RECALL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    Logger.info(`Recall.ai bot created: ${response.data.id}`);
    return response.data;
  } catch (err: any) {
    Logger.error('Recall API Create Bot Error:', err.response?.data || err.message);
    throw new Error(`Recall API Error: ${JSON.stringify(err.response?.data) || err.message}`);
  }
}

export async function pollBotStatus(
  botId: string,
  onStatusUpdate?: (status: Partial<BotStatus>) => void
): Promise<void> {
  Logger.info(`Polling Recall.ai bot status for bot ${botId}`);

  let isFinished = false;

  while (!isFinished) {
    const response = await axios.get(`${BASE_URL}/bot/${botId}/`, {
      headers: {
        'Authorization': `Token ${RECALL_API_KEY}`,
      }
    });

    const bot: RecallBot = response.data;

    let appStatus: BotStatus['status'] = 'joining';
    let message = 'Bot is starting...';

    // Get the latest status code from status_changes
    const latestStatus = bot.status_changes?.length 
      ? bot.status_changes[bot.status_changes.length - 1].code 
      : 'ready';

    if (latestStatus === 'joining_call' || latestStatus === 'in_waiting_room') {
      message = 'Bot is joining the meeting... (Waiting to be admitted)';
    } else if (latestStatus === 'in_call_not_recording' || latestStatus === 'in_call_recording') {
      appStatus = 'capturing';
      message = 'Bot is in the call and capturing audio...';
    } else if (latestStatus === 'done' || latestStatus === 'call_ended' || latestStatus === 'recording_done') {
      appStatus = 'processing';
      message = 'Meeting finished. Processing transcript...';
      
      // Only finish polling when the final 'done' status is reached, meaning transcript is fully ready
      if (latestStatus === 'done') {
        isFinished = true;
      }
    } else if (latestStatus === 'fatal') {
      appStatus = 'failed';
      message = 'Bot encountered a fatal error (e.g. kicked from meeting).';
      isFinished = true;
    }

    onStatusUpdate?.({
      status: appStatus,
      message
    });

    if (!isFinished) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
    }
  }
}

export async function getTranscript(botId: string): Promise<string> {
  Logger.info(`Fetching transcript for bot ${botId}`);

  try {
    // 1. Fetch the bot details
    const botResponse = await axios.get(`${BASE_URL}/bot/${botId}/`, {
      headers: {
        'Authorization': `Token ${RECALL_API_KEY}`,
      }
    });

    const bot = botResponse.data;
    const downloadUrl = bot.recordings?.[0]?.media_shortcuts?.transcript?.data?.download_url;

    if (!downloadUrl) {
      Logger.warn(`No transcript download URL found for bot ${botId}. It might still be processing or was not recorded.`);
      return '';
    }

    // 2. Download the actual transcript JSON from the signed URL
    const transcriptRes = await axios.get(downloadUrl);
    const transcriptData = transcriptRes.data;

    // Recall.ai returns an array of segments in their standard transcript format
    if (!transcriptData || !Array.isArray(transcriptData)) {
      return '';
    }

    const lines = transcriptData.map((segment: any) => {
      const speaker = segment.speaker || 'Unknown';
      // Some providers put text in segment.text, others in segment.words[].text
      const text = segment.text || (segment.words ? segment.words.map((w: any) => w.text).join(' ') : '');
      return `${speaker}: ${text}`;
    });

    return lines.join('\n');
  } catch (err: any) {
    Logger.error('Recall API Fetch Transcript Error:', err.response?.data || err.message);
    throw err;
  }
}
