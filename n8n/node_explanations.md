# Node-by-Node Workflow Explanation

This document explains exactly what each node in the `n8n/workflow.json` does. This is crucial for demonstrating your understanding during an interview.

### 1. Google Drive Trigger
**Purpose**: Listens to a specific Google Drive folder (e.g., "Meeting Transcripts").
**How it works**: It polls the API every minute. When a new file is detected (event-driven), it instantly starts the workflow and passes the file metadata (File ID, Name) down the pipeline.

### 2. Download Transcript (Google Drive Node)
**Purpose**: The trigger only gets metadata. This node uses the File ID to download the actual file payload.
**How it works**: It executes a download operation and returns binary data.

### 3. Extract Text (Code Node)
**Purpose**: To convert the downloaded binary data into a UTF-8 string that the AI can read.
**How it works**: Uses a simple JavaScript buffer conversion: `Buffer.from(data, 'base64').toString('utf8')`.

### 4. Google Gemini
**Purpose**: Analyzes the raw text and extracts structured data.
**How it works**: We pass a strict JSON schema via the "System Message". It extracts summary, decisions, action items, dates, and **priority levels**. We set `responseMimeType: "application/json"` to enforce the format.

### 5. Parse JSON (Code Node)
**Purpose**: Converts the LLM string output into an actual JSON object.
**How it works**: `JSON.parse()` on the LLM output.

### 6. IF Confidence > 80
**Purpose**: Prevents AI hallucinations from taking automated actions.
**How it works**: Checks the `confidence` score. If True, it continues to Jira. If False, it routes to Slack for human review.

### 7. Split In Batches (Loop)
**Purpose**: Iterates over the `actionItems` array.
**How it works**: Without this, n8n would try to pass the entire array to Jira at once. This node processes one item at a time.

### 8. Jira
**Purpose**: Creates tickets.
**How it works**: Maps the JSON keys (`task`, `dueDate`, `priority`, `assignee`) to the Jira API fields.

### 9. Notion
**Purpose**: Creates the centralized documentation hub.
**How it works**: Uses the database ID to create a new page with the summary, decisions, and timestamp.

### 10. Slack (Final Summary)
**Purpose**: Team visibility.
**How it works**: Broadcasts the success message to the `#engineering` channel.

### 11. Audit Logger
**Purpose**: Compliance and observability.
**How it works**: An HTTP Request node that POSTs the execution metadata (timestamp, meeting name, success status) to an external logging server.
