import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const server = createTestServer({
  'https://api.anthropic.com/v1/messages': {},
});

it('surfaces the live API rejection for an orphaned tool_result that references a server_tool_use', async () => {
  const responseBody = fs.readFileSync(
    'src/__fixtures__/anthropic-issue-17366-error.json',
    'utf8',
  );
  server.urls['https://api.anthropic.com/v1/messages'].response = {
    type: 'error',
    status: 400,
    body: responseBody,
  };

  const prompt: LanguageModelV3Prompt = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Reproduce issue #17366.' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'srvtoolu_issue_17366_invalid',
          toolName: 'web_search',
          input: {},
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'srvtoolu_issue_17366_invalid',
          toolName: 'web_search',
          output: {
            type: 'error-json',
            value: {
              type: 'web_search_tool_result_error',
              errorCode: 'invalid_tool_input',
            },
          },
        },
        {
          type: 'tool-call',
          toolCallId: 'srvtoolu_issue_17366_deferred',
          toolName: 'web_search',
          input: { query: 'AI SDK' },
          providerExecuted: true,
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'srvtoolu_issue_17366_invalid',
          toolName: 'web_search',
          output: {
            type: 'error-text',
            value: 'Invalid input for tool web_search',
          },
        },
      ],
    },
  ];

  const provider = createAnthropic({ apiKey: 'test-api-key' });

  await expect(
    provider('claude-sonnet-4-5').doGenerate({
      prompt,
      tools: [
        {
          type: 'provider',
          id: 'anthropic.web_search_20250305',
          name: 'web_search',
          args: {},
        },
      ],
    }),
  ).rejects.toMatchObject({
    statusCode: 400,
    message:
      'messages.2.content.0: unexpected `tool_use_id` found in `tool_result` blocks: srvtoolu_issue_17366_invalid. Each `tool_result` block must have a corresponding `tool_use` block in the previous message.',
  });

  expect(await server.calls[0].requestBodyJson).toMatchObject({
    messages: [
      expect.anything(),
      {
        role: 'assistant',
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'server_tool_use',
            id: 'srvtoolu_issue_17366_invalid',
          }),
          expect.objectContaining({
            type: 'web_search_tool_result',
            tool_use_id: 'srvtoolu_issue_17366_invalid',
          }),
        ]),
      },
      {
        role: 'user',
        content: [
          expect.objectContaining({
            type: 'tool_result',
            tool_use_id: 'srvtoolu_issue_17366_invalid',
          }),
        ],
      },
    ],
  });
});
