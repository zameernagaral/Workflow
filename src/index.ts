import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getGoogleAuth } from './services/googleAuth';
import { listDriveFiles, downloadDriveFile, downloadTranscript } from './services/drive';
import { transcribeAudio } from './services/speechToText';
import { extractMeetingData } from './services/gemini';
import { createJiraTickets } from './services/jira';
import { createNotionPage } from './services/notion';
import { postSummaryToSlack, requestHumanReview } from './services/slack';
import { runMeetingCaptionBot } from './services/meetCaptionBot';
import { Logger } from './services/logger';
import { ProcessedMeeting } from './types';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
const CONFIDENCE_THRESHOLD = parseInt(process.env.CONFIDENCE_THRESHOLD || '80', 10);
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

const PROCESSED_FILES_PATH = path.join(__dirname, '../processed_files.json');

function loadProcessedFiles(): Set<string> {
  try {
    if (fs.existsSync(PROCESSED_FILES_PATH)) {
      const data = fs.readFileSync(PROCESSED_FILES_PATH, 'utf-8');
      return new Set(JSON.parse(data));
    }
  } catch (err) {
    Logger.error('Failed to load processed_files.json', err);
  }
  return new Set();
}

function saveProcessedFile(fileId: string, processedSet: Set<string>) {
  processedSet.add(fileId);
  try {
    fs.writeFileSync(PROCESSED_FILES_PATH, JSON.stringify(Array.from(processedSet), null, 2));
  } catch (err) {
    Logger.error('Failed to write processed_files.json', err);
  }
}

const processedFilesCache = loadProcessedFiles();

/**
 * Core pipeline: transcript text → Gemini analysis → Jira + Notion + Slack
 */
export async function processMeetingTranscript(transcriptText: string, meetingName: string) {
  Logger.info(`Processing transcript for: ${meetingName}`);

  if (!transcriptText || transcriptText.trim().length === 0) {
    Logger.warn(`Empty transcript for ${meetingName}. Skipping.`);
    return;
  }

  const meetingData = await extractMeetingData(transcriptText);

  if (meetingData.confidence < CONFIDENCE_THRESHOLD) {
    Logger.warn(`Low confidence (${meetingData.confidence}%). Routing to manual review.`);
    await requestHumanReview(meetingName, meetingData.confidence);
    return;
  }

  const jiraTicketUrls = await createJiraTickets(meetingData.actionItems);

  const processedMeeting: ProcessedMeeting = {
    fileName: meetingName,
    meetingData,
    jiraTicketUrls,
  };

  const notionUrl = await createNotionPage(processedMeeting);
  processedMeeting.notionPageUrl = notionUrl;

  await postSummaryToSlack(processedMeeting);

  Logger.info(`Pipeline complete for: ${meetingName}`);
  Logger.info(`  Notion: ${notionUrl}`);
  Logger.info(`  Jira tickets: ${jiraTicketUrls.length}`);
}

/**
 * Drive file handler: supports audio/video (Gemini STT) and text transcript files.
 */
async function processDriveFile(file: { id: string; name: string; mimeType: string }) {
  if (processedFilesCache.has(file.id)) return;

  Logger.info(`Processing Drive file: ${file.name} (${file.id})`);

  try {
    let transcriptText: string | null = null;

    if (
      file.mimeType.startsWith('text/') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.md')
    ) {
      transcriptText = await downloadTranscript(file.id);
    } else if (
      file.mimeType.startsWith('audio/') ||
      file.mimeType.startsWith('video/') ||
      file.name.match(/\.(mp3|wav|m4a|mp4|ogg|webm)$/)
    ) {
      const audioBuffer = await downloadDriveFile(file.id);
      let mimeType = file.mimeType;
      if (mimeType === 'application/octet-stream') {
        if (file.name.endsWith('.mp3')) mimeType = 'audio/mp3';
        else if (file.name.endsWith('.wav')) mimeType = 'audio/wav';
        else if (file.name.endsWith('.m4a')) mimeType = 'audio/x-m4a';
        else mimeType = 'audio/mp3';
      }
      transcriptText = await transcribeAudio(audioBuffer, mimeType);
    } else {
      Logger.warn(`Unsupported file type: ${file.mimeType} (${file.name}). Skipping.`);
      return;
    }

    if (transcriptText) {
      await processMeetingTranscript(transcriptText, file.name);
      saveProcessedFile(file.id, processedFilesCache);
    }
  } catch (error) {
    Logger.error(`Workflow failed for Drive file: ${file.name}`, error);
  }
}

