# Code Walkthrough

This document breaks down the most important files in the project, explaining what they do line-by-line or concept-by-concept for a beginner.

## 1. `src/index.ts` (The Orchestrator)

**Purpose**: This is the brain of the application. It ties all the other services together.

**Key Concepts**:
* `processConferenceRecord()`: This is the main "Pipeline" function. Notice how it follows a strict sequence:
  1. Calls `getTranscriptText` (Meet Service)
  2. Calls `extractMeetingData` (Gemini Service)
  3. Calls `createJiraTickets` (Jira Service)
  4. Calls `createNotionPage` (Notion Service)
  5. Calls `postSummaryToSlack` (Slack Service)
* **Error Handling**: The whole pipeline is wrapped in a `try/catch` block. If Jira fails, the application logs the error but does not crash completely, allowing it to stay alive to process the next meeting.
* **Polling Loop & Webhook**: At the bottom of the file, we use `setInterval` to constantly ask Google Meet if a meeting just ended. We also set up an Express-like `http.createServer` to listen for instant Webhooks.

## 2. `src/services/gemini.ts` (The Brains)

**Purpose**: Talks to Google's Large Language Model (Gemini 1.5 Pro).

**Key Concepts**:
* `GoogleGenerativeAI`: We initialize the official Google SDK using our API key.
* `responseSchema`: This is a crucial concept called **Structured Outputs**. Instead of letting the AI write a free-form paragraph, we strictly define a JSON schema. We tell the AI: "You MUST return a JSON object with a `summary` string, a `confidence` number, and an `actionItems` array." This guarantees our code won't break when trying to read the AI's response.
* `model.generateContent()`: This is where the magic happens. We pass in our strict prompt and the raw transcript, and wait for the AI to do the thinking.

## 3. `src/services/jira.ts` (The Task Master)

**Purpose**: Interacts with the Jira REST API.

**Key Concepts**:
* `axios`: A popular library for making HTTP requests. We create an `axios.create` instance that is pre-configured with our Jira Domain and our Authorization headers.
* `Buffer.from(email:token).toString('base64')`: Jira uses Basic Authentication. We have to take our email and API token, combine them with a colon, and encode them in Base64 before sending them in the HTTP headers.
* `createJiraTickets()`: A loop runs over every action item. It constructs a "Payload" (a JSON object formatted exactly how Jira expects an Issue to be formatted), POSTs it to the `/rest/api/3/issue` endpoint, and saves the resulting Issue URL.

## 4. `src/services/notion.ts` (The Librarian)

**Purpose**: Formats and saves meeting notes into a Notion workspace.

**Key Concepts**:
* `@notionhq/client`: The official Notion SDK.
* `notion.pages.create`: We tell Notion to create a new page under a specific Database (`parent: { database_id }`).
* **Notion Blocks**: Notion doesn't just accept raw text; it uses "Blocks". In our `children` array, you'll see objects with types like `heading_2`, `paragraph`, and `bulleted_list_item`. This maps our raw text into beautiful UI elements inside the Notion application.
* **Dynamic Property Retrieval**: Instead of hardcoding properties, our code first queries the Notion database to find out what its default "Title" column is named, ensuring it never fails due to schema mismatches.

## 5. `src/types/index.ts` (The Blueprint)

**Purpose**: Defines TypeScript Interfaces.

**Key Concepts**:
* Interfaces (like `ActionItem` and `MeetingData`) act as blueprints. By defining these here, if a developer tries to type `actionItem.dudate` instead of `actionItem.dueDate` in `jira.ts`, the TypeScript compiler will immediately throw a red error before the code even runs. This is why TypeScript is so powerful for building robust automated workflows.
