import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import { injectFetchHeaders } from './inject-fetch-headers';

vi.mock('./bedrock-event-stream-response-handler', () => ({
  createBedrockEventStreamResponseHandler:
    () =>
    async ({ response }: { response: Response }) => {
      const chunks = (await response.text())
        .split('\n')
        .filter(Boolean)
        .map(chunk => {
          const parsedChunk = JSON.parse(chunk);
          return {
            success: true,
            value: parsedChunk,
            rawValue: parsedChunk,
          };
        });

      return {
        responseHeaders: Object.fromEntries(response.headers),
        value: new ReadableStream({
          start(controller) {
            chunks.forEach(chunk => controller.enqueue(chunk));
            controller.close();
          },
        }),
      };
    },
}));

const modelId = 'moonshot.kimi-k2-thinking';
const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
const streamUrl = `${baseUrl}/model/${encodeURIComponent(
  modelId,
)}/converse-stream`;
const fixtureDirectory = 'src/__fixtures__';

const server = createTestServer({
  [streamUrl]: {
    response: {
      type: 'stream-chunks',
      chunks: [],
    },
  },
});

const model = new BedrockChatLanguageModel(modelId, {
  baseUrl: () => baseUrl,
  headers: {},
  fetch: injectFetchHeaders({ 'x-amz-auth': 'test-auth' }),
  generateId: () => 'test-id',
});

const prompt: LanguageModelV2Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Inspect the repository.' }],
  },
];

async function streamFixture(filename: string) {
  server.urls[streamUrl].response = {
    type: 'stream-chunks',
    chunks: fs
      .readFileSync(`${fixtureDirectory}/${filename}`, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => `${line}\n`),
  };

  const { stream } = await model.doStream({
    prompt,
    tools: [
      {
        type: 'function',
        name: 'glob_search',
        inputSchema: {
          type: 'object',
          properties: { pattern: { type: 'string' } },
          required: ['pattern'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'read_file',
        inputSchema: {
          type: 'object',
          properties: { target_file: { type: 'string' } },
          required: ['target_file'],
          additionalProperties: false,
        },
      },
    ],
    includeRawChunks: false,
  });

  return convertReadableStreamToArray(stream);
}

describe('issue #11409 Kimi K2 Thinking tool calls', () => {
  it('keeps the required read_file action structured and reaches the final answer', async () => {
    const globSearch = await streamFixture(
      'issue-11409-kimi-k2-thinking-glob-search.chunks.txt',
    );
    expect(globSearch).toContainEqual({
      type: 'tool-call',
      toolCallId: 'functions.glob_search:0',
      toolName: 'glob_search',
      input: '{"pattern": "**/*cursor*"}',
    });

    const readFile = await streamFixture(
      'issue-11409-kimi-k2-thinking-read-file.chunks.txt',
    );
    const visibleText = readFile
      .filter(part => part.type === 'text-delta')
      .map(part => part.delta)
      .join('');

    expect.soft(readFile).toContainEqual(
      expect.objectContaining({
        type: 'tool-call',
        toolName: 'read_file',
      }),
    );
    expect.soft(visibleText).not.toContain('<function=read_file>');
    expect.soft(visibleText.trim()).toBe('FOUND ISSUE_11409_CONTENT');
  });
});
