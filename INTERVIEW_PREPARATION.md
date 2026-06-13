# Interview Preparation: AI Meeting Workflow Project

If you are using this project on your resume, you need to be prepared to speak about it in a software engineering interview. This document provides common interview questions you might face regarding this project, and how you should answer them.

## 1. "Can you tell me about a recent project you built?"

**How to answer:** Use the STAR method (Situation, Task, Action, Result).
* **Situation:** "My team spent too much time manually writing summaries and creating Jira tickets after meetings."
* **Task:** "I wanted to build a fully automated, zero-touch pipeline that would handle all administrative meeting tasks."
* **Action:** "I built a Node.js/TypeScript microservice that listens for Google Meet webhooks. It automatically pulls the meeting transcript, uses Google Gemini's structured JSON outputs to extract action items, and then parallelizes API requests to create Jira issues, a Notion documentation page, and a Slack notification."
* **Result:** "It eliminated manual meeting administration entirely and demonstrated how to reliably integrate LLMs into deterministic software pipelines."

## 2. "Why did you use TypeScript instead of regular JavaScript?"

**How to answer:** Focus on Type Safety and API boundaries.
* "Because this project integrates with 5 different external APIs (Google, Gemini, Jira, Notion, Slack), data structures are complex. If I passed the wrong property name to Jira, the whole pipeline would crash at runtime. TypeScript interfaces gave me compile-time safety, ensuring that the JSON returned by Gemini perfectly matched the payloads expected by Jira and Notion."

## 3. "How did you ensure the AI didn't hallucinate or output the wrong format?"

**How to answer:** Mention Structured Outputs and Guardrails.
* "Two ways. First, instead of asking for a plain text response, I utilized the `responseSchema` feature of the Gemini API to force the model to output strict JSON. Second, I implemented a Guardrail: I prompt the model to return a `confidence` score. If the score falls below a threshold (e.g., 80%), the system skips Jira ticket creation and pings a human on Slack to review the transcript manually."

## 4. "What happens if one of the APIs fails? Does the whole application crash?"

**How to answer:** Discuss Error Handling and Graceful Degradation.
* "I wrapped the orchestration pipeline in strict `try/catch` blocks. If the Notion API goes down, the error is caught and logged, but the application doesn't crash. It proceeds to the Slack notification step so the team still gets their summary. I also implemented a backup polling loop so if the initial webhook fails due to a network blip, the application will eventually catch the missed meeting on its next cycle."

## 5. "How do you handle authentication in this app?"

**How to answer:** Mention Environment Variables and varied Auth strategies.
* "I used the `dotenv` library to keep all secrets out of the source code. The project actually handles three different types of auth: Google uses OAuth2 Service Account JSON credentials, Jira uses Basic Auth (base64 encoding an email and an API token), and Notion/Slack use Bearer Tokens in the authorization header."

## 6. "How would you scale this if you had 10,000 meetings a day?"

**How to answer:** Talk about queues and serverless.
* "Currently, it runs sequentially in a single Node.js process. To scale it, I would introduce a Message Queue (like RabbitMQ or AWS SQS). The Google webhook would instantly dump the `meeting_id` into the queue and return a 200 OK. Then, a fleet of serverless functions (like AWS Lambda or Google Cloud Functions) would pull from the queue, allowing thousands of transcripts to be processed in parallel by Gemini."
