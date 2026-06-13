import { Client } from '@notionhq/client';
import { ProcessedMeeting } from '../types';
import { Logger } from './logger';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID!;

export async function createNotionPage(meeting: ProcessedMeeting): Promise<string> {
  try {
    // Build action items text for the page body
    const actionItemsText = meeting.meetingData.actionItems
      .map((item, i) => `${i + 1}. ${item.task} — Assignee: ${item.assignee} | Due: ${item.dueDate} | Priority: ${item.priority}`)
      .join('\n');

    const jiraTicketsText = meeting.jiraTicketUrls.length > 0
      ? meeting.jiraTicketUrls.join('\n')
      : 'No Jira tickets created';

    // We will bypass properties altogether because we don't know the schema of the user's DB.
    // Instead we will rely on creating the page in the database and putting everything in the content.
    // However Notion requires at least the title property. We'll use the default title property which is 
    // usually named "Name" but if it differs we'll catch it or we'll just try to create a page with NO properties.
    // Let's create it as a child page of the database with just the title property.
    
    // Instead of properties, let's just make it a standalone page in the workspace if DB fails,
    // but the instruction says to use the database. We will try to fetch the DB first to find the title property name.
    const db: any = await notion.databases.retrieve({ database_id: databaseId });
    const existingProps = db.properties || {};
    let titlePropName = 'Name';
    for (const [name, prop] of Object.entries(existingProps)) {
      if ((prop as any).type === 'title') {
        titlePropName = name;
        break;
      }
    }

    const properties: any = {};
    properties[titlePropName] = {
      title: [
        { text: { content: meeting.fileName } }
      ]
    };

    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties,
      children: [
        {
          object: 'block' as const,
          type: 'heading_2' as const,
          heading_2: {
            rich_text: [{ type: 'text' as const, text: { content: '📋 Meeting Summary' } }]
          }
        },
        {
          object: 'block' as const,
          type: 'paragraph' as const,
          paragraph: {
            rich_text: [{ type: 'text' as const, text: { content: meeting.meetingData.summary } }]
          }
        },
        {
          object: 'block' as const,
          type: 'heading_2' as const,
          heading_2: {
            rich_text: [{ type: 'text' as const, text: { content: '✅ Decisions' } }]
          }
        },
        ...meeting.meetingData.decisions.map(d => ({
          object: 'block' as const,
          type: 'bulleted_list_item' as const,
          bulleted_list_item: {
            rich_text: [{ type: 'text' as const, text: { content: d } }]
          }
        })),
        {
          object: 'block' as const,
          type: 'heading_2' as const,
          heading_2: {
            rich_text: [{ type: 'text' as const, text: { content: '🎯 Action Items' } }]
          }
        },
        {
          object: 'block' as const,
          type: 'paragraph' as const,
          paragraph: {
            rich_text: [{ type: 'text' as const, text: { content: actionItemsText || 'No action items extracted.' } }]
          }
        },
        {
          object: 'block' as const,
          type: 'heading_2' as const,
          heading_2: {
            rich_text: [{ type: 'text' as const, text: { content: '🔗 Jira Tickets' } }]
          }
        },
        {
          object: 'block' as const,
          type: 'paragraph' as const,
          paragraph: {
            rich_text: [{ type: 'text' as const, text: { content: jiraTicketsText } }]
          }
        },
      ] as any,
    });

    const pageId = response.id.replace(/-/g, '');
    const url = `https://www.notion.so/${pageId}`;
    Logger.info(`Successfully created Notion page: ${url}`);
    return url;
  } catch (error: any) {
    Logger.error('Failed to create Notion page', error?.message || error);
    throw error;
  }
}
