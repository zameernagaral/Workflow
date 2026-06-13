import { chromium, BrowserContext, Page } from 'playwright';
import { Logger } from './logger';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.join(__dirname, '../../meet-bot-profile');

interface CaptionEntry {
  speaker: string;
  text: string;
  ts: number;
}

export async function runMeetingCaptionBot(
  meetingUrl: string,
  maxDurationMs: number = 4 * 60 * 60 * 1000
): Promise<string> {
  Logger.info(`Meeting Caption Bot starting for: ${meetingUrl}`);

  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  let context: BrowserContext | null = null;
  const captionEntries: CaptionEntry[] = [];
  let lastKey = '';

  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      args: [
        '--use-fake-ui-for-media-stream',       // auto-approve mic/camera prompts
        '--use-fake-device-for-media-stream',   // provide a fake audio device
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-infobars',
      ],
    });

    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    // Navigate to the meeting
    await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Handle "Join as guest" if name input appears
    const nameInput = await page.waitForSelector(
      'input[placeholder="Your name"], input[aria-label*="name"], input[aria-label*="Name"]',
      { timeout: 12000 }
    ).catch(() => null);

    if (nameInput) {
      await nameInput.fill('Transcript Bot');
      Logger.info('Joining meeting as guest...');
      // Click "Ask to join" or "Join now"
      const joinBtn = page.getByRole('button', { name: /ask to join|join now|join meeting/i });
      await joinBtn.click({ timeout: 5000 }).catch(() => {});
    } else {
      Logger.info('Already logged in — joining meeting directly...');
      const joinBtn = page.getByRole('button', { name: /join now|join meeting|start meeting/i });
      await joinBtn.click({ timeout: 5000 }).catch(() => {});
    }

    // Wait to be admitted (Leave call button appears when inside)
    Logger.info('Waiting to be admitted into the meeting (host must click Admit)...');
    await page.waitForSelector(
      '[aria-label*="Leave call"], [data-tooltip*="Leave"], [aria-label*="leave"], button[jsname="CQylAd"]',
      { timeout: 300000 } // 5 minutes for host to admit
    );
    Logger.info('Admitted into meeting! Enabling captions...');

    // Enable captions: try keyboard shortcut first, then button click
    await page.keyboard.press('c');
    await page.waitForTimeout(1500);

    // Also try clicking the captions button if shortcut did not work
    const captionBtn = page.getByRole('button', { name: /turn on captions|captions/i });
    await captionBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Inject a MutationObserver to capture caption DOM changes
    await page.exposeFunction('__captionUpdate', (speaker: string, text: string, ts: number) => {
      const key = `${speaker}||${text}`;
      if (key !== lastKey && text.trim().length > 0) {
        captionEntries.push({ speaker, text: text.trim(), ts });
        lastKey = key;
        Logger.info(`[Caption] ${speaker}: ${text.trim()}`);
      }
    });

    await page.evaluate(() => {
      // Multiple selectors to handle Google Meet DOM variants
      const CAPTION_SELECTORS = [
        '[jsname="tgaKEf"]',
        '[class*="caption-window"]',
        '[class*="iOzk7"]',
        '[aria-live="polite"]',
        '[aria-live="assertive"]',
      ];

      const findCaptionContainer = (): Element | null => {
        for (const sel of CAPTION_SELECTORS) {
          const el = document.querySelector(sel);
          if (el && el.textContent && el.textContent.trim().length > 0) return el;
        }
        return null;
      };

      const extractCaption = (container: Element): { speaker: string; text: string } => {
        // Try to find speaker name element
        const speakerEl =
          container.querySelector('[class*="name"], [class*="speaker"], [jsname*="name"], [jsname="r8qRAd"]') ||
          container.querySelector('span:first-child');

        const allText = container.textContent?.trim() || '';
        const speakerText = speakerEl?.textContent?.trim() || '';
        const bodyText = speakerText && allText.startsWith(speakerText)
          ? allText.slice(speakerText.length).trim()
          : allText;

        return {
          speaker: speakerText || 'Participant',
          text: bodyText || allText,
        };
      };

      const observer = new MutationObserver(() => {
        const container = findCaptionContainer();
        if (!container) return;
        const { speaker, text } = extractCaption(container);
        if (text) {
          (window as any).__captionUpdate(speaker, text, Date.now());
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    // Wait until the meeting ends (leave button disappears or page navigates away)
    Logger.info('Capturing captions until meeting ends...');
    const endCondition = page.waitForFunction(
      () => !document.querySelector('[aria-label*="Leave call"], [data-tooltip*="Leave call"], [aria-label*="leave call"]'),
      { timeout: maxDurationMs }
    );

    const urlChange = page.waitForURL(url => !url.href.includes('/meet.google.com/'), { timeout: maxDurationMs })
      .catch(() => {});

    await Promise.race([endCondition, urlChange]).catch(() => {
      Logger.info('Bot timeout reached or meeting ended by URL change.');
    });

  } catch (err: any) {
    Logger.error('Caption bot encountered an error', err?.message || err);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }

  const transcript = compileCaptions(captionEntries);
  Logger.info(`Meeting ended. Captured ${captionEntries.length} caption entries (${transcript.length} chars).`);
  return transcript;
}

function compileCaptions(entries: CaptionEntry[]): string {
  if (entries.length === 0) return '';

  const lines: { speaker: string; text: string }[] = [];
  let prev = entries[0];

  for (let i = 1; i < entries.length; i++) {
    const curr = entries[i];
    // Google Meet captions update incrementally for the same utterance.
    // If same speaker within 4 seconds, the newer text supersedes the older.
    if (curr.speaker === prev.speaker && curr.ts - prev.ts < 4000) {
      prev = curr;
    } else {
      lines.push({ speaker: prev.speaker, text: prev.text });
      prev = curr;
    }
  }
  lines.push({ speaker: prev.speaker, text: prev.text });

  return lines.map(l => `${l.speaker}: ${l.text}`).join('\n');
}
