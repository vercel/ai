import type {
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

vi.mock('./bedrock-event-stream-response-handler', () => ({
  createBedrockEventStreamResponseHandler:
    () =>
    async ({ response }: { response: Response }) => {
      const chunks = (await response.text())
        .split('\n')
        .filter(Boolean)
        .map(chunk => {
          const value = JSON.parse(chunk);
          return { success: true, value, rawValue: value };
        });

      return {
        responseHeaders: {},
        value: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        }),
      };
    },
}));

const prompt: LanguageModelV3Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Check for cursor files.' }],
  },
];

const tools: LanguageModelV3FunctionTool[] = [
  {
    type: 'function',
    name: 'glob_search',
    description: 'Find repository files whose paths match a glob pattern.',
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
    description: 'Read the complete contents of a repository file.',
    inputSchema: {
      type: 'object',
      properties: { target_file: { type: 'string' } },
      required: ['target_file'],
      additionalProperties: false,
    },
  },
];

let fixtureName = '';

const model = new BedrockChatLanguageModel('moonshot.kimi-k2-thinking', {
  baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
  headers: {},
  generateId: () => 'test-id',
  fetch: async () =>
    new Response(
      fs.readFileSync(`src/__fixtures__/${fixtureName}.chunks.txt`, 'utf8'),
      { status: 200 },
    ),
});

async function streamFixture(name: string) {
  fixtureName = name;
  const { stream } = await model.doStream({
    prompt,
    tools,
    includeRawChunks: true,
  });
  return convertReadableStreamToArray(stream);
}

describe('issue #11409 live Kimi K2 Thinking fixtures', () => {
  it('preserves the glob_search call as structured tool use', async () => {
    const parts = await streamFixture(
      'issue-11409-kimi-k2-thinking-glob-search',
    );

    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'functions.glob_search:0',
      toolName: 'glob_search',
      input: '{"pattern": "**/*cursor*"}',
    });
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
      }),
    );
  });

  it('preserves the read_file call as structured tool use', async () => {
    const parts = await streamFixture('issue-11409-kimi-k2-thinking-read-file');

    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'functions.read_file:1',
      toolName: 'read_file',
      input: '{"target_file": "src/cursor-config.ts"}',
    });
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
      }),
    );
  });

  it('preserves the final answer and end-turn finish', async () => {
    const parts = await streamFixture('issue-11409-kimi-k2-thinking-final');
    const text = parts
      .filter(part => part.type === 'text-delta')
      .map(part => part.delta)
      .join('');

    expect(text).toContain('FOUND ISSUE_11409_CONTENT');
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
      }),
    );
  });
});
