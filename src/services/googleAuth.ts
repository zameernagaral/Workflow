import { google } from 'googleapis';

let cachedAuth: any = null;

export async function getGoogleAuth() {
  if (cachedAuth) {
    return cachedAuth;
  }
  const auth = new google.auth.GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/meetings.space.readonly',
      'https://www.googleapis.com/auth/meetings.space.created'
    ],
    clientOptions: process.env.GOOGLE_IMPERSONATED_USER ? {
      subject: process.env.GOOGLE_IMPERSONATED_USER
    } : undefined
  });
  google.options({ auth });
  cachedAuth = auth;
  return auth;
}
