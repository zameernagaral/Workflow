import { GoogleGenerativeAI } from '@google/generative-ai';
import { MeetingData } from '../types';
import { Logger } from './logger';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `
You are an expert meeting assistant. Extract the summary, decisions, action items, assignees, due dates, and priority levels from the transcript. 
Respond STRICTLY in JSON format matching this schema:
{
  "summary": "string",
  "decisions": ["string"],
  "actionItems": [
    {
      "task": "string",
      "assignee": "string",
      "dueDate": "YYYY-MM-DD or TBD",
      "priority": "High | Medium | Low"
    }
  ],
  "confidence": number // 0-100
}
Do NOT include markdown blockticks like \`\`\`json. Return only the raw JSON.
`;

export async function extractMeetingData(transcript: string): Promise<MeetingData> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nTranscript:\n${transcript}`);
    const response = result.response;
    const text = response.text().trim();
    
    // Attempt to parse JSON. Sometimes LLMs still add blockticks despite instructions.
    const cleanText = text.replace(/^```json/i, '').replace(/```$/, '').trim();
    const parsed: MeetingData = JSON.parse(cleanText);
    
    Logger.info('Successfully extracted meeting data using Gemini', { confidence: parsed.confidence });
    return parsed;
  } catch (error) {
    Logger.error('Failed to extract meeting data via Gemini API', error);
    throw error;
  }
}
