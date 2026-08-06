import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';

const firstToolCallId = 'tooluse_Ac1Xq9ZklmNoPq';
const secondToolCallId = 'tooluse_Ac2Yt7WrstUvWx';
let observedRequestBody = '';
let observedResponseBody = '';
let observedResponseStatus = 0;
const amazonBedrock = createAmazonBedrock({
  region: 'us-east-1',
  fetch: async (input, init) => {
    observedRequestBody = String(init?.body ?? '');
    const response = await fetch(input, init);
    observedResponseStatus = response.status;
    observedResponseBody = await response.clone().text();
    return response;
  },
});

const messages: ModelMessage[] = [
  {
    role: 'user',
    content: 'Look up both values.',
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: firstToolCallId,
        toolName: 'lookup',
        input: { value: 'first' },
      },
      {
        type: 'tool-call',
        toolCallId: secondToolCallId,
        toolName: 'lookup',
        input: { value: 'second' },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: firstToolCallId,
        toolName: 'lookup',
        output: { type: 'text', value: 'first result' },
      },
      {
        type: 'tool-result',
        toolCallId: secondToolCallId,
        toolName: 'lookup',
        output: { type: 'text', value: 'second result' },
      },
    ],
  },
];

async function main() {
  try {
    await generateText({
      model: amazonBedrock('mistral.ministral-3-8b-instruct'),
      messages,
      tools: {
        lookup: tool({
          inputSchema: z.object({ value: z.string() }),
        }),
      },
      maxOutputTokens: 16,
    });

    throw new Error(
      'Expected Bedrock to reject duplicate normalized toolUseId values, but the request succeeded.',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('duplicate Ids') && message.includes('tooluseAc')) {
      console.error(
        `CAPTURED_REQUEST: ${observedRequestBody}\nCAPTURED_RESPONSE_STATUS: ${observedResponseStatus}\nCAPTURED_RESPONSE: ${observedResponseBody}`,
      );
      console.error(
        `ISSUE_16182_REPRODUCED: Bedrock rejected duplicate normalized toolUseId tooluseAc. ${message}`,
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main();
