import { chromium, BrowserContext } from 'playwright';
import { Logger } from './logger';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.join(__dirname, '../../meet-bot-profile');

/**
 * Creates a real Google Meet link for free by opening meet.google.com/new
 * in a browser (uses your existing Google login session from the profile).
 */
export async function createFreeMeetingLink(): Promise<string> {
  Logger.info('Opening Chrome to create a Google Meet link...');

  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      args: ['--no-first-run', '--no-default-browser-check'],
    });

    const page = await context.newPage();

    // meet.google.com/new redirects to a real meeting room
    await page.goto('https://meet.google.com/new');

    Logger.warn('If you see a sign-in page, please log into your Google account in the browser window.');
    Logger.warn('Waiting for you to log in and for the Google Meet link to be generated...');

    // Wait indefinitely for the URL to become a meeting room link
    await page.waitForURL(url => url.href.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/) !== null, {
      timeout: 0, 
    });

    const finalUrl = page.url();
    // Extract just the meeting URL (before any query params)
    const cleanUrl = finalUrl.split('?')[0];
    Logger.info(`Real Google Meet link created: ${cleanUrl}`);
    return cleanUrl;
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}
