import { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { ToolLoopAgent } from './tool-loop-agent';

describe('ToolLoopAgent', () => {
  describe('generate', () => {
    let doGenerateOptions: LanguageModelV3CallOptions | undefined;
    let mockModel: MockLanguageModelV3;

    beforeEach(() => {
      doGenerateOptions = undefined;
      mockModel = new MockLanguageModelV3({
        doGenerate: async options => {
          doGenerateOptions = options;
          return {
            content: [{ type: 'text', text: 'reply' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              cachedInputTokens: undefined,
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
            },
            warnings: [],
          };
        },
      });
    });

    it('should use prepareCall', async () => {
      const agent = new ToolLoopAgent<{ value: string }>({
        model: mockModel,
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

    it('should pass abortSignal to generateText', async () => {
      const abortController = new AbortController();

      const agent = new ToolLoopAgent({ model: mockModel });

      await agent.generate({
        prompt: 'Hello, world!',
        abortSignal: abortController.signal,
      });

      expect(doGenerateOptions?.abortSignal).toBe(abortController.signal);
    });

    it('should pass timeout to generateText', async () => {
      const agent = new ToolLoopAgent({ model: mockModel });

      await agent.generate({
        prompt: 'Hello, world!',
        timeout: 5000,
      });

      // timeout is merged into abortSignal, so we check that an abort signal was created
      expect(doGenerateOptions?.abortSignal).toBeDefined();
    });

    it('should pass experimental_download to generateText', async () => {
      const downloadFunction = vi
        .fn()
        .mockResolvedValue([
          { data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' },
        ]);

      const agent = new ToolLoopAgent({
        model: mockModel,
        experimental_download: downloadFunction,
      });

      await agent.generate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: new URL('https://example.com/image.png'),
              },
            ],
          },
        ],
      });

      expect(downloadFunction).toHaveBeenCalledWith([
        {
          url: new URL('https://example.com/image.png'),
          isUrlSupportedByModel: false,
        },
      ]);
    });

    describe('instructions', () => {
      it('should pass string instructions', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: 'INSTRUCTIONS',
        });

        await agent.generate({
          prompt: 'Hello, world!',
        });

        expect(doGenerateOptions?.prompt).toMatchInlineSnapshot(`
          [
            {
              "content": "INSTRUCTIONS",
              "role": "system",
            },
            {
              "content": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "providerOptions": undefined,
              "role": "user",
            },
          ]
        `);
      });

      it('should pass system message instructions', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: {
            role: 'system',
            content: 'INSTRUCTIONS',
            providerOptions: { test: { value: 'test' } },
          },
        });

        await agent.generate({
          prompt: 'Hello, world!',
        });

        expect(doGenerateOptions?.prompt).toMatchInlineSnapshot(`
        [
          {
            "content": "INSTRUCTIONS",
            "providerOptions": {
              "test": {
                "value": "test",
              },
            },
            "role": "system",
          },
          {
            "content": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "providerOptions": undefined,
            "role": "user",
          },
        ]
      `);
      });

      it('should pass array of system message instructions', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: [
            {
              role: 'system',
              content: 'INSTRUCTIONS',
              providerOptions: { test: { value: 'test' } },
            },
            {
              role: 'system',
              content: 'INSTRUCTIONS 2',
              providerOptions: { test: { value: 'test 2' } },
            },
          ],
        });

        await agent.generate({
          prompt: 'Hello, world!',
        });

        expect(doGenerateOptions?.prompt).toMatchInlineSnapshot(`
          [
            {
              "content": "INSTRUCTIONS",
              "providerOptions": {
                "test": {
                  "value": "test",
                },
              },
              "role": "system",
            },
            {
              "content": "INSTRUCTIONS 2",
              "providerOptions": {
                "test": {
                  "value": "test 2",
                },
              },
              "role": "system",
            },
            {
              "content": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "providerOptions": undefined,
              "role": "user",
            },
          ]
        `);
      });
    });
  });

  describe('stream', () => {
    let doStreamOptions: LanguageModelV3CallOptions | undefined;
    let mockModel: MockLanguageModelV3;

    beforeEach(() => {
      doStreamOptions = undefined;
      mockModel = new MockLanguageModelV3({
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
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: {
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
                },
                providerMetadata: {
                  testProvider: { testKey: 'testValue' },
                },
              },
            ]),
          };
        },
      });
    });

    it('should use prepareCall', async () => {
      const agent = new ToolLoopAgent<{ value: string }>({
        model: mockModel,
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

    it('should pass abortSignal to streamText', async () => {
      const abortController = new AbortController();

      const agent = new ToolLoopAgent({
        model: mockModel,
      });

      const result = await agent.stream({
        prompt: 'Hello, world!',
        abortSignal: abortController.signal,
      });

      await result.consumeStream();

      expect(doStreamOptions?.abortSignal).toBe(abortController.signal);
    });

    it('should pass timeout to streamText', async () => {
      const agent = new ToolLoopAgent({
        model: mockModel,
      });

      const result = await agent.stream({
        prompt: 'Hello, world!',
        timeout: 5000,
      });

      await result.consumeStream();

      // timeout is merged into abortSignal, so we check that an abort signal was created
      expect(doStreamOptions?.abortSignal).toBeDefined();
    });

    it('should pass string instructions', async () => {
      const agent = new ToolLoopAgent({
        model: mockModel,
        instructions: 'INSTRUCTIONS',
      });

      const result = await agent.stream({
        prompt: 'Hello, world!',
      });

      await result.consumeStream();

      expect(doStreamOptions?.prompt).toMatchInlineSnapshot(`
        [
          {
            "content": "INSTRUCTIONS",
            "role": "system",
          },
          {
            "content": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "providerOptions": undefined,
            "role": "user",
          },
        ]
      `);
    });

    it('should pass system message instructions', async () => {
      const agent = new ToolLoopAgent({
        model: mockModel,
        instructions: {
          role: 'system',
          content: 'INSTRUCTIONS',
          providerOptions: { test: { value: 'test' } },
        },
      });

      const result = await agent.stream({
        prompt: 'Hello, world!',
      });

      await result.consumeStream();

      expect(doStreamOptions?.prompt).toMatchInlineSnapshot(`
      [
        {
          "content": "INSTRUCTIONS",
          "providerOptions": {
            "test": {
              "value": "test",
            },
          },
          "role": "system",
        },
        {
          "content": [
            {
              "text": "Hello, world!",
              "type": "text",
            },
          ],
          "providerOptions": undefined,
          "role": "user",
        },
      ]
    `);
    });
  });
});
