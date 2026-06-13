import axios from 'axios';
import { ActionItem } from '../types';
import { Logger } from './logger';
import dotenv from 'dotenv';
dotenv.config();

const { JIRA_EMAIL, JIRA_API_TOKEN, JIRA_DOMAIN } = process.env;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

const jiraAuth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
const jiraClient = axios.create({
  baseURL: `https://${JIRA_DOMAIN}/rest/api/3`,
  headers: {
    'Authorization': `Basic ${jiraAuth}`,
    'Content-Type': 'application/json',
  }
});

export async function createJiraTickets(actionItems: ActionItem[]): Promise<string[]> {
  const ticketUrls: string[] = [];

  for (const item of actionItems) {
    try {
      const payload = {
        fields: {
          project: {
            key: JIRA_PROJECT_KEY
          },
          summary: item.task,
          description: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: `Assigned to: ${item.assignee}\nDue Date: ${item.dueDate}\nPriority: ${item.priority}` }
                ]
              }
            ]
          },
          issuetype: {
            name: "Task"
          }
        }
      };

      const response = await jiraClient.post('/issue', payload);
      const ticketKey = response.data.key;
      ticketUrls.push(`https://${JIRA_DOMAIN}/browse/${ticketKey}`);
      Logger.info(`Created Jira ticket ${ticketKey} for task: ${item.task}`);
      
    } catch (error: any) {
      Logger.error(`Failed to create Jira ticket for task: ${item.task}`, error.response?.data?.errorMessages || error.response?.data || error.message);
      // In a robust system we would retry here or push to a dead-letter queue.
    }
  }

  return ticketUrls;
}
