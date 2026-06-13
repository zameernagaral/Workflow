# Beginner's Guide: AI Meeting Workflow Automation

Welcome to the **AI Meeting Workflow Automation** project! This guide is written for you—a beginner developer or a first-year Computer Science student. It will explain what this project is, why it was built, and how you can run it on your own machine.

## What Does This Project Do?

Imagine you just finished a 1-hour Google Meet meeting. Usually, someone has to:
1. Re-watch the recording or read the transcript.
2. Write a summary of what was discussed.
3. Find out what tasks (Action Items) were assigned and to whom.
4. Manually go to Jira (a task tracking tool) and create a ticket for each task.
5. Manually go to Notion (a notes app) to document the meeting decisions.
6. Manually message the team on Slack to let them know the summary.

**This project automates all of that.** 
Once a Google Meet meeting ends, this application automatically detects it, reads the transcript, uses Artificial Intelligence (Google Gemini) to understand what happened, and then automatically creates the Jira tickets, updates Notion, and messages Slack!

## Why Was It Built? (The Real-World Problem)

Time is money. In the real world, software engineering teams spend hours every week just doing administrative tasks after meetings. By automating this workflow, teams can focus entirely on writing code and building products instead of doing boring paperwork.

## Technologies Used

* **Node.js**: The runtime environment that allows us to run JavaScript outside of a browser.
* **TypeScript**: A superset of JavaScript that adds "types" (like telling the code that a variable is specifically a `string` or `number`). It catches errors before the code even runs!
* **Google Meet / Drive APIs**: To automatically fetch the meeting recordings and transcripts.
* **Google Gemini API**: A powerful Large Language Model (like ChatGPT) that reads the transcript and extracts summaries, decisions, and tasks.
* **Jira API**: To automatically create tasks on a Jira board.
* **Notion API**: To save notes in a Notion database.
* **Slack API**: To send automated messages to a team channel.

## How the Complete Workflow Works

1. **Trigger**: A Google Meet meeting ends.
2. **Fetch**: Our app, which is always listening, detects the meeting ended and downloads the transcript text.
3. **Analyze**: The transcript is sent to Google Gemini AI with specific instructions to find action items, decisions, and write a summary.
4. **Action**:
   * For every task Gemini found, we send a request to Jira to create a ticket.
   * We send a request to Notion to build a beautiful page with the summary and decisions.
   * We send a message to Slack so everyone knows it is done.
5. **Log**: We print out everything that happened to a `workflow.log` file so we can track it.

## How to Install the Project

1. Install Node.js on your computer from `nodejs.org`.
2. Open your terminal and clone or download this project folder.
3. Open your terminal in the project folder and run:
   ```bash
   npm install
   ```
   This command reads the `package.json` file and downloads all the external libraries we used (like the Notion SDK, Slack SDK, etc.) into a folder called `node_modules`.

## How to Configure API Keys

Since this app connects to many services, it needs passwords (called API Keys) to prove it has permission to do so.

1. Create a file named `.env` in the root of the project.
2. Open `.env` and fill it with the keys provided by your services (refer to the `.env` example we provided). It looks like this:
   ```env
   GEMINI_API_KEY=your_gemini_key_here
   JIRA_API_TOKEN=your_jira_token_here
   # ... and so on
   ```
3. NEVER upload your `.env` file to GitHub! Keep it secret.

## How to Run the Project

To start the automation engine, simply run:
```bash
npm start
```
You will see logs indicating that the server is running on port 3000 and polling Google Meet.

## How to Test the Project

Because you might not want to create an actual Google Meet meeting every time you test the code, we created a simulation tool.

Open a second terminal window and run:
```bash
npm run create-meeting
```
This triggers a simulated meeting. Your running `npm start` terminal will detect it, generate fake transcript data, and run the entire AI flow automatically!

## Common Beginner Mistakes

* **Forgetting to run `npm install`**: If you get an error saying `module not found`, you probably forgot to install the dependencies.
* **Putting API keys in code**: Never hardcode API keys in `src/index.ts`. Always put them in the `.env` file.
* **TypeScript Compile Errors**: If you write invalid TypeScript, `npm start` will crash immediately. Read the error line carefully (e.g., `src/services/jira.ts:15`) to find where you made a typo.

## Troubleshooting Guide

* **"Cannot connect to Google Drive/Meet"**: Your Google Cloud credentials might be missing. Ensure you have `google-credentials.json` in the project root.
* **"Failed to create Jira ticket"**: Check your Jira Domain and Project Key in the `.env` file. The project key must exactly match your Jira board (e.g., `KAN`).
* **"Notion APIError"**: Make sure you "Invited" your Notion Integration bot to your specific Notion Database page using the top-right menu in Notion.
* **"Not in channel (Slack)"**: Make sure your Slack bot is actually added to the channel you specified in `.env`.
