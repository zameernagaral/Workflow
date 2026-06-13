import { google } from 'googleapis';
import { getGoogleAuth } from './googleAuth';
import { createFreeMeetingLink } from './meetingCreator';
import { Logger } from './logger';

export async function createMeetingSpace(): Promise<{ spaceName: string; meetingUri: string }> {
  // Try the official Google Meet API first (works if you have Google Workspace)
  try {
    const auth = await getGoogleAuth();
    const meet = google.meet({ version: 'v2', auth });
    const response = await meet.spaces.create({
      requestBody: { config: { accessType: 'OPEN' } },
    });
    const uri = response.data.meetingUri || '';
    Logger.info(`Created Google Meet space via API: ${uri}`);
    return {
      spaceName: response.data.name || '',
      meetingUri: uri,
    };
  } catch (apiError: any) {
    const msg = (apiError?.message || '').toLowerCase();
    const isWorkspaceError =
      msg.includes('has not been used') ||
      msg.includes('disabled') ||
      msg.includes('permission') ||
      msg.includes('403') ||
      msg.includes('not found');

    if (isWorkspaceError) {
      Logger.info('Google Meet API not available (no Workspace required). Using free browser method...');
      // Fall back to creating a real meet link via browser (free, works with any Google account)
      const meetingUri = await createFreeMeetingLink();
      return { spaceName: '', meetingUri };
    }

    Logger.error('Unexpected error creating meeting space', apiError);
    throw apiError;
  }
}

export async function listConferenceRecords() {
  try {
    const auth = await getGoogleAuth();
    const meet = google.meet({ version: 'v2', auth });
    const response = await meet.conferenceRecords.list({ pageSize: 20 });
    return response.data.conferenceRecords || [];
  } catch (error: any) {
    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('disabled') || msg.includes('403') || msg.includes('permission') || msg.includes('not found')) {
      // Meet API not available — Drive polling handles transcript collection instead
      return [];
    }
    Logger.error('Error listing conference records', error);
    return [];
  }
}

export async function getTranscriptText(conferenceRecordName: string): Promise<string | null> {
  try {
    const auth = await getGoogleAuth();
    const meet = google.meet({ version: 'v2', auth });

    const transcriptsRes = await meet.conferenceRecords.transcripts.list({
      parent: conferenceRecordName,
    });
    const transcripts = transcriptsRes.data.transcripts || [];
    if (transcripts.length === 0) return null;

    let fullText = '';
    for (const transcript of transcripts) {
      if (!transcript.name) continue;
      let nextPageToken: string | undefined;
      do {
        const entriesRes: any = await meet.conferenceRecords.transcripts.entries.list({
          parent: transcript.name,
          pageSize: 100,
          pageToken: nextPageToken,
        });
        const entries = entriesRes.data.transcriptEntries || [];
        for (const entry of entries) {
          const speaker = entry.author || 'Speaker';
          fullText += `${speaker}: ${entry.text || ''}\n`;
        }
        nextPageToken = (entriesRes.data.nextPageToken as string) || undefined;
      } while (nextPageToken);
    }

    return fullText.trim() || null;
  } catch (error) {
    Logger.error(`Error getting transcript for ${conferenceRecordName}`, error);
    return null;
  }
}

export async function getMeetingRecordingFileId(conferenceRecordName: string): Promise<string | null> {
  try {
    const auth = await getGoogleAuth();
    const meet = google.meet({ version: 'v2', auth });
    const recordingsRes = await meet.conferenceRecords.recordings.list({
      parent: conferenceRecordName,
    });
    const recordings = recordingsRes.data.recordings || [];
    return recordings[0]?.driveDestination?.file || null;
  } catch (error) {
    Logger.error(`Error getting recording for ${conferenceRecordName}`, error);
    return null;
  }
}
