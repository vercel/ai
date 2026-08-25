import type {
  LanguageModelV4FunctionTool,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { mockId } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const prompt: LanguageModelV4Prompt = [
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call_123',
        toolName: 'tool_search',
        input: {
          query: 'synthetic query',
          limit: 10,
        },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call_123',
        toolName: 'tool_search',
        output: {
          type: 'text',
          value: 'No matches',
        },
      },
    ],
  },
  {
    role: 'user',
    content: [{ type: 'text', text: 'Reply with exactly: history accepted' }],
  },
];

const tools: LanguageModelV4FunctionTool[] = [
  {
    type: 'function' as const,
    name: 'tool_search',
    description: 'Search synthetic records',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query', 'limit'],
      additionalProperties: false,
    },
  },
];

it('replays an ordinary function named tool_search as a function call', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const liveErrorBody = fs.readFileSync(
    new URL('./__fixtures__/openai-issue-17402-error.1.json', import.meta.url),
    'utf8',
  );

  const model = new OpenAIResponsesLanguageModel('gpt-5.4', {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    generateId: mockId(),
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const input = requestBody.input as Array<Record<string, unknown>>;

      if (input.some(item => item.type === 'tool_search_call')) {
        return new Response(liveErrorBody, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      return Response.json({
        id: 'resp_issue_17402',
        object: 'response',
        created_at: 1,
        status: 'completed',
        error: null,
        incomplete_details: null,
        model: 'gpt-5.4',
        output: [
          {
            id: 'msg_issue_17402',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'history accepted',
                annotations: [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 1,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 1,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 2,
        },
      });
    },
  });

  const result = await model.doGenerate({ prompt, tools });

  expect(result.content).toContainEqual({
    type: 'text',
    text: 'history accepted',
    providerMetadata: undefined,
  });
  expect(requestBody).toMatchObject({
    tools: [
      {
        type: 'function',
        name: 'tool_search',
      },
    ],
    input: [
      {
        type: 'function_call',
        call_id: 'call_123',
        name: 'tool_search',
        arguments: '{"query":"synthetic query","limit":10}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_123',
        output: 'No matches',
      },
    ],
  });
});
