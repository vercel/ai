import { createOpenAI } from '@ai-sdk/openai';
import {
  APICallError,
  convertToModelMessages,
  jsonSchema,
  streamText,
  tool,
  type InferUITools,
  type UIMessage,
} from 'ai';

const rawInput =
  '{"label": "Build sheet", "cells": {"A1": {"value": "x", "format": {"bold": true';

const tools = {
  set_cell_range: tool({
    description: 'Write a cell range.',
    inputSchema: jsonSchema<{ label: string }>({
      type: 'object',
      properties: { label: { type: 'string' } },
      required: ['label'],
    }),
  }),
};

type ReproductionUIMessage = UIMessage<
  never,
  never,
  InferUITools<typeof tools>
>;

const uiMessages: ReproductionUIMessage[] = [
  {
    id: 'u1',
    role: 'user',
    parts: [{ type: 'text', text: 'build the sheet' }],
  },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      {
        type: 'tool-set_cell_range',
        toolCallId: 'call_1',
        state: 'output-error',
        input: undefined,
        rawInput,
        errorText: 'Invalid input for tool set_cell_range: JSON parsing failed',
      },
    ],
  },
  {
    id: 'u2',
    role: 'user',
    parts: [{ type: 'text', text: 'continue' }],
  },
];

async function main() {
  const apiKey =
    process.env.DASHSCOPE_API_KEY ?? process.env.ALIBABA_API_KEY ?? '';
  const baseURL =
    process.env.DASHSCOPE_BASE_URL ??
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  const endpoint = `${baseURL.replace(/\/$/, '')}/chat/completions`;

  const messages = await convertToModelMessages(uiMessages);
  const assistantMessage = messages[1];
  const toolCall =
    assistantMessage?.role === 'assistant' &&
    Array.isArray(assistantMessage.content)
      ? assistantMessage.content.find(part => part.type === 'tool-call')
      : undefined;

  if (toolCall?.type !== 'tool-call' || toolCall.input !== rawInput) {
    throw new Error(
      'convertToModelMessages did not preserve rawInput as the tool-call input.',
    );
  }

  const directResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [
        { role: 'user', content: 'build the sheet' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'set_cell_range',
                arguments: rawInput,
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: 'Invalid input for tool set_cell_range: JSON parsing failed',
        },
        { role: 'user', content: 'continue' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'set_cell_range',
            description: 'Write a cell range.',
            parameters: {
              type: 'object',
              properties: { label: { type: 'string' } },
              required: ['label'],
            },
          },
        },
      ],
      max_tokens: 16,
    }),
  });
  const directResponseBody = await directResponse.text();

  if ([401, 402, 403, 429].includes(directResponse.status)) {
    throw new Error(
      `DashScope access blocker (${directResponse.status}): ${directResponseBody}`,
    );
  }

  let capturedRequestBody: unknown;
  const openai = createOpenAI({
    apiKey,
    baseURL,
    fetch: async (input, init) => {
      capturedRequestBody = JSON.parse(String(init?.body));
      return fetch(input, init);
    },
  });

  const result = streamText({
    model: openai.chat('qwen-plus'),
    tools,
    messages,
    maxOutputTokens: 16,
    onError: () => {},
  });

  let sdkError: APICallError | undefined;
  for await (const part of result.fullStream) {
    if (part.type === 'error' && APICallError.isInstance(part.error)) {
      sdkError = part.error;
    }
  }

  const sdkArguments = (
    capturedRequestBody as {
      messages?: Array<{
        tool_calls?: Array<{ function?: { arguments?: string } }>;
      }>;
    }
  ).messages?.[1]?.tool_calls?.[0]?.function?.arguments;

  if (sdkArguments !== JSON.stringify(rawInput)) {
    throw new Error(
      `Expected the current OpenAI adapter to double-encode rawInput, received ${JSON.stringify(sdkArguments)}.`,
    );
  }

  if (directResponse.status !== 400) {
    throw new Error(
      `Expected the direct raw-input comparison to return HTTP 400, received ${directResponse.status}: ${directResponseBody}`,
    );
  }

  if (sdkError?.statusCode !== 400) {
    throw new Error(
      `Expected the AI SDK replay to return HTTP 400, received ${sdkError?.statusCode ?? 'no API error'}.`,
    );
  }

  console.log(
    'COULD_NOT_REPRODUCE: DashScope qwen-plus rejected both raw invalid and AI SDK double-encoded replay with HTTP 400; raw pass-through did not restore continuation.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
