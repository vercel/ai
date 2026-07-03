import { convertToModelMessages, generateText, tool, type UIMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

const toolCallId = 'call_issue_13307_duplicate';
const approvalId = 'approval_issue_13307_duplicate';

const messagesWithDuplicateToolCallId: Array<Omit<UIMessage, 'id'>> = [
  {
    role: 'user',
    parts: [{ type: 'text', text: 'Use the getWeather tool.' }],
  },
  {
    role: 'assistant',
    parts: [
      {
        type: 'tool-getWeather',
        state: 'input-available',
        toolCallId,
        input: { city: 'San Francisco' },
        approval: { id: approvalId, isAutomatic: false },
      },
      {
        type: 'tool-getWeather',
        state: 'output-available',
        toolCallId,
        input: { city: 'San Francisco' },
        output: { weather: 'sunny' },
        approval: { id: approvalId, isAutomatic: false, approved: true },
      },
    ],
  },
  {
    role: 'user',
    parts: [{ type: 'text', text: 'Continue after the approved tool output.' }],
  },
];

const modelMessages = await convertToModelMessages(
  messagesWithDuplicateToolCallId,
);

console.log('Converted model messages:');
console.log(JSON.stringify(modelMessages, null, 2));

let capturedInput: unknown;

await generateText({
  model: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? 'not-needed-for-payload-capture',
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      capturedInput = body.input;

      return Response.json({
        id: 'resp_issue_13307_fake',
        model: 'gpt-4.1-mini',
        created_at: 0,
        output: [
          {
            type: 'message',
            id: 'msg_issue_13307_fake',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'ok',
                annotations: [],
              },
            ],
            status: 'completed',
          },
        ],
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          total_tokens: 2,
        },
      });
    },
  })('gpt-4.1-mini'),
  messages: modelMessages,
  tools: {
    getWeather: tool({
      inputSchema: z.object({ city: z.string() }),
      needsApproval: true,
    }),
  },
  maxRetries: 0,
  maxOutputTokens: 16,
});

console.log('OpenAI Responses input payload:');
console.log(JSON.stringify(capturedInput, null, 2));

const duplicateFunctionCalls = Array.isArray(capturedInput)
  ? capturedInput.filter(
      item =>
        item != null &&
        typeof item === 'object' &&
        'type' in item &&
        item.type === 'function_call' &&
        'call_id' in item &&
        item.call_id === toolCallId,
    )
  : [];

if (duplicateFunctionCalls.length > 1) {
  throw new Error(
    `Reproduced issue #13307: the OpenAI Responses payload contains ${duplicateFunctionCalls.length} function_call items with the same call_id "${toolCallId}".`,
  );
}

console.log('Could not reproduce: duplicate function_call items were not sent.');
