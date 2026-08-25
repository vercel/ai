import type {
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const liveErrorFixture = JSON.parse(
  fs.readFileSync(
    'src/responses/__fixtures__/openai-issue-17402-error.1.json',
    'utf8',
  ),
);

const prompt: LanguageModelV3Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Search the synthetic records.' }],
  },
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
        output: { type: 'text', value: 'No matches' },
      },
    ],
  },
  {
    role: 'user',
    content: [{ type: 'text', text: 'Summarize the result in one sentence.' }],
  },
];

const tools: LanguageModelV3FunctionTool[] = [
  {
    type: 'function',
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

const successResponse = {
  id: 'resp_issue_17402',
  object: 'response',
  created_at: 1787688000,
  status: 'completed',
  error: null,
  incomplete_details: null,
  instructions: null,
  max_output_tokens: 32,
  model: 'gpt-5.6',
  output: [
    {
      id: 'msg_issue_17402',
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'No synthetic records matched.',
          annotations: [],
        },
      ],
    },
  ],
  parallel_tool_calls: true,
  previous_response_id: null,
  reasoning: { effort: null, summary: null },
  store: true,
  temperature: 1,
  text: { format: { type: 'text' } },
  tool_choice: 'auto',
  tools: [],
  top_p: 1,
  truncation: 'disabled',
  usage: {
    input_tokens: 1,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 1,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 2,
  },
  user: null,
  metadata: {},
};

it('replays an ordinary function named tool_search as a function call', async () => {
  let requestBody: any;

  const model = new OpenAIResponsesLanguageModel('gpt-5.6', {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    fetch: async (_input, init) => {
      requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

      const malformedCall = requestBody.input.find(
        (item: any) =>
          item.type === 'tool_search_call' && item.arguments === undefined,
      );

      return new Response(
        JSON.stringify(
          malformedCall == null ? successResponse : liveErrorFixture,
        ),
        {
          status: malformedCall == null ? 200 : 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    },
  });

  const result = await model.doGenerate({
    prompt,
    tools,
    maxOutputTokens: 32,
  });

  expect(result.content).toContainEqual({
    type: 'text',
    text: 'No synthetic records matched.',
    providerMetadata: {
      openai: {
        itemId: 'msg_issue_17402',
      },
    },
  });
  expect(requestBody.tools).toContainEqual(
    expect.objectContaining({
      type: 'function',
      name: 'tool_search',
    }),
  );
  expect(requestBody.input).toEqual(
    expect.arrayContaining([
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
    ]),
  );
});
