import { chromium, BrowserContext } from 'playwright';
import { Logger } from './logger';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.join(__dirname, '../../meet-bot-profile');

interface BotStatus {
  status: 'idle' | 'joining' | 'capturing' | 'completed' | 'failed';
  meetingUrl?: string;
  meetingName?: string;
  capturedEntriesCount: number;
  message?: string;
  notionPageUrl?: string;
  jiraTicketCount?: number;
  slackPosted?: boolean;
  error?: string;
}

export async function runMeetingCaptionBot(
  meetingUrl: string,
  onStatusUpdate?: (status: Partial<BotStatus>) => void,
  maxDurationMs: number = 4 * 60 * 60 * 1000
): Promise<string> {
  Logger.info(`Meeting Caption Bot starting for: ${meetingUrl}`);
  onStatusUpdate?.({
    status: 'joining',
    meetingUrl,
    capturedEntriesCount: 0,
    message: 'Bot is opening Chrome and navigating to meeting...'
  });

  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  let context: BrowserContext | null = null;
  // Node-side memory of caption rows by their custom ID
  const rowMap = new Map<number, { speaker: string; text: string }>();

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
      onStatusUpdate?.({
        message: "Joining as guest 'Transcript Bot' (waiting to be admitted)..."
      });
      // Click "Ask to join" or "Join now"
      const joinBtn = page.getByRole('button', { name: /ask to join|join now|join meeting/i });
      await joinBtn.click({ timeout: 5000 }).catch(() => {});
    } else {
      Logger.info('Already logged in — joining meeting directly...');
      onStatusUpdate?.({
        message: 'Joining meeting directly...'
      });
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
    onStatusUpdate?.({
      status: 'capturing',
      message: 'Admitted! Enabling captions...'
    });

    // Enable captions: focus body first, try keyboard shortcut 'c'
    await page.locator('body').focus().catch(() => {});
    await page.keyboard.press('c');
    await page.waitForTimeout(2000);

    // Also try clicking the captions button if "Turn on captions" is visible
    const turnOnBtn = page.getByRole('button', { name: /turn on captions/i });
    if (await turnOnBtn.count() > 0) {
      await turnOnBtn.click({ timeout: 2000 }).catch(() => {});
      Logger.info('Clicked "Turn on captions" button.');
      await page.waitForTimeout(1000);
    }

    // Expose Node function to page context
    await page.exposeFunction('__captionUpdate', (rowId: number, speaker: string, text: string, ts: number) => {
      rowMap.set(rowId, { speaker, text });
      onStatusUpdate?.({
        capturedEntriesCount: rowMap.size,
        message: `Active caption count: ${rowMap.size}`
      });
      Logger.info(`[Caption #${rowId}] ${speaker}: ${text}`);
    });

    // Inject caption scraping loop & MutationObserver
    await page.evaluate(() => {
      function textOf(el: Element | null): string {
        return (el && el.textContent ? el.textContent : '').trim();
      }

      function looksLikeIconLigature(text: string): boolean {
        if (!text) return true;
        const t = text.trim();
        if (!t) return true;
        if (/^[a-z0-9_]+$/.test(t) && t.length < 40) return true;
        return false;
      }

      function looksLikeCaptionLine(text: string): boolean {
        if (!text) return false;
        const t = text.trim();
        if (t.length < 3) return false;
        if (looksLikeIconLigature(t)) return false;
        if (t.length < 20 && !/\s/.test(t)) return false;
        if (/^([a-z]+)([A-Z][a-z]*)$/.test(t)) {
          const m = /^([a-z]+)([A-Z][a-z]*)$/.exec(t);
          if (m && m[2].toLowerCase() === m[1]) return false;
        }
        if (/\b[a-z]+_[a-z]+\b/.test(t)) return false;
        if (/Your meeting is safe|Your meeting's ready|Copy link|Meeting details|Add people|Add others|Jump to bottom|Jump to most recent/i.test(t)) return false;
        if (/([a-z]{3,})\1/i.test(t)) return false;
        return true;
      }

      function rowSpeaker(row: Element): string {
        try {
          const img = row.querySelector('img[alt]');
          if (img) {
            const alt = (img.getAttribute('alt') || '').trim();
            if (alt && alt.length > 1 && !looksLikeIconLigature(alt) && !/^avatar$/i.test(alt)) {
              return alt;
            }
          }
          const self = row.querySelector('[data-self-name]');
          if (self) {
            const name = (self.getAttribute('data-self-name') || '').trim();
            if (name) return name;
          }
          const spans = row.querySelectorAll('span');
          for (let i = 0; i < spans.length; i++) {
            const t = (spans[i].textContent || '').replace(/\s+/g, ' ').trim();
            if (!t) continue;
            if (looksLikeIconLigature(t)) continue;
            if (t.length > 40) continue;
            return t;
          }
        } catch (_) {}
        return 'Unknown';
      }

      function rowText(row: Element): string {
        try {
          const full = (row.textContent || '').replace(/\s+/g, ' ').trim();
          if (!full) return '';
          const spans = row.querySelectorAll('span');
          let prefix = '';
          for (let i = 0; i < spans.length; i++) {
            const t = (spans[i].textContent || '').replace(/\s+/g, ' ').trim();
            if (t) {
              prefix = t;
              break;
            }
          }
          let stripped = full;
          if (prefix && full.toLowerCase().startsWith(prefix.toLowerCase())) {
            stripped = full.slice(prefix.length).trim();
          }
          stripped = stripped.replace(/\s*arrow_downward\s*Jump to bottom\s*$/i, '').trim();
          return stripped;
        } catch (_) {
          return textOf(row);
        }
      }

      function scoreCaptionRegion(el: Element): number {
        if (!el) return 0;
        try {
          const imgs = el.querySelectorAll('img[alt]');
          const selves = el.querySelectorAll('[data-self-name]');
          const spans = el.querySelectorAll('span');
          let plausible = 0;
          for (let i = 0; i < imgs.length; i++) {
            const alt = (imgs[i].getAttribute('alt') || '').trim();
            if (!alt || alt.length < 2) continue;
            if (looksLikeIconLigature(alt)) continue;
            if (/^avatar$/i.test(alt)) continue;
            plausible++;
          }
          for (let i = 0; i < selves.length; i++) {
            const name = (selves[i].getAttribute('data-self-name') || '').trim();
            if (name) plausible++;
          }
          if (plausible === 0) return 0;
          if (spans.length < 2) return 0;
          return plausible * 10 + spans.length;
        } catch (_) {
          return 0;
        }
      }

      function findCaptionRegion(): Element | null {
        try {
          const primary = document.querySelector('[jsname="tgaKEf"]');
          if (primary && scoreCaptionRegion(primary) > 0) {
            return primary;
          }
        } catch (_) {}

        try {
          const labelled = document.querySelectorAll('[role="region"][aria-label],[aria-label]');
          for (let i = 0; i < labelled.length; i++) {
            const lbl = (labelled[i].getAttribute('aria-label') || '').trim();
            if (/^(captions|sous-titres|untertitel|leyendas|字幕)$/i.test(lbl)) {
              return labelled[i];
            }
          }
        } catch (_) {}

        const candidates: Element[] = [];
        try {
          const labelled = document.querySelectorAll('[aria-label]');
          for (let i = 0; i < labelled.length; i++) {
            const label = labelled[i].getAttribute('aria-label') || '';
            if (/caption|sous-titre|untertitel|leyenda|字幕/i.test(label)) {
              candidates.push(labelled[i]);
            }
          }
          const live = document.querySelectorAll('[aria-live="polite"]');
          for (let i = 0; i < live.length; i++) {
            candidates.push(live[i]);
          }
        } catch (_) {}

        let best = null;
        let bestScore = 0;
        for (let i = 0; i < candidates.length; i++) {
          const s = scoreCaptionRegion(candidates[i]);
          if (s > bestScore) {
            bestScore = s;
            best = candidates[i];
          }
        }
        return best;
      }

      let nextId = 1;
      const seenElements = new Map<Element, number>();

      const processCaptions = () => {
        const region = findCaptionRegion();
        if (!region) return;
        const children = region.children;
        for (let i = 0; i < children.length; i++) {
          const row = children[i];
          const speaker = rowSpeaker(row);
          const text = rowText(row);
          if (!text) continue;
          if (!looksLikeCaptionLine(text)) continue;
          if (speaker === 'Unknown' && text.length < 12) continue;

          let id;
          if (seenElements.has(row)) {
            id = seenElements.get(row)!;
          } else {
            id = nextId++;
            seenElements.set(row, id);
          }
          (window as any).__captionUpdate(id, speaker, text, Date.now());
        }
      };

      // Set up MutationObserver to watch DOM updates
      const observer = new MutationObserver(() => {
        processCaptions();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });

      // Fallback interval check to prevent missing text updates
      setInterval(processCaptions, 500);
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
    onStatusUpdate?.({
      status: 'failed',
      error: err?.message || String(err)
    });
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }

  const transcript = compileCaptions(rowMap);
  Logger.info(`Meeting ended. Captured ${rowMap.size} caption entries (${transcript.length} chars).`);
  return transcript;
}

function compileCaptions(rowMap: Map<number, { speaker: string; text: string }>): string {
  if (rowMap.size === 0) return '';

  const sortedRows = Array.from(rowMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([_, row]) => row);

  const lines: { speaker: string; text: string }[] = [];
  let prev = sortedRows[0];

  for (let i = 1; i < sortedRows.length; i++) {
    const curr = sortedRows[i];
    if (curr.speaker === prev.speaker) {
      if (prev.text.endsWith(curr.text) || curr.text.startsWith(prev.text)) {
        prev = curr.text.length > prev.text.length ? curr : prev;
      } else {
        prev = { speaker: prev.speaker, text: `${prev.text} ${curr.text}` };
      }
    } else {
      lines.push(prev);
      prev = curr;
    }
  }
  lines.push(prev);

  return lines.map(l => `${l.speaker}: ${l.text}`).join('\n');
}

