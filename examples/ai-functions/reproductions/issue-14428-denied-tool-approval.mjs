import { createOpenAI } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import { z } from 'zod';

const searchMemory = tool({
  description: 'Search memory',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ resultCount: 0, query }),
});

const sendEmail = tool({
  description: 'Send an email',
  inputSchema: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  needsApproval: true,
  execute: async ({ to, subject }) => ({ success: true, to, subject }),
});

const tools = { searchMemory, sendEmail };

// This is the second POST body shape from issue #14428 after the user denied
// the approval request for the sendEmail tool.
const messages = [
  {
    id: 'msg-1',
    role: 'user',
    parts: [
      {
        type: 'text',
        text: 'send an email to test@test.com saying hello',
      },
    ],
  },
  {
    id: 'msg-2',
    role: 'assistant',
    parts: [
      {
        type: 'tool-searchMemory',
        toolCallId: 'call_issue14428_search',
        state: 'output-available',
        input: { query: 'contact test@test.com' },
        output: { resultCount: 0 },
      },
      {
        type: 'tool-sendEmail',
        toolCallId: 'call_issue14428_email',
        state: 'approval-responded',
        input: {
          to: 'test@test.com',
          subject: 'Hello',
          body: 'Hello',
        },
        approval: {
          id: 'appr_issue14428_email',
          approved: false,
          reason: 'User denied',
        },
      },
    ],
  },
];

function redactAuthorization(headers) {
  const output = {};
  for (const [key, value] of new Headers(headers).entries()) {
    output[key] = key.toLowerCase() === 'authorization' ? '<redacted>' : value;
  }
  return output;
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    'OPENAI_API_KEY is required to reproduce issue #14428 against the live OpenAI Responses API.',
  );
}

const openai = createOpenAI({
  fetch: async (url, init) => {
    if (process.env.AI_SDK_ISSUE_14428_LOG_REQUEST === '1') {
      console.log(
        'OpenAI request:',
        JSON.stringify(
          {
            url: String(url),
            method: init?.method,
            headers: redactAuthorization(init?.headers),
            body: init?.body != null ? JSON.parse(String(init.body)) : null,
          },
          null,
          2,
        ),
      );
    }

    return fetch(url, init);
  },
});

const modelMessages = await convertToModelMessages(messages, {
  tools,
  ignoreIncompleteToolCalls: true,
});

console.log('Converted ModelMessages:');
console.log(JSON.stringify(modelMessages, null, 2));

const result = streamText({
  model: openai('gpt-4o'),
  system:
    'You have searchMemory and sendEmail. Call both when asked to send email.',
  messages: modelMessages,
  tools,
  stopWhen: stepCountIs(10),
});

const response = result.toUIMessageStreamResponse();
const streamTextBody = await response.text();

console.log('UI message stream response body:');
console.log(streamTextBody);

if (streamTextBody.includes("Missing required parameter: 'input[")) {
  throw new Error(
    'Reproduced issue #14428: denied tool approval crashed the continuation request with Missing required parameter: input[N].output.',
  );
}

if (streamTextBody.includes('"type":"error"')) {
  throw new Error(
    'The denied approval continuation emitted an unexpected UI stream error.',
  );
}

console.log(
  'No UI stream error was observed while continuing after the denied tool approval.',
);
