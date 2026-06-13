import { google } from 'googleapis';
import { getGoogleAuth } from './googleAuth';
import { Logger } from './logger';

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const auth = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data as ArrayBuffer);
  } catch (error) {
    Logger.error(`Error downloading file ${fileId} from Google Drive`, error);
    throw error;
  }
}

export async function downloadTranscript(fileId: string): Promise<string> {
  const auth = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    );
    return res.data as string;
  } catch (error) {
    Logger.error(`Error downloading transcript file ${fileId} from Google Drive`, error);
    throw error;
  }
}

export async function listDriveFiles(folderId: string): Promise<any[]> {
  const auth = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, createdTime)',
    });
    return res.data.files || [];
  } catch (error) {
    Logger.error(`Error listing files from folder ${folderId}`, error);
    throw error;
  }
}

