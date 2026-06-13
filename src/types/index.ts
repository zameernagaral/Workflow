export interface ActionItem {
  task: string;
  assignee: string;
  dueDate: string;
  priority: 'High' | 'Medium' | 'Low';
}

export interface MeetingData {
  summary: string;
  decisions: string[];
  actionItems: ActionItem[];
  confidence: number;
}

export interface ProcessedMeeting {
  fileName: string;
  transcript?: string;
  meetingData: MeetingData;
  jiraTicketUrls: string[];
  notionPageUrl?: string;
}
