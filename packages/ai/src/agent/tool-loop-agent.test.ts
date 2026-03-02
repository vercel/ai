import { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
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

  describe('experimental_onStart', () => {
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
          model: new MockLanguageModelV3({
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
        let startEvent!: Parameters<ToolLoopAgentOnStartCallback>[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: 'You are a helpful assistant',
          temperature: 0.7,
          maxOutputTokens: 500,
          experimental_context: { userId: 'test-user' },
        });

        await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStart: async event => {
            startEvent = event;
          },
        });

        expect({
          model: startEvent.model,
          system: startEvent.system,
          prompt: startEvent.prompt,
          messages: startEvent.messages,
          temperature: startEvent.temperature,
          maxOutputTokens: startEvent.maxOutputTokens,
          experimental_context: startEvent.experimental_context,
        }).toMatchInlineSnapshot(`
          {
            "experimental_context": {
              "userId": "test-user",
            },
            "maxOutputTokens": 500,
            "messages": undefined,
            "model": {
              "modelId": "mock-model-id",
              "provider": "mock-provider",
            },
            "prompt": "Hello, world!",
            "system": "You are a helpful assistant",
            "temperature": 0.7,
          }
        `);
      });

      it('should pass messages when using messages option', async () => {
        let startEvent!: Parameters<ToolLoopAgentOnStartCallback>[0];

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
      let mockModel: MockLanguageModelV3;

      beforeEach(() => {
        mockModel = new MockLanguageModelV3({
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
        let startEvent!: Parameters<ToolLoopAgentOnStartCallback>[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: 'You are a helpful assistant',
          temperature: 0.7,
          maxOutputTokens: 500,
          experimental_context: { userId: 'test-user' },
        });

        const result = await agent.stream({
          prompt: 'Hello, world!',
          experimental_onStart: async event => {
            startEvent = event;
          },
        });

        await result.consumeStream();

        expect({
          model: startEvent.model,
          system: startEvent.system,
          prompt: startEvent.prompt,
          messages: startEvent.messages,
          temperature: startEvent.temperature,
          maxOutputTokens: startEvent.maxOutputTokens,
          experimental_context: startEvent.experimental_context,
        }).toMatchInlineSnapshot(`
          {
            "experimental_context": {
              "userId": "test-user",
            },
            "maxOutputTokens": 500,
            "messages": undefined,
            "model": {
              "modelId": "mock-model-id",
              "provider": "mock-provider",
            },
            "prompt": "Hello, world!",
            "system": "You are a helpful assistant",
            "temperature": 0.7,
          }
        `);
      });
    });
  });

  describe('experimental_onStepStart', () => {
    describe('generate', () => {
      let mockModel: MockLanguageModelV3;

      beforeEach(() => {
        mockModel = new MockLanguageModelV3({
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
          model: new MockLanguageModelV3({
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
        let stepStartEvent!: Parameters<ToolLoopAgentOnStepStartCallback>[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: 'You are a helpful assistant',
          experimental_context: { userId: 'test-user' },
        });

        await agent.generate({
          prompt: 'Hello, world!',
          experimental_onStepStart: async event => {
            stepStartEvent = event;
          },
        });

        expect({
          stepNumber: stepStartEvent.stepNumber,
          model: stepStartEvent.model,
          system: stepStartEvent.system,
          messagesLength: stepStartEvent.messages.length,
          steps: stepStartEvent.steps,
          experimental_context: stepStartEvent.experimental_context,
        }).toMatchInlineSnapshot(`
          {
            "experimental_context": {
              "userId": "test-user",
            },
            "messagesLength": 1,
            "model": {
              "modelId": "mock-model-id",
              "provider": "mock-provider",
            },
            "stepNumber": 0,
            "steps": [],
            "system": "You are a helpful assistant",
          }
        `);
      });
    });

    describe('stream', () => {
      let mockModel: MockLanguageModelV3;

      beforeEach(() => {
        mockModel = new MockLanguageModelV3({
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
        let stepStartEvent!: Parameters<ToolLoopAgentOnStepStartCallback>[0];

        const agent = new ToolLoopAgent({
          model: mockModel,
          instructions: 'You are a helpful assistant',
          experimental_context: { userId: 'test-user' },
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
          model: stepStartEvent.model,
          system: stepStartEvent.system,
          messagesLength: stepStartEvent.messages.length,
          steps: stepStartEvent.steps,
          experimental_context: stepStartEvent.experimental_context,
        }).toMatchInlineSnapshot(`
          {
            "experimental_context": {
              "userId": "test-user",
            },
            "messagesLength": 1,
            "model": {
              "modelId": "mock-model-id",
              "provider": "mock-provider",
            },
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
      let mockModel: MockLanguageModelV3;

      beforeEach(() => {
        mockModel = new MockLanguageModelV3({
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
      let mockModel: MockLanguageModelV3;

      beforeEach(() => {
        mockModel = new MockLanguageModelV3({
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
        return new MockLanguageModelV3({
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
          model: event.model,
          toolCallName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
          toolCallInput: event.toolCall.input,
          messagesLength: event.messages.length,
        }).toMatchInlineSnapshot(`
          {
            "messagesLength": 1,
            "model": {
              "modelId": "mock-model-id",
              "provider": "mock-provider",
            },
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
        return new MockLanguageModelV3({
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
        return new MockLanguageModelV3({
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
        return new MockLanguageModelV3({
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
          model: event.model,
          toolCallName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
          toolCallInput: event.toolCall.input,
          success: event.success,
          output: event.success ? event.output : undefined,
          messagesLength: event.messages.length,
        }).toMatchInlineSnapshot(`
          {
            "messagesLength": 1,
            "model": {
              "modelId": "mock-model-id",
              "provider": "mock-provider",
            },
            "output": "hello-result",
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
        return new MockLanguageModelV3({
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
      let mockModel: MockLanguageModelV3;

      beforeEach(() => {
        mockModel = new MockLanguageModelV3({
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
      let mockModel: MockLanguageModelV3;

      beforeEach(() => {
        mockModel = new MockLanguageModelV3({
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
});
