import { Client } from '@notionhq/client';
import { ProcessedMeeting } from '../types';
import { Logger } from './logger';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID!;

// Notion blocks have a 2000-character limit for rich_text content
function textBlocks(text: string, heading?: string) {
  const blocks: any[] = [];
  if (heading) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: heading } }] },
    });
  }
  if (!text || !text.trim()) return blocks;

  const CHUNK = 2000;
  for (let i = 0; i < text.length; i += CHUNK) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: text.slice(i, i + CHUNK) } }] },
    });
  }
  return blocks;
}

export async function createNotionPage(meeting: ProcessedMeeting): Promise<string> {
  try {
    // Dynamically find the title property name (it varies per database)
    const db: any = await notion.databases.retrieve({ database_id: databaseId });
    let titlePropName = 'Name';
    for (const [name, prop] of Object.entries(db.properties || {})) {
      if ((prop as any).type === 'title') { titlePropName = name; break; }
    }

    const actionItemsText = meeting.meetingData.actionItems
      .map((item, i) =>
        `${i + 1}. ${item.task}\n   Assignee: ${item.assignee} | Due: ${item.dueDate} | Priority: ${item.priority}`
      )
      .join('\n\n');

    const jiraText = meeting.jiraTicketUrls.length > 0
      ? meeting.jiraTicketUrls.join('\n')
      : 'No Jira tickets created';

    const decisionsText = meeting.meetingData.decisions.join('\n• ');

    const properties: any = {};
    properties[titlePropName] = {
      title: [{ text: { content: meeting.fileName } }],
    };

    const children: any[] = [
      // Summary
      ...textBlocks(meeting.meetingData.summary, 'Meeting Summary'),
      // Decisions
      ...textBlocks(decisionsText ? `• ${decisionsText}` : 'None', 'Decisions'),
      // Action Items
      ...textBlocks(actionItemsText || 'No action items extracted.', 'Action Items'),
      // Jira Tickets
      ...textBlocks(jiraText, 'Jira Tickets'),
    ];

    // Full transcript (if captured)
    if (meeting.transcript && meeting.transcript.trim()) {
      children.push(...textBlocks(meeting.transcript, 'Full Transcript'));
    }

    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties,
      children,
    });

    const pageId = response.id.replace(/-/g, '');
    const url = `https://www.notion.so/${pageId}`;
    Logger.info(`Notion page created: ${url}`);
    return url;
  } catch (error: any) {
    Logger.error('Failed to create Notion page', error?.message || error);
    throw error;
  }
}