async function startDrivePoller() {
  if (!FOLDER_ID) {
    Logger.warn('GOOGLE_DRIVE_FOLDER_ID not set — Drive polling disabled.');
    return;
  }

  Logger.info('Starting Google Drive polling...');

  try {
    await getGoogleAuth();
    Logger.info('Google Auth OK.');
  } catch (error) {
    Logger.error('Google Auth failed — Drive polling will not start.', error);
    return;
  }

  setInterval(async () => {
    try {
      const files = await listDriveFiles(FOLDER_ID);
      for (const file of files) {
        if (file.id && !processedFilesCache.has(file.id)) {
          await processDriveFile(file);
        }
      }
    } catch (err) {
      Logger.error('Drive polling cycle failed', err);
    }
  }, POLL_INTERVAL);
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url || '', true);

    // Health check
    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        monitoredFolderId: FOLDER_ID || 'not set',
        processedFilesCount: processedFilesCache.size,
      }));
      return;
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /join-meeting
    // Body: { "url": "https://meet.google.com/xxx-xxxx-xxx" }
    //
    // Launches the caption bot to join the meeting.
    // The bot will run until the meeting ends, then automatically
    // push the transcript to Notion, Slack, and Jira.
    // ─────────────────────────────────────────────────────────────────────
    if (req.method === 'POST' && parsedUrl.pathname === '/join-meeting') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { url: meetingUrl, name } = JSON.parse(body);

          if (!meetingUrl || !meetingUrl.includes('meet.google.com')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Provide a valid Google Meet URL in the "url" field.' }));
            return;
          }

          const meetingName = name || `Meeting-${new Date().toISOString().slice(0, 19).replace('T', '_')}`;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'started',
            message: `Bot is joining ${meetingUrl}. Admit "Transcript Bot" from the waiting room. Notion, Slack, and Jira will update when the meeting ends.`,
            meetingName,
          }));

          // Run asynchronously — do not block the HTTP response
          setImmediate(async () => {
            try {
              const transcript = await runMeetingCaptionBot(meetingUrl);
              if (transcript && transcript.trim().length > 0) {
                await processMeetingTranscript(transcript, meetingName);
              } else {
                Logger.warn(`No captions captured for ${meetingName}. Ensure captions were enabled during the meeting.`);
              }
            } catch (err) {
              Logger.error(`Meeting bot pipeline failed for ${meetingName}`, err);
            }
          });
        } catch (parseErr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
        }
      });
      return;
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /process-transcript
    // Body: { "transcript": "...", "name": "optional meeting name" }
    //
    // Manually submit a transcript (paste text directly).
    // Useful if you already have the transcript from another source.
    // ─────────────────────────────────────────────────────────────────────
    if (req.method === 'POST' && parsedUrl.pathname === '/process-transcript') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { transcript, name } = JSON.parse(body);
          const meetingName = name || `Meeting-${new Date().toISOString().slice(0, 19).replace('T', '_')}`;

          if (!transcript || !transcript.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '"transcript" field is required.' }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'processing', meetingName }));

          setImmediate(async () => {
            await processMeetingTranscript(transcript, meetingName).catch(err =>
              Logger.error('Manual transcript processing failed', err)
            );
          });
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found' }));
  });

  server.listen(PORT, () => {
    Logger.info(`Server running on http://localhost:${PORT}`);
    Logger.info('');
    Logger.info('Available endpoints:');
    Logger.info(`  GET  /health                — health check`);
    Logger.info(`  POST /join-meeting          — { "url": "https://meet.google.com/xxx-xxxx-xxx" }`);
    Logger.info(`  POST /process-transcript    — { "transcript": "raw text...", "name": "optional" }`);
  });
}

startServer();
startDrivePoller();
