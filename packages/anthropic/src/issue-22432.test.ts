import type { LanguageModelV3, LanguageModelV3Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const fixtureDirectory = 'src/__fixtures__';

function readFixture(name: string): unknown {
  return JSON.parse(
    fs.readFileSync(`${fixtureDirectory}/${name}.json`, 'utf8'),
  );
}

function hasToolSearchErrorResult(body: unknown): boolean {
  if (body == null || typeof body !== 'object' || !('messages' in body)) {
    return false;
  }

  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return false;
  }

  return messages.some(
    message =>
      message != null &&
      typeof message === 'object' &&
      'content' in message &&
      Array.isArray(message.content) &&
      message.content.some(
        (part: unknown) =>
          part != null &&
          typeof part === 'object' &&
          'type' in part &&
          part.type === 'tool_search_tool_result' &&
          'content' in part &&
          part.content != null &&
          typeof part.content === 'object' &&
          'type' in part.content &&
          part.content.type === 'tool_search_tool_result_error' &&
          'error_code' in part.content &&
          part.content.error_code === 'invalid_tool_input',
      ),
  );
}

function tools(
  kind: 'regex' | 'bm25',
): NonNullable<Parameters<LanguageModelV3['doGenerate']>[0]['tools']> {
  return [
    {
      type: 'provider',
      id:
        kind === 'regex'
          ? 'anthropic.tool_search_regex_20251119'
          : 'anthropic.tool_search_bm25_20251119',
      name: 'tool_search',
      args: {},
    },
    {
      type: 'function',
      name: 'deferred_alpha',
      description: 'A deferred operation',
      inputSchema: { type: 'object', properties: {} },
      providerOptions: { anthropic: { deferLoading: true } },
    },
    {
      type: 'function',
      name: 'continue_tool',
      description: 'Continue after the failed search',
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
      },
    },
  ];
}

describe('issue #22432 tool-search error replay', () => {
  it.each([
    { kind: 'regex' as const, outputType: 'error-json' as const },
    { kind: 'regex' as const, outputType: 'json' as const },
    { kind: 'bm25' as const, outputType: 'error-json' as const },
    { kind: 'bm25' as const, outputType: 'json' as const },
  ])(
    'replays $kind $outputType errors so a later request succeeds',
    async ({ kind, outputType }) => {
      const firstFixture = readFixture('anthropic-tool-search-error-step-1.1');
      const secondFixture = readFixture('anthropic-tool-search-error-step-2.1');
      let requestCount = 0;
      const fetch: typeof globalThis.fetch = async (_input, init) => {
        requestCount++;

        if (requestCount === 1) {
          return new Response(JSON.stringify(firstFixture), {
            headers: { 'content-type': 'application/json' },
          });
        }

        const body =
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

        if (hasToolSearchErrorResult(body)) {
          return new Response(JSON.stringify(secondFixture), {
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response(
          JSON.stringify({
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message:
                'tool search use without a corresponding tool_search_tool_result block',
            },
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        );
      };
      const anthropic = createAnthropic({
        apiKey: 'test-api-key',
        fetch,
      });

      const firstResult = await anthropic('claude-sonnet-5-5').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Run the invalid search.' }],
          },
        ],
        tools: tools('regex'),
      });
      const searchResult = firstResult.content.find(
        part => part.type === 'tool-result',
      );

      expect(searchResult).toMatchObject({
        type: 'tool-result',
        toolName: 'tool_search',
        isError: true,
        result: {
          type: 'tool_search_tool_result_error',
          errorCode: 'invalid_tool_input',
        },
      });

      const prompt: LanguageModelV3Prompt = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Run the invalid search.' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'srvtoolu_01HefMsTPWaw1rE9gmpk6v8q',
              toolName: 'tool_search',
              input:
                kind === 'regex'
                  ? { pattern: '[' }
                  : { query: 'invalid input' },
              providerExecuted: true,
            },
            {
              type: 'tool-result',
              toolCallId: 'srvtoolu_01HefMsTPWaw1rE9gmpk6v8q',
              toolName: 'tool_search',
              output: {
                type: outputType,
                value: {
                  type: 'tool_search_tool_result_error',
                  errorCode: 'invalid_tool_input',
                },
              },
            },
            {
              type: 'tool-call',
              toolCallId: 'toolu_01G4GmRqQSoG3uMYfbhzZtrh',
              toolName: 'continue_tool',
              input: { value: 'continue' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'toolu_01G4GmRqQSoG3uMYfbhzZtrh',
              toolName: 'continue_tool',
              output: { type: 'json', value: { ok: true } },
            },
          ],
        },
      ];

      const replayResult = await anthropic('claude-sonnet-5-5').doGenerate({
        prompt,
        tools: tools(kind),
      });

      expect(replayResult.content).toContainEqual({
        type: 'text',
        text: expect.stringContaining('I ran both steps in order'),
      });
      expect(requestCount).toBe(2);
    },
  );
});
