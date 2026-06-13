# End-to-End Project Explanation

This document explains the AI Meeting Workflow Automation project from end-to-end. It details exactly what happens at every stage, why it happens, and the inputs/outputs of each stage.

---

## 1. Google Meet Trigger Stage

### What happens
The application runs a background polling loop or webhook listener that constantly checks for ended Google Meet conferences. When a meeting ends, it retrieves the unique identifier for that meeting space.
### Why it happens
This is the entry point of the entire automation pipeline. Without a trigger, the application wouldn't know when to start processing. We use Google APIs to capture this event natively rather than relying on manual human intervention.
### Input
* Google Workspace webhook payloads or Google Meet REST API responses indicating a meeting's end time.
### Output
* A `conferenceRecordName` (e.g., `conferenceRecords/space-id`).

---

## 2. Transcript Retrieval Stage

### What happens
Using the `conferenceRecordName`, the application calls the Google Meet API to retrieve native transcripts. If a native transcript is missing but a video recording exists, the application downloads the recording from Google Drive and runs a Speech-to-Text service to generate a transcript programmatically.
### Why it happens
To extract tasks and summaries, we need the text of what was spoken. Relying directly on Google's APIs ensures zero manual file uploading.
### Input
* `conferenceRecordName`
### Output
* Raw `transcriptText` (String)

---

## 3. Gemini AI Analysis Stage

### What happens
The raw transcript text is bundled into a prompt and sent to the Google Gemini 1.5 Pro AI model using a structured JSON schema. The model acts as an executive assistant, analyzing the text and structuring the data.
### Why it happens
Raw text is useless to automation systems like Jira. We need an intelligent agent to read the text, understand context, and reliably convert human conversation into machine-readable JSON data (Action Items, Decisions, Summary).
### Input
* Raw `transcriptText`
### Output
* A structured JSON object (`ProcessedMeeting`) containing:
  * `summary` (string)
  * `decisions` (array of strings)
  * `actionItems` (array of objects with `task`, `assignee`, `dueDate`, `priority`)
  * `confidence` (number)

---

## 4. Jira Automation Stage

### What happens
The application iterates over every `actionItem` extracted by Gemini. It formats a REST API request for Jira Cloud and automatically creates a new Issue/Task on the Jira board for each action item.
### Why it happens
To ensure no tasks are forgotten after a meeting. Automatically placing tasks into an engineering team's active sprint board immediately holds assignees accountable.
### Input
* Array of `actionItems`
### Output
* Array of created `jiraTicketUrls`

---

## 5. Notion Knowledge Base Stage

### What happens
The application connects to a Notion Database and creates a new child page. It takes the summary, the decisions, and the newly created Jira ticket URLs, and formats them into a beautiful, readable document using Notion blocks.
### Why it happens
While Jira tracks granular tasks, teams need a searchable, centralized hub for meeting notes and decisions. Automating Notion updates guarantees that institutional knowledge is documented perfectly every single time.
### Input
* `meetingData` (Summary, Decisions) + `jiraTicketUrls`
### Output
* A `notionPageUrl` where the documentation lives.

---

## 6. Slack Notification Stage

### What happens
Finally, the application takes all the collected data (the summary text, the number of Jira tickets created, and the Notion URL) and sends a formatted message using "Slack Blocks" to a designated team channel.
### Why it happens
To provide transparency. Teams need to know the meeting processing finished successfully and they need quick access links to the Notion page and Jira board.
### Input
* The completely processed `ProcessedMeeting` object containing all URLs.
### Output
* A Slack chat message. (End of workflow).
