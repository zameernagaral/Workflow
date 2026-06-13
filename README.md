# Meeting Automation System (Node.js)

A fully automated, production-ready, event-driven meeting automation engine.

## Overview
This application natively polls a Google Drive folder for new meeting transcripts. Once a transcript is detected, it:
1. Downloads the text.
2. Sends the transcript to the **Gemini API** for structured JSON extraction (Summary, Action Items, Priorities, Due Dates).
3. Evaluates a self-reported confidence score.
4. Auto-creates **Jira** tasks for each action item.
5. Auto-creates a **Notion** page with the summary, decisions, and Jira links.
6. Auto-posts a formatted summary to **Slack**.
7. Logs all executions to `workflow.log`.

## Tech Stack
- **Node.js / TypeScript**
- **Google Drive API** (googleapis)
- **Google Gemini API** (@google/generative-ai)
- **Jira REST API** (axios)
- **Notion SDK** (@notionhq/client)
- **Slack Web API** (@slack/web-api)

*Note: For the n8n alternative implementation, see the `n8n/` folder for the workflow JSON.*

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   Copy the example config and fill in your API keys:
   ```bash
   cp .env.example .env
   ```

3. **Google Service Account**:
   Ensure you place your `google-credentials.json` (Service Account Key) in the root directory and share the target Google Drive Folder with the Service Account email.

4. **Run the Application**:
   ```bash
   npm start
   ```
   The engine will initialize and begin polling Google Drive every 60 seconds (configurable via `.env`).
