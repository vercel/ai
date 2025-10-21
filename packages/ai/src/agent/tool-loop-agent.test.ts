import { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { ToolLoopAgent } from './tool-loop-agent';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';

describe('ToolLoopAgent', () => {
  describe('generate', () => {
    it('should use prepareCall', async () => {
      let doGenerateOptions: LanguageModelV3CallOptions | undefined;

      const agent = new ToolLoopAgent<{ value: string }>({
        model: new MockLanguageModelV3({
          doGenerate: async options => {
            doGenerateOptions = options;
            return {
              finishReason: 'stop' as const,
              usage: {
                inputTokens: 3,
                outputTokens: 10,
                totalTokens: 13,
                reasoningTokens: undefined,
                cachedInputTokens: undefined,
              },
              warnings: [],
              content: [{ type: 'text', text: 'reply' }],
            };
          },
        }),
        prepareCall: ({ options, ...rest }) => {
          return {
            ...rest,
            providerOptions: {
              test: { value: options.value },
            },
          };
        },
      });

      await agent.generate({
        prompt: 'Hello, world!',
        options: { value: 'test' },
      });

      expect(doGenerateOptions?.providerOptions).toMatchInlineSnapshot(`
        {
          "test": {
            "value": "test",
          },
        }
      `);
    });
  });

  describe('stream', () => {
    it('should use prepareCall', async () => {
      let doStreamOptions: LanguageModelV3CallOptions | undefined;

      const agent = new ToolLoopAgent<{ value: string }>({
        model: new MockLanguageModelV3({
          doStream: async options => {
            doStreamOptions = options;
            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'stream-start',
                  warnings: [],
                },
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
                { type: 'text-delta', id: '1', delta: ', ' },
                { type: 'text-delta', id: '1', delta: `world!` },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: {
                    inputTokens: 3,
                    outputTokens: 10,
                    totalTokens: 13,
                    reasoningTokens: undefined,
                    cachedInputTokens: undefined,
                  },
                  providerMetadata: {
                    testProvider: { testKey: 'testValue' },
                  },
                },
              ]),
            };
          },
        }),
        prepareCall: ({ options, ...rest }) => {
          return {
            ...rest,
            providerOptions: {
              test: { value: options.value },
            },
          };
        },
      });

      const result = await agent.stream({
        prompt: 'Hello, world!',
        options: { value: 'test' },
      });

      await result.consumeStream();

      expect(doStreamOptions?.providerOptions).toMatchInlineSnapshot(
        `
        {
          "test": {
            "value": "test",
          },
        }
      `,
      );
    });
  });
});
