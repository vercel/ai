import type { LanguageModelV3Usage } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { generateText } from './generate-text';

const testUsage: LanguageModelV3Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

describe('invalid provider-executed tool calls', () => {
  it('should not synthesize a client tool error', async () => {
    const result = await generateText({
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          warnings: [],
          usage: testUsage,
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'web_search',
              input: '{}',
              providerExecuted: true,
            },
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'web_search',
              result: {
                type: 'web_search_tool_result_error',
                errorCode: 'invalid_tool_input',
              },
              isError: true,
            },
          ],
        }),
      }),
      tools: {
        web_search: {
          type: 'provider',
          id: 'test.web_search',
          inputSchema: z.object({ query: z.string() }),
          outputSchema: z.unknown(),
          args: {},
        },
      },
      prompt: 'Search the web.',
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'web_search',
      input: {},
      invalid: true,
      providerExecuted: true,
    });
    expect(result.content[1]).toEqual({
      type: 'tool-error',
      toolCallId: 'call-1',
      toolName: 'web_search',
      input: {},
      error: {
        type: 'web_search_tool_result_error',
        errorCode: 'invalid_tool_input',
      },
      providerExecuted: true,
      dynamic: true,
    });
    expect(result.response.messages).toHaveLength(1);
    expect(result.response.messages[0]).toMatchObject({
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'web_search',
          input: {},
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'web_search',
          output: {
            type: 'error-json',
            value: {
              type: 'web_search_tool_result_error',
              errorCode: 'invalid_tool_input',
            },
          },
        },
      ],
    });
  });
});
