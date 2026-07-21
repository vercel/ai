import type {
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
  LanguageModelV3ToolCall,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAnthropic } from './anthropic-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const prompt: LanguageModelV3Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Call website_update.' }],
  },
];

const tools: LanguageModelV3FunctionTool[] = [
  {
    type: 'function',
    name: 'website_update',
    inputSchema: {
      type: 'object',
      properties: {
        website_path: { type: 'string' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              type: { type: 'string', enum: ['feature', 'bug'] },
              passes: { type: 'boolean' },
            },
            required: ['description', 'type', 'passes'],
            additionalProperties: false,
          },
        },
      },
      required: ['website_path', 'tasks'],
      additionalProperties: false,
    },
  },
];

const expectedDescription =
  'Today you post every run to Strava, but Strava does not answer the question: "What should I do next after this run?". It is a great log, but it is not adaptive.';

function assertQuotedDescription(toolCall: LanguageModelV3ToolCall) {
  const input = JSON.parse(toolCall.input) as {
    tasks: Array<{ description: string }>;
  };

  expect(input.tasks[0]?.description).toBe(expectedDescription);
}

describe('issue #11719 quoted tool input', () => {
  const server = createTestServer({
    'https://api.anthropic.com/v1/messages': {},
  });
  const model = createAnthropic({ apiKey: 'test-api-key' })(
    'claude-sonnet-4-5',
  );

  it('preserves an escaped quoted question in a generated tool call', async () => {
    server.urls['https://api.anthropic.com/v1/messages'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          'src/__fixtures__/anthropic-issue-11719-quoted-tool-input.json',
          'utf8',
        ),
      ),
    };

    const result = await model.doGenerate({ prompt, tools });
    const toolCall = result.content.find(
      part => part.type === 'tool-call',
    ) as LanguageModelV3ToolCall;

    assertQuotedDescription(toolCall);
  });

  it('preserves an escaped quoted question across streamed input deltas', async () => {
    const chunks = fs
      .readFileSync(
        'src/__fixtures__/anthropic-issue-11719-quoted-tool-input.chunks.txt',
        'utf8',
      )
      .trimEnd()
      .split('\n')
      .map(line => `data: ${line}\n\n`);
    chunks.push('data: [DONE]\n\n');

    server.urls['https://api.anthropic.com/v1/messages'].response = {
      type: 'stream-chunks',
      chunks,
    };

    const result = await model.doStream({ prompt, tools });
    const parts = await convertReadableStreamToArray(result.stream);
    const toolCall = parts.find(
      part => part.type === 'tool-call',
    ) as LanguageModelV3ToolCall;

    assertQuotedDescription(toolCall);
  });
});
