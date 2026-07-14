import type { JSONSchema7, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';
import { injectFetchHeaders } from './inject-fetch-headers';

const modelId = 'us.anthropic.claude-opus48-issue-16662';
const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
const generateUrl = `${baseUrl}/model/${encodeURIComponent(modelId)}/converse`;
const fixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/issue-16662-live.json', 'utf8'),
);

const server = createTestServer({
  [generateUrl]: {},
});

const model = new AmazonBedrockChatLanguageModel(modelId, {
  baseUrl: () => baseUrl,
  fetch: injectFetchHeaders({ 'x-amz-auth': 'test-auth' }),
  generateId: () => 'issue-16662',
  headers: {},
});

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Collect the evidence with tools, then return the assessment.',
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'records-6',
        toolName: 'queryRecords',
        input: { page: 6 },
      },
      {
        type: 'tool-call',
        toolCallId: 'logs-6',
        toolName: 'readLogs',
        input: { page: 6 },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'records-6',
        toolName: 'queryRecords',
        output: {
          type: 'text',
          value: 'Verbose warehouse page 6 was returned.',
        },
      },
      {
        type: 'tool-result',
        toolCallId: 'logs-6',
        toolName: 'readLogs',
        output: {
          type: 'text',
          value: 'Verbose service log page 6 was returned.',
        },
      },
    ],
  },
];

const outputSchema = z.object({
  reasoning: z.string(),
  requirements: z.array(
    z.object({
      id: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
      summary: z.string(),
    }),
  ),
  riskLevel: z.enum(['critical', 'high', 'medium', 'low']),
});

beforeEach(() => {
  server.urls[generateUrl].response = {
    type: 'json-value',
    body: fixture,
  };
});

it('issue #16662: produces schema-valid output after verbose tool results', async () => {
  const result = await model.doGenerate({
    prompt,
    responseFormat: {
      type: 'json',
      schema: z.toJSONSchema(outputSchema) as JSONSchema7,
    },
    tools: [
      {
        type: 'function',
        name: 'queryRecords',
        inputSchema: {
          type: 'object',
          properties: { page: { type: 'number' } },
          required: ['page'],
        },
      },
      {
        type: 'function',
        name: 'readLogs',
        inputSchema: {
          type: 'object',
          properties: { page: { type: 'number' } },
          required: ['page'],
        },
      },
    ],
  });

  expect(await server.calls[0].requestBodyJson).toMatchObject({
    toolConfig: {
      toolChoice: { any: {} },
      tools: [
        { toolSpec: { name: 'queryRecords' } },
        { toolSpec: { name: 'readLogs' } },
        { toolSpec: { name: 'json' } },
      ],
    },
  });

  const structuredText = result.content
    .filter(part => part.type === 'text')
    .at(-1);
  expect(structuredText).toBeDefined();
  expect(outputSchema.safeParse(JSON.parse(structuredText!.text)).success).toBe(
    true,
  );
});
