import dotenv from 'dotenv';
dotenv.config();
import { google } from 'googleapis';
import { getGoogleAuth } from './services/googleAuth';

async function probe() {
  try {
    const auth = await getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    console.log('Testing Google Drive access for folder ID:', folderId);
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, createdTime)',
    });
    console.log('Files in folder:', JSON.stringify(res.data.files, null, 2));
  } catch (error) {
    console.error('Error listing files from Drive:', error);
  }
}
probe();
