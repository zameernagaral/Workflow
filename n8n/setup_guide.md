# n8n Setup & Import Guide

Follow these steps to import the workflow into your own n8n instance and configure the required credentials.

## 1. Running n8n

As a first-year CS student, the easiest way to run n8n on your computer is using Node.js (via `npx`).

1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Open your terminal and run:
   ```bash
   npx n8n
   ```
3. Open your browser and navigate to `http://localhost:5678`.
4. Follow the prompt to create an owner account.

## 2. Importing the Workflow

1. Download the `workflow.json` file from this folder.
2. In n8n, click the **Workflows** tab on the left menu.
3. Click **Add Workflow**.
4. In the top right corner of the canvas, click the menu button (three dots `...`) and select **Import from File**.
5. Select `workflow.json`. You should now see the visual graph of the automation.

## 3. Configuring Credentials

When you import the workflow, the nodes will show a warning triangle. This is because they need your unique API keys.

### Google Gemini API
1. Double-click the **Gemini API** node.
2. Under "Credential for Google Gemini API", click **Create New Credential**.
3. Paste your API key from Google AI Studio.
4. Save the credential.

### Jira Software Cloud
1. Double-click the **Jira** node.
2. Click **Create New Credential**.
3. You need:
   - **Email**: The email you use for Jira.
   - **API Token**: Create this in your Atlassian account settings.
   - **Domain**: Your Jira subdomain (e.g., `your-company.atlassian.net`).
4. Save the credential.

### Notion API
1. Double-click the **Notion** node.
2. Click **Create New Credential**.
3. You can use OAuth2 (connects automatically) or an Internal Integration Token (created at `notion.so/my-integrations`).
4. If using an Integration Token, make sure to invite the Notion Bot to your specific Database page!

### Slack API
1. Double-click the **Slack** node.
2. Click **Create New Credential**.
3. You can either use a Slack Webhook URL (easiest) or an OAuth2 Slack App token (better for interactive buttons).
4. Save the credential.

## 4. Activating the Workflow

1. Once all credentials are set, double-click the **Webhook** node and copy the "Test URL".
2. Click **Execute Workflow** at the bottom of the screen to put n8n into listening mode.
3. Send a test POST request to the Webhook URL (using Postman or `curl`) containing the transcript in the body:
   ```json
   {
     "transcript": "Okay let's start the meeting. Sarah, you need to update the database schema by Friday..."
   }
   ```
4. Watch the nodes light up green as the data flows through! Once you confirm it works, toggle the workflow switch in the top right to **Active**.
