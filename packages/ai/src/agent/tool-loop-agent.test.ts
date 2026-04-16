import { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { ToolLoopAgent } from './tool-loop-agent';
import type {
  ToolLoopAgentOnFinishCallback,
  ToolLoopAgentOnStartCallback,
  ToolLoopAgentOnStepStartCallback,
  ToolLoopAgentOnToolCallFinishCallback,
  ToolLoopAgentOnToolCallStartCallback,
} from './tool-loop-agent-settings';

describe('ToolLoopAgent', () => {
  describe('generate', () => {
    let doGenerateOptions: LanguageModelV4CallOptions | undefined;
    let mockModel: MockLanguageModelV4;

    beforeEach(() => {
      doGenerateOptions = undefined;
      mockModel = new MockLanguageModelV4({
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

    describe('LanguageModelCallOptions forwarding', () => {
      it('should forward temperature to generateText', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
          temperature: 0.5,
        });

        await agent.generate({ prompt: 'test' });

        expect(doGenerateOptions?.temperature).toBe(0.5);
      });

      it('should forward maxOutputTokens to generateText', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
          maxOutputTokens: 256,
        });

        await agent.generate({ prompt: 'test' });

        expect(doGenerateOptions?.maxOutputTokens).toBe(256);
      });

      it('should forward topP to generateText', async () => {
        const agent = new ToolLoopAgent({ model: mockModel, topP: 0.9 });

        await agent.generate({ prompt: 'test' });

        expect(doGenerateOptions?.topP).toBe(0.9);
      });

      it('should forward topK to generateText', async () => {
        const agent = new ToolLoopAgent({ model: mockModel, topK: 40 });

        await agent.generate({ prompt: 'test' });

        expect(doGenerateOptions?.topK).toBe(40);
      });

      it('should forward presencePenalty to generateText', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
          presencePenalty: 0.1,
        });

        await agent.generate({ prompt: 'test' });

        expect(doGenerateOptions?.presencePenalty).toBe(0.1);
      });

      it('should forward frequencyPenalty to generateText', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
          frequencyPenalty: 0.2,
        });

        await agent.generate({ prompt: 'test' });

        expect(doGenerateOptions?.frequencyPenalty).toBe(0.2);
      });

      it('should forward stopSequences to generateText', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
          stopSequences: ['STOP', 'END'],
        });

        await agent.generate({ prompt: 'test' });

        expect(doGenerateOptions?.stopSequences).toEqual(['STOP', 'END']);
      });

      it('should forward seed to generateText', async () => {
        const agent = new ToolLoopAgent({ model: mockModel, seed: 42 });

        await agent.generate({ prompt: 'test' });

        expect(doGenerateOptions?.seed).toBe(42);
      });
    });

    describe('RequestOptions forwarding', () => {
      it('should forward headers to generateText', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
          headers: { 'x-custom': 'value' },
        });

        await agent.generate({ prompt: 'test' });

        expect(doGenerateOptions?.headers).toMatchObject({
          'x-custom': 'value',
        });
      });

      it('should honor toolNeedsApproval in generate', async () => {
        let modelCallCount = 0;
        const execute = vi.fn(async () => 'tool-result');

        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4({
            doGenerate: async () => {
              modelCallCount++;

              if (modelCallCount === 1) {
                return {
                  content: [
                    {
                      type: 'tool-call' as const,
                      toolCallType: 'function' as const,
                      toolCallId: 'call-1',
                      toolName: 'testTool',
                      input: '{ "value": "test" }',
                    },
                  ],
                  finishReason: {
                    unified: 'tool-calls' as const,
                    raw: undefined,
                  },
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
              }

              return {
                content: [{ type: 'text' as const, text: 'done' }],
                finishReason: { unified: 'stop' as const, raw: 'stop' },
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
          }),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute,
            }),
          },
          toolNeedsApproval: {
            testTool: true,
          },
        });

        const result = await agent.generate({ prompt: 'test' });

        expect(modelCallCount).toBe(1);
        expect(execute).not.toHaveBeenCalled();
        expect(result.response.messages).toMatchObject([
          {
            role: 'assistant',
            content: [
              { type: 'tool-call', toolCallId: 'call-1', toolName: 'testTool' },
              { type: 'tool-approval-request', toolCallId: 'call-1' },
            ],
          },
        ]);
      });
    });
  });

  describe('stream', () => {
    let doStreamOptions: LanguageModelV4CallOptions | undefined;
    let mockModel: MockLanguageModelV4;

    beforeEach(() => {
      doStreamOptions = undefined;
      mockModel = new MockLanguageModelV4({
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

    it('should honor toolNeedsApproval in stream', async () => {
      let modelCallCount = 0;
      const execute = vi.fn(async () => 'tool-result');

      const agent = new ToolLoopAgent({
        model: new MockLanguageModelV4({
          doStream: async () => {
            modelCallCount++;

            if (modelCallCount === 1) {
              return {
                stream: convertArrayToReadableStream([
                  { type: 'stream-start', warnings: [] },
                  {
                    type: 'response-metadata',
                    id: 'id-0',
                    modelId: 'mock-model-id',
                    timestamp: new Date(0),
                  },
                  {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'testTool',
                    input: '{ "value": "test" }',
                  },
                  {
                    type: 'finish',
                    finishReason: {
                      unified: 'tool-calls' as const,
                      raw: undefined,
                    },
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
                    providerMetadata: {},
                  },
                ]),
              };
            }

            return {
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'response-metadata',
                  id: 'id-1',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'done' },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop' as const, raw: 'stop' },
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
                  providerMetadata: {},
                },
              ]),
            };
          },
        }),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute,
          }),
        },
        toolNeedsApproval: {
          testTool: true,
        },
      });

      const result = await agent.stream({ prompt: 'test' });
      await result.consumeStream();

      expect(modelCallCount).toBe(1);
      expect(execute).not.toHaveBeenCalled();
      expect((await result.response).messages).toMatchObject([
        {
          role: 'assistant',
          content: [
            { type: 'tool-call', toolCallId: 'call-1', toolName: 'testTool' },
            { type: 'tool-approval-request', toolCallId: 'call-1' },
          ],
        },
      ]);
    });
  });

  describe('experimental_onStart', () => {
    describe('generate', () => {
      let doGenerateOptions: LanguageModelV4CallOptions | undefined;
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        doGenerateOptions = undefined;
        mockModel = new MockLanguageModelV4({
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

      it('should call experimental_onStart from constructor', async () => {
        const onStartCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          experimental_onStart: async () => {
            onStartCalls.push('constructor');
          },
        });

        await agent.generate({
          prompt: 'Hello, world!',
        });

        expect(onStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onStart from generate method', async () => {
        const onStartCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStart: async () => {
            onStartCalls.push('method');
          },
        });

        expect(onStartCalls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method experimental_onStart in correct order', async () => {
        const onStartCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          experimental_onStart: async () => {
            onStartCalls.push('constructor');
          },
        });

        await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStart: async () => {
            onStartCalls.push('method');
          },
        });

        expect(onStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should be called before doGenerate', async () => {
        const callOrder: string[] = [];

        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4({
            doGenerate: async () => {
              callOrder.push('doGenerate');
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
          }),
        });

        await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStart: async () => {
            callOrder.push('onStart');
          },
        });

        expect(callOrder).toMatchInlineSnapshot(`
          [
            "onStart",
            "doGenerate",
          ]
        `);
      });

      it('should not break generation when callback throws', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        const result = await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStart: async () => {
            throw new Error('callback error');
          },
        });

        expect(result.text).toBe('reply');
      });

      it('should pass correct event information', async () => {
        let startEvent!: Parameters<
          ToolLoopAgentOnStartCallback<{}, { userId: string }>
        >[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: 'You are a helpful assistant',
          temperature: 0.7,
          maxOutputTokens: 500,
          context: { userId: 'test-user' },
        });

        await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStart: async event => {
            startEvent = event;
          },
        });

        expect({
          provider: startEvent.provider,
          modelId: startEvent.modelId,
          system: startEvent.system,
          prompt: startEvent.prompt,
          messages: startEvent.messages,
          temperature: startEvent.temperature,
          maxOutputTokens: startEvent.maxOutputTokens,
          context: startEvent.context,
        }).toMatchInlineSnapshot(`
          {
            "context": {
              "userId": "test-user",
            },
            "maxOutputTokens": 500,
            "messages": undefined,
            "modelId": "mock-model-id",
            "prompt": "Hello, world!",
            "provider": "mock-provider",
            "system": "You are a helpful assistant",
            "temperature": 0.7,
          }
        `);
      });

      it('should pass messages when using messages option', async () => {
        let startEvent!: Parameters<ToolLoopAgentOnStartCallback<{}>>[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        await agent.generate({
          messages: [{ role: 'user', content: 'test-message' }],
          experimental_onStart: async event => {
            startEvent = event;
          },
        });

        expect(startEvent.prompt).toMatchInlineSnapshot(`undefined`);
        expect(startEvent.messages).toMatchInlineSnapshot(`
          [
            {
              "content": "test-message",
              "role": "user",
            },
          ]
        `);
      });
    });

    describe('stream', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doStream: async () => {
            return {
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
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

      it('should call experimental_onStart from constructor', async () => {
        const onStartCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          experimental_onStart: async () => {
            onStartCalls.push('constructor');
          },
        });

        const result = await agent.stream({ prompt: 'Hello, world!' });
        await result.consumeStream();

        expect(onStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onStart from stream method', async () => {
        const onStartCalls: string[] = [];

        const agent = new ToolLoopAgent({ model: mockModel });

        const result = await agent.stream({
          prompt: 'Hello, world!',
          experimental_onStart: async () => {
            onStartCalls.push('method');
          },
        });

        await result.consumeStream();

        expect(onStartCalls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method experimental_onStart in correct order', async () => {
        const onStartCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          experimental_onStart: async () => {
            onStartCalls.push('constructor');
          },
        });

        const result = await agent.stream({
          prompt: 'Hello, world!',
          experimental_onStart: async () => {
            onStartCalls.push('method');
          },
        });

        await result.consumeStream();

        expect(onStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass correct event information', async () => {
        let startEvent!: Parameters<
          ToolLoopAgentOnStartCallback<{}, { userId: string }>
        >[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: 'You are a helpful assistant',
          temperature: 0.7,
          maxOutputTokens: 500,
          context: { userId: 'test-user' },
        });

        const result = await agent.stream({
          prompt: 'Hello, world!',
          experimental_onStart: async event => {
            startEvent = event;
          },
        });

        await result.consumeStream();

        expect({
          provider: startEvent.provider,
          modelId: startEvent.modelId,
          system: startEvent.system,
          prompt: startEvent.prompt,
          messages: startEvent.messages,
          temperature: startEvent.temperature,
          maxOutputTokens: startEvent.maxOutputTokens,
          context: startEvent.context,
        }).toMatchInlineSnapshot(`
          {
            "context": {
              "userId": "test-user",
            },
            "maxOutputTokens": 500,
            "messages": undefined,
            "modelId": "mock-model-id",
            "prompt": "Hello, world!",
            "provider": "mock-provider",
            "system": "You are a helpful assistant",
            "temperature": 0.7,
          }
        `);
      });
    });
  });

  describe('experimental_onStepStart', () => {
    describe('generate', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doGenerate: async () => {
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

      it('should call experimental_onStepStart from constructor', async () => {
        const onStepStartCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          experimental_onStepStart: async () => {
            onStepStartCalls.push('constructor');
          },
        });

        await agent.generate({
          prompt: 'Hello, world!',
        });

        expect(onStepStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onStepStart from generate method', async () => {
        const onStepStartCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStepStart: async () => {
            onStepStartCalls.push('method');
          },
        });

        expect(onStepStartCalls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method experimental_onStepStart in correct order', async () => {
        const onStepStartCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          experimental_onStepStart: async () => {
            onStepStartCalls.push('constructor');
          },
        });

        await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStepStart: async () => {
            onStepStartCalls.push('method');
          },
        });

        expect(onStepStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should be called before doGenerate', async () => {
        const callOrder: string[] = [];

        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4({
            doGenerate: async () => {
              callOrder.push('doGenerate');
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
          }),
        });

        await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStepStart: async () => {
            callOrder.push('onStepStart');
          },
        });

        expect(callOrder).toMatchInlineSnapshot(`
          [
            "onStepStart",
            "doGenerate",
          ]
        `);
      });

      it('should not break generation when callback throws', async () => {
        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        const result = await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStepStart: async () => {
            throw new Error('callback error');
          },
        });

        expect(result.text).toBe('reply');
      });

      it('should pass correct event information', async () => {
        let stepStartEvent!: Parameters<
          ToolLoopAgentOnStepStartCallback<{}, { userId: string }>
        >[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: 'You are a helpful assistant',
          context: { userId: 'test-user' },
        });

        await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStepStart: async event => {
            stepStartEvent = event;
          },
        });

        expect({
          stepNumber: stepStartEvent.stepNumber,
          provider: stepStartEvent.provider,
          modelId: stepStartEvent.modelId,
          system: stepStartEvent.system,
          messagesLength: stepStartEvent.messages.length,
          steps: stepStartEvent.steps,
          context: stepStartEvent.context,
        }).toMatchInlineSnapshot(`
          {
            "context": {
              "userId": "test-user",
            },
            "messagesLength": 1,
            "modelId": "mock-model-id",
            "provider": "mock-provider",
            "stepNumber": 0,
            "steps": [],
            "system": "You are a helpful assistant",
          }
        `);
      });
    });

    describe('stream', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doStream: async () => {
            return {
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
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

      it('should call experimental_onStepStart from constructor', async () => {
        const onStepStartCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          experimental_onStepStart: async () => {
            onStepStartCalls.push('constructor');
          },
        });

        const result = await agent.stream({ prompt: 'Hello, world!' });
        await result.consumeStream();

        expect(onStepStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onStepStart from stream method', async () => {
        const onStepStartCalls: string[] = [];

        const agent = new ToolLoopAgent({ model: mockModel });

        const result = await agent.stream({
          prompt: 'Hello, world!',
          experimental_onStepStart: async () => {
            onStepStartCalls.push('method');
          },
        });

        await result.consumeStream();

        expect(onStepStartCalls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method experimental_onStepStart in correct order', async () => {
        const onStepStartCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          experimental_onStepStart: async () => {
            onStepStartCalls.push('constructor');
          },
        });

        const result = await agent.stream({
          prompt: 'Hello, world!',
          experimental_onStepStart: async () => {
            onStepStartCalls.push('method');
          },
        });

        await result.consumeStream();

        expect(onStepStartCalls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass correct event information', async () => {
        let stepStartEvent!: Parameters<
          ToolLoopAgentOnStepStartCallback<{}, { userId: string }>
        >[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: 'You are a helpful assistant',
          context: { userId: 'test-user' },
        });

        const result = await agent.stream({
          prompt: 'Hello, world!',
          experimental_onStepStart: async event => {
            stepStartEvent = event;
          },
        });

        await result.consumeStream();

        expect({
          stepNumber: stepStartEvent.stepNumber,
          provider: stepStartEvent.provider,
          modelId: stepStartEvent.modelId,
          system: stepStartEvent.system,
          messagesLength: stepStartEvent.messages.length,
          steps: stepStartEvent.steps,
          context: stepStartEvent.context,
        }).toMatchInlineSnapshot(`
          {
            "context": {
              "userId": "test-user",
            },
            "messagesLength": 1,
            "modelId": "mock-model-id",
            "provider": "mock-provider",
            "stepNumber": 0,
            "steps": [],
            "system": "You are a helpful assistant",
          }
        `);
      });
    });
  });

  describe('onStepFinish', () => {
    describe('generate', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doGenerate: async () => {
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

      it('should call onStepFinish from constructor', async () => {
        const onStepFinishCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          onStepFinish: async () => {
            onStepFinishCalls.push('constructor');
          },
        });

        await agent.generate({
          prompt: 'Hello, world!',
        });

        expect(onStepFinishCalls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call onStepFinish from generate method', async () => {
        const onStepFinishCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        await agent.generate({
          prompt: 'Hello, world!',
          onStepFinish: async () => {
            onStepFinishCalls.push('method');
          },
        });

        expect(onStepFinishCalls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method onStepFinish in correct order', async () => {
        const onStepFinishCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          onStepFinish: async () => {
            onStepFinishCalls.push('constructor');
          },
        });

        await agent.generate({
          prompt: 'Hello, world!',
          onStepFinish: async () => {
            onStepFinishCalls.push('method');
          },
        });

        expect(onStepFinishCalls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass stepResult to onStepFinish callback', async () => {
        let capturedStepResult: any;

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        await agent.generate({
          prompt: 'Hello, world!',
          onStepFinish: async stepResult => {
            capturedStepResult = stepResult;
          },
        });

        expect({
          finishReason: capturedStepResult.finishReason,
          stepNumber: capturedStepResult.stepNumber,
          text: capturedStepResult.text,
          inputTokens: capturedStepResult.usage.inputTokens,
          outputTokens: capturedStepResult.usage.outputTokens,
        }).toMatchInlineSnapshot(`
          {
            "finishReason": "stop",
            "inputTokens": 3,
            "outputTokens": 10,
            "stepNumber": 0,
            "text": "reply",
          }
        `);
      });
    });

    describe('stream', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doStream: async () => {
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

      it('should call onStepFinish from constructor', async () => {
        const onStepFinishCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          onStepFinish: async () => {
            onStepFinishCalls.push('constructor');
          },
        });

        const result = await agent.stream({
          prompt: 'Hello, world!',
        });

        await result.consumeStream();

        expect(onStepFinishCalls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call onStepFinish from stream method', async () => {
        const onStepFinishCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        const result = await agent.stream({
          prompt: 'Hello, world!',
          onStepFinish: async () => {
            onStepFinishCalls.push('method');
          },
        });

        await result.consumeStream();

        expect(onStepFinishCalls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method onStepFinish in correct order', async () => {
        const onStepFinishCalls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          onStepFinish: async () => {
            onStepFinishCalls.push('constructor');
          },
        });

        const result = await agent.stream({
          prompt: 'Hello, world!',
          onStepFinish: async () => {
            onStepFinishCalls.push('method');
          },
        });

        await result.consumeStream();

        expect(onStepFinishCalls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass stepResult to onStepFinish callback', async () => {
        let capturedStepResult: any;

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        const result = await agent.stream({
          prompt: 'Hello, world!',
          onStepFinish: async stepResult => {
            capturedStepResult = stepResult;
          },
        });

        await result.consumeStream();

        expect({
          finishReason: capturedStepResult.finishReason,
          stepNumber: capturedStepResult.stepNumber,
          text: capturedStepResult.text,
          inputTokens: capturedStepResult.usage.inputTokens,
          outputTokens: capturedStepResult.usage.outputTokens,
          providerMetadata: capturedStepResult.providerMetadata,
        }).toMatchInlineSnapshot(`
          {
            "finishReason": "stop",
            "inputTokens": 3,
            "outputTokens": 10,
            "providerMetadata": {
              "testProvider": {
                "testKey": "testValue",
              },
            },
            "stepNumber": 0,
            "text": "Hello, world!",
          }
        `);
      });
    });
  });

  describe('experimental_onToolCallStart', () => {
    describe('generate', () => {
      const dummyResponseValues = {
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

      function createToolCallMockModel() {
        let callCount = 0;
        return new MockLanguageModelV4({
          doGenerate: async () => {
            if (callCount++ === 0) {
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'tool-call' as const,
                    toolCallType: 'function' as const,
                    toolCallId: 'call-1',
                    toolName: 'testTool',
                    input: '{ "value": "test" }',
                  },
                ],
                finishReason: {
                  unified: 'tool-calls' as const,
                  raw: undefined,
                },
              };
            }
            return {
              ...dummyResponseValues,
              content: [{ type: 'text' as const, text: 'done' }],
              finishReason: { unified: 'stop' as const, raw: 'stop' },
            };
          },
        });
      }

      it('should call experimental_onToolCallStart from constructor', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallStart: async () => {
            calls.push('constructor');
          },
        });

        await agent.generate({ prompt: 'test' });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onToolCallStart from generate method', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        await agent.generate({
          prompt: 'test',
          experimental_onToolCallStart: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method in correct order', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallStart: async () => {
            calls.push('constructor');
          },
        });

        await agent.generate({
          prompt: 'test',
          experimental_onToolCallStart: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass correct event information', async () => {
        let event!: Parameters<ToolLoopAgentOnToolCallStartCallback<any>>[0];

        const agent = new ToolLoopAgent({
          model: createToolCallMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        await agent.generate({
          prompt: 'test',
          experimental_onToolCallStart: async e => {
            event = e;
          },
        });

        expect({
          stepNumber: event.stepNumber,
          provider: event.provider,
          modelId: event.modelId,
          toolCallName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
          toolCallInput: event.toolCall.input,
          messagesLength: event.messages.length,
        }).toMatchInlineSnapshot(`
          {
            "messagesLength": 1,
            "modelId": "mock-model-id",
            "provider": "mock-provider",
            "stepNumber": 0,
            "toolCallId": "call-1",
            "toolCallInput": {
              "value": "test",
            },
            "toolCallName": "testTool",
          }
        `);
      });
    });

    describe('stream', () => {
      const dummyStreamFinish = {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
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
        providerMetadata: {},
      };

      function createToolCallStreamMockModel() {
        let callCount = 0;
        return new MockLanguageModelV4({
          doStream: async () => {
            if (callCount++ === 0) {
              return {
                stream: convertArrayToReadableStream([
                  { type: 'stream-start', warnings: [] },
                  {
                    type: 'response-metadata',
                    id: 'id-0',
                    modelId: 'mock-model-id',
                    timestamp: new Date(0),
                  },
                  {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'testTool',
                    input: '{ "value": "test" }',
                  },
                  {
                    ...dummyStreamFinish,
                    finishReason: {
                      unified: 'tool-calls' as const,
                      raw: undefined,
                    },
                  },
                ]),
              };
            }
            return {
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'response-metadata',
                  id: 'id-1',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'done' },
                { type: 'text-end', id: '1' },
                dummyStreamFinish,
              ]),
            };
          },
        });
      }

      it('should call experimental_onToolCallStart from constructor', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallStart: async () => {
            calls.push('constructor');
          },
        });

        const result = await agent.stream({ prompt: 'test' });
        await result.consumeStream();

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onToolCallStart from stream method', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        const result = await agent.stream({
          prompt: 'test',
          experimental_onToolCallStart: async () => {
            calls.push('method');
          },
        });

        await result.consumeStream();

        expect(calls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method in correct order', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallStart: async () => {
            calls.push('constructor');
          },
        });

        const result = await agent.stream({
          prompt: 'test',
          experimental_onToolCallStart: async () => {
            calls.push('method');
          },
        });

        await result.consumeStream();

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass correct event information', async () => {
        let event!: Parameters<ToolLoopAgentOnToolCallStartCallback<any>>[0];

        const agent = new ToolLoopAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        const result = await agent.stream({
          prompt: 'test',
          experimental_onToolCallStart: async e => {
            event = e;
          },
        });

        await result.consumeStream();

        expect({
          toolCallName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
          toolCallInput: event.toolCall.input,
          messagesLength: event.messages.length,
        }).toMatchInlineSnapshot(`
          {
            "messagesLength": 1,
            "toolCallId": "call-1",
            "toolCallInput": {
              "value": "test",
            },
            "toolCallName": "testTool",
          }
        `);
      });
    });
  });

  describe('experimental_onToolCallFinish', () => {
    describe('generate', () => {
      const dummyResponseValues = {
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

      function createToolCallMockModel() {
        let callCount = 0;
        return new MockLanguageModelV4({
          doGenerate: async () => {
            if (callCount++ === 0) {
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'tool-call' as const,
                    toolCallType: 'function' as const,
                    toolCallId: 'call-1',
                    toolName: 'testTool',
                    input: '{ "value": "test" }',
                  },
                ],
                finishReason: {
                  unified: 'tool-calls' as const,
                  raw: undefined,
                },
              };
            }
            return {
              ...dummyResponseValues,
              content: [{ type: 'text' as const, text: 'done' }],
              finishReason: { unified: 'stop' as const, raw: 'stop' },
            };
          },
        });
      }

      function createToolCallMockModelWithInput(input: string) {
        let callCount = 0;
        return new MockLanguageModelV4({
          doGenerate: async () => {
            if (callCount++ === 0) {
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'tool-call' as const,
                    toolCallType: 'function' as const,
                    toolCallId: 'call-1',
                    toolName: 'testTool',
                    input,
                  },
                ],
                finishReason: {
                  unified: 'tool-calls' as const,
                  raw: undefined,
                },
              };
            }
            return {
              ...dummyResponseValues,
              content: [{ type: 'text' as const, text: 'done' }],
              finishReason: { unified: 'stop' as const, raw: 'stop' },
            };
          },
        });
      }

      it('should call experimental_onToolCallFinish from constructor', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallFinish: async () => {
            calls.push('constructor');
          },
        });

        await agent.generate({ prompt: 'test' });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onToolCallFinish from generate method', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        await agent.generate({
          prompt: 'test',
          experimental_onToolCallFinish: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method in correct order', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallFinish: async () => {
            calls.push('constructor');
          },
        });

        await agent.generate({
          prompt: 'test',
          experimental_onToolCallFinish: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass correct event information on success', async () => {
        let event!: Parameters<ToolLoopAgentOnToolCallFinishCallback>[0];

        const agent = new ToolLoopAgent({
          model: createToolCallMockModelWithInput('{ "value": "hello" }'),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        await agent.generate({
          prompt: 'test',
          experimental_onToolCallFinish: async e => {
            event = e;
          },
        });

        expect(event.durationMs).toBeGreaterThanOrEqual(0);
        expect({
          stepNumber: event.stepNumber,
          provider: event.provider,
          modelId: event.modelId,
          toolCallName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
          toolCallInput: event.toolCall.input,
          success: event.success,
          output: event.success ? event.output : undefined,
          messagesLength: event.messages.length,
        }).toMatchInlineSnapshot(`
          {
            "messagesLength": 1,
            "modelId": "mock-model-id",
            "output": "hello-result",
            "provider": "mock-provider",
            "stepNumber": 0,
            "success": true,
            "toolCallId": "call-1",
            "toolCallInput": {
              "value": "hello",
            },
            "toolCallName": "testTool",
          }
        `);
      });
    });

    describe('stream', () => {
      const dummyStreamFinish = {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
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
        providerMetadata: {},
      };

      function createToolCallStreamMockModel() {
        let callCount = 0;
        return new MockLanguageModelV4({
          doStream: async () => {
            if (callCount++ === 0) {
              return {
                stream: convertArrayToReadableStream([
                  { type: 'stream-start', warnings: [] },
                  {
                    type: 'response-metadata',
                    id: 'id-0',
                    modelId: 'mock-model-id',
                    timestamp: new Date(0),
                  },
                  {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'testTool',
                    input: '{ "value": "hello" }',
                  },
                  {
                    ...dummyStreamFinish,
                    finishReason: {
                      unified: 'tool-calls' as const,
                      raw: undefined,
                    },
                  },
                ]),
              };
            }
            return {
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'response-metadata',
                  id: 'id-1',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'done' },
                { type: 'text-end', id: '1' },
                dummyStreamFinish,
              ]),
            };
          },
        });
      }

      it('should call experimental_onToolCallFinish from constructor', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallFinish: async () => {
            calls.push('constructor');
          },
        });

        const result = await agent.stream({ prompt: 'test' });
        await result.consumeStream();

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call experimental_onToolCallFinish from stream method', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        const result = await agent.stream({
          prompt: 'test',
          experimental_onToolCallFinish: async () => {
            calls.push('method');
          },
        });

        await result.consumeStream();

        expect(calls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method in correct order', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_onToolCallFinish: async () => {
            calls.push('constructor');
          },
        });

        const result = await agent.stream({
          prompt: 'test',
          experimental_onToolCallFinish: async () => {
            calls.push('method');
          },
        });

        await result.consumeStream();

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass correct event information on success', async () => {
        let event!: Parameters<ToolLoopAgentOnToolCallFinishCallback>[0];

        const agent = new ToolLoopAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
        });

        const result = await agent.stream({
          prompt: 'test',
          experimental_onToolCallFinish: async e => {
            event = e;
          },
        });

        await result.consumeStream();

        expect(event.durationMs).toBeGreaterThanOrEqual(0);
        expect({
          toolCallName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
          toolCallInput: event.toolCall.input,
          success: event.success,
          output: event.success ? event.output : undefined,
          messagesLength: event.messages.length,
        }).toMatchInlineSnapshot(`
          {
            "messagesLength": 1,
            "output": "hello-result",
            "success": true,
            "toolCallId": "call-1",
            "toolCallInput": {
              "value": "hello",
            },
            "toolCallName": "testTool",
          }
        `);
      });
    });
  });

  describe('onFinish', () => {
    describe('generate', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doGenerate: async () => {
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

      it('should call onFinish from constructor', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          onFinish: async () => {
            calls.push('constructor');
          },
        });

        await agent.generate({ prompt: 'test' });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call onFinish from generate method', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        await agent.generate({
          prompt: 'test',
          onFinish: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method in correct order', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          onFinish: async () => {
            calls.push('constructor');
          },
        });

        await agent.generate({
          prompt: 'test',
          onFinish: async () => {
            calls.push('method');
          },
        });

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass correct event information', async () => {
        let event!: Parameters<ToolLoopAgentOnFinishCallback>[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        await agent.generate({
          prompt: 'test',
          onFinish: async e => {
            event = e;
          },
        });

        expect({
          text: event.text,
          finishReason: event.finishReason,
          stepsLength: event.steps.length,
          inputTokens: event.totalUsage.inputTokens,
          outputTokens: event.totalUsage.outputTokens,
        }).toMatchInlineSnapshot(`
          {
            "finishReason": "stop",
            "inputTokens": 3,
            "outputTokens": 10,
            "stepsLength": 1,
            "text": "reply",
          }
        `);
      });
    });

    describe('stream', () => {
      let mockModel: MockLanguageModelV4;

      beforeEach(() => {
        mockModel = new MockLanguageModelV4({
          doStream: async () => {
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
                { type: 'text-delta', id: '1', delta: 'world!' },
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

      it('should call onFinish from constructor', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          onFinish: async () => {
            calls.push('constructor');
          },
        });

        const result = await agent.stream({ prompt: 'test' });
        await result.consumeStream();

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
          ]
        `);
      });

      it('should call onFinish from stream method', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        const result = await agent.stream({
          prompt: 'test',
          onFinish: async () => {
            calls.push('method');
          },
        });

        await result.consumeStream();

        expect(calls).toMatchInlineSnapshot(`
          [
            "method",
          ]
        `);
      });

      it('should call both constructor and method in correct order', async () => {
        const calls: string[] = [];

        const agent = new ToolLoopAgent({
          model: mockModel,
          onFinish: async () => {
            calls.push('constructor');
          },
        });

        const result = await agent.stream({
          prompt: 'test',
          onFinish: async () => {
            calls.push('method');
          },
        });

        await result.consumeStream();

        expect(calls).toMatchInlineSnapshot(`
          [
            "constructor",
            "method",
          ]
        `);
      });

      it('should pass correct event information', async () => {
        let event!: Parameters<ToolLoopAgentOnFinishCallback>[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
        });

        const result = await agent.stream({
          prompt: 'test',
          onFinish: async e => {
            event = e;
          },
        });

        await result.consumeStream();

        expect({
          text: event.text,
          finishReason: event.finishReason,
          stepsLength: event.steps.length,
          inputTokens: event.totalUsage.inputTokens,
          outputTokens: event.totalUsage.outputTokens,
        }).toMatchInlineSnapshot(`
          {
            "finishReason": "stop",
            "inputTokens": 3,
            "outputTokens": 10,
            "stepsLength": 1,
            "text": "Hello, world!",
          }
        `);
      });
    });
  });

  describe('telemetry integrations', () => {
    afterEach(() => {
      globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
    });

    describe('generate', () => {
      const dummyResponseValues = {
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

      function createToolCallMockModel() {
        let callCount = 0;
        return new MockLanguageModelV4({
          doGenerate: async () => {
            if (callCount++ === 0) {
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'tool-call' as const,
                    toolCallType: 'function' as const,
                    toolCallId: 'call-1',
                    toolName: 'testTool',
                    input: '{ "value": "test" }',
                  },
                ],
                finishReason: {
                  unified: 'tool-calls' as const,
                  raw: undefined,
                },
              };
            }
            return {
              ...dummyResponseValues,
              content: [{ type: 'text' as const, text: 'done' }],
              finishReason: { unified: 'stop' as const, raw: 'stop' },
            };
          },
        });
      }

      it('should call per-call integration listeners for all lifecycle events', async () => {
        const events: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_telemetry: {
            integrations: {
              onStart: async () => {
                events.push('onStart');
              },
              onStepStart: async () => {
                events.push('onStepStart');
              },
              onToolCallStart: async () => {
                events.push('onToolCallStart');
              },
              onToolCallFinish: async () => {
                events.push('onToolCallFinish');
              },
              onStepFinish: async () => {
                events.push('onStepFinish');
              },
              onFinish: async () => {
                events.push('onFinish');
              },
            },
          },
        });

        await agent.generate({ prompt: 'test' });

        expect(events).toEqual([
          'onStart',
          'onStepStart',
          'onToolCallStart',
          'onToolCallFinish',
          'onStepFinish',
          'onStepStart',
          'onStepFinish',
          'onFinish',
        ]);
      });

      it('should call globally registered integration listeners', async () => {
        const events: string[] = [];

        globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [
          {
            onStart: async () => {
              events.push('global-onStart');
            },
            onStepFinish: async () => {
              events.push('global-onStepFinish');
            },
            onFinish: async () => {
              events.push('global-onFinish');
            },
          },
        ];

        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4({
            doGenerate: async () => ({
              content: [{ type: 'text' as const, text: 'Hello!' }],
              ...dummyResponseValues,
              finishReason: { unified: 'stop' as const, raw: 'stop' },
            }),
          }),
        });

        await agent.generate({ prompt: 'test' });

        expect(events).toEqual([
          'global-onStart',
          'global-onStepFinish',
          'global-onFinish',
        ]);
      });

      it('should call integration listeners alongside agent callbacks', async () => {
        const events: string[] = [];

        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4({
            doGenerate: async () => ({
              content: [{ type: 'text' as const, text: 'Hello!' }],
              ...dummyResponseValues,
              finishReason: { unified: 'stop' as const, raw: 'stop' },
            }),
          }),
          experimental_onStart: async () => {
            events.push('agent-onStart');
          },
          onStepFinish: async () => {
            events.push('agent-onStepFinish');
          },
          onFinish: async () => {
            events.push('agent-onFinish');
          },
          experimental_telemetry: {
            integrations: {
              onStart: async () => {
                events.push('integration-onStart');
              },
              onStepFinish: async () => {
                events.push('integration-onStepFinish');
              },
              onFinish: async () => {
                events.push('integration-onFinish');
              },
            },
          },
        });

        await agent.generate({ prompt: 'test' });

        expect(events).toEqual([
          'agent-onStart',
          'integration-onStart',
          'agent-onStepFinish',
          'integration-onStepFinish',
          'agent-onFinish',
          'integration-onFinish',
        ]);
      });

      it('should not break generation when an integration listener throws', async () => {
        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4({
            doGenerate: async () => ({
              content: [{ type: 'text' as const, text: 'Hello!' }],
              ...dummyResponseValues,
              finishReason: { unified: 'stop' as const, raw: 'stop' },
            }),
          }),
          experimental_telemetry: {
            integrations: {
              onStart: async () => {
                throw new Error('integration error');
              },
              onStepFinish: async () => {
                throw new Error('integration error');
              },
              onFinish: async () => {
                throw new Error('integration error');
              },
            },
          },
        });

        const result = await agent.generate({ prompt: 'test' });

        expect(result.text).toBe('Hello!');
      });
    });

    describe('stream', () => {
      const dummyStreamFinish = {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
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
        providerMetadata: {},
      };

      function createToolCallStreamMockModel() {
        let callCount = 0;
        return new MockLanguageModelV4({
          doStream: async () => {
            if (callCount++ === 0) {
              return {
                stream: convertArrayToReadableStream([
                  { type: 'stream-start', warnings: [] },
                  {
                    type: 'response-metadata',
                    id: 'id-0',
                    modelId: 'mock-model-id',
                    timestamp: new Date(0),
                  },
                  {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'testTool',
                    input: '{ "value": "test" }',
                  },
                  {
                    ...dummyStreamFinish,
                    finishReason: {
                      unified: 'tool-calls' as const,
                      raw: undefined,
                    },
                  },
                ]),
              };
            }
            return {
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'response-metadata',
                  id: 'id-1',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'done' },
                { type: 'text-end', id: '1' },
                dummyStreamFinish,
              ]),
            };
          },
        });
      }

      it('should call per-call integration listeners for all lifecycle events', async () => {
        const events: string[] = [];

        const agent = new ToolLoopAgent({
          model: createToolCallStreamMockModel(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async ({ value }: { value: string }) =>
                `${value}-result`,
            }),
          },
          experimental_telemetry: {
            integrations: {
              onStart: async () => {
                events.push('onStart');
              },
              onStepStart: async () => {
                events.push('onStepStart');
              },
              onToolCallStart: async () => {
                events.push('onToolCallStart');
              },
              onToolCallFinish: async () => {
                events.push('onToolCallFinish');
              },
              onStepFinish: async () => {
                events.push('onStepFinish');
              },
              onFinish: async () => {
                events.push('onFinish');
              },
            },
          },
        });

        const result = await agent.stream({ prompt: 'test' });
        await result.consumeStream();

        expect(events).toEqual([
          'onStart',
          'onStepStart',
          'onToolCallStart',
          'onToolCallFinish',
          'onStepFinish',
          'onStepStart',
          'onStepFinish',
          'onFinish',
        ]);
      });

      it('should call globally registered integration listeners', async () => {
        const events: string[] = [];

        globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [
          {
            onStart: async () => {
              events.push('global-onStart');
            },
            onStepFinish: async () => {
              events.push('global-onStepFinish');
            },
            onFinish: async () => {
              events.push('global-onFinish');
            },
          },
        ];

        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello!' },
                { type: 'text-end', id: '1' },
                dummyStreamFinish,
              ]),
            }),
          }),
        });

        const result = await agent.stream({ prompt: 'test' });
        await result.consumeStream();

        expect(events).toEqual([
          'global-onStart',
          'global-onStepFinish',
          'global-onFinish',
        ]);
      });

      it('should call integration listeners alongside agent callbacks', async () => {
        const events: string[] = [];

        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello!' },
                { type: 'text-end', id: '1' },
                dummyStreamFinish,
              ]),
            }),
          }),
          experimental_onStart: async () => {
            events.push('agent-onStart');
          },
          onStepFinish: async () => {
            events.push('agent-onStepFinish');
          },
          onFinish: async () => {
            events.push('agent-onFinish');
          },
          experimental_telemetry: {
            integrations: {
              onStart: async () => {
                events.push('integration-onStart');
              },
              onStepFinish: async () => {
                events.push('integration-onStepFinish');
              },
              onFinish: async () => {
                events.push('integration-onFinish');
              },
            },
          },
        });

        const result = await agent.stream({ prompt: 'test' });
        await result.consumeStream();

        expect(events).toEqual([
          'agent-onStart',
          'integration-onStart',
          'agent-onStepFinish',
          'integration-onStepFinish',
          'agent-onFinish',
          'integration-onFinish',
        ]);
      });

      it('should not break streaming when an integration listener throws', async () => {
        const agent = new ToolLoopAgent({
          model: new MockLanguageModelV4({
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello!' },
                { type: 'text-end', id: '1' },
                dummyStreamFinish,
              ]),
            }),
          }),
          experimental_telemetry: {
            integrations: {
              onStart: async () => {
                throw new Error('integration error');
              },
              onStepFinish: async () => {
                throw new Error('integration error');
              },
              onFinish: async () => {
                throw new Error('integration error');
              },
            },
          },
        });

        const result = await agent.stream({ prompt: 'test' });
        await result.consumeStream();

        expect(await result.text).toBe('Hello!');
      });
    });
  });
});
