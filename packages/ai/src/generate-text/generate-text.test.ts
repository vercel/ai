import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2FunctionTool,
  LanguageModelV2ProviderDefinedTool,
} from '@ai-sdk/provider';
import {
  type ModelMessage,
  dynamicTool,
  jsonSchema,
  tool,
} from '@ai-sdk/provider-utils';
import { mockId } from '@ai-sdk/provider-utils/test';
import {
  afterEach,
  assert,
  assertType,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  vitest,
} from 'vitest';
import { z } from 'zod/v4';
import { Output } from '.';
import * as logWarningsModule from '../logger/log-warnings';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { MockTracer } from '../test/mock-tracer';
import { generateText } from './generate-text';
import type { GenerateTextResult } from './generate-text-result';
import type { StepResult } from './step-result';
import { stepCountIs } from './stop-condition';

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

const dummyResponseValues = {
  finishReason: 'stop' as const,
  usage: {
    inputTokens: 3,
    outputTokens: 10,
    totalTokens: 13,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  },
  warnings: [],
};

describe('abort signal handling', () => {
  it('should reject when the abort signal fires during tool execution', async () => {
    const abortController = new AbortController();
    const abortError = new DOMException('tool execution aborted', 'AbortError');
    let modelCallCount = 0;

    const result = generateText({
      model: new MockLanguageModelV2({
        doGenerate: async () => {
          modelCallCount++;

          if (modelCallCount === 1) {
            return {
              ...dummyResponseValues,
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: `{ "value": "value" }`,
                },
              ],
            };
          }

          return {
            ...dummyResponseValues,
            content: [],
            finishReason: 'other',
          };
        },
      }),
      tools: {
        tool1: {
          inputSchema: z.object({ value: z.string() }),
          execute: async (_input, { abortSignal }) => {
            abortController.abort(abortError);
            abortSignal?.throwIfAborted();
          },
        },
      },
      prompt: 'test-input',
      abortSignal: abortController.signal,
      stopWhen: stepCountIs(10),
      maxRetries: 0,
    });

    await expect(result).rejects.toMatchInlineSnapshot(
      `[AbortError: tool execution aborted]`,
    );
    expect(modelCallCount).toBe(1);
  });

  it('should reject before another model call when a tool completes after cancellation', async () => {
    const abortController = new AbortController();
    const abortError = new DOMException('tool execution aborted', 'AbortError');
    let modelCallCount = 0;

    const result = generateText({
      model: new MockLanguageModelV2({
        doGenerate: async () => {
          modelCallCount++;

          if (modelCallCount === 1) {
            return {
              ...dummyResponseValues,
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: `{ "value": "value" }`,
                },
              ],
            };
          }

          return {
            ...dummyResponseValues,
            content: [],
            finishReason: 'other',
          };
        },
      }),
      tools: {
        tool1: {
          inputSchema: z.object({ value: z.string() }),
          execute: async () => {
            abortController.abort(abortError);
            return 'tool result';
          },
        },
      },
      prompt: 'test-input',
      abortSignal: abortController.signal,
      stopWhen: stepCountIs(10),
      maxRetries: 0,
    });

    await expect(result).rejects.toMatchInlineSnapshot(
      `[AbortError: tool execution aborted]`,
    );
    expect(modelCallCount).toBe(1);
  });
});

const modelWithSources = new MockLanguageModelV2({
  doGenerate: {
    ...dummyResponseValues,
    content: [
      { type: 'text', text: 'Hello, world!' },
      {
        type: 'source',
        sourceType: 'url',
        id: '123',
        url: 'https://example.com',
        title: 'Example',
        providerMetadata: { provider: { custom: 'value' } },
      },
      {
        type: 'source',
        sourceType: 'url',
        id: '456',
        url: 'https://example.com/2',
        title: 'Example 2',
        providerMetadata: { provider: { custom: 'value2' } },
      },
    ],
  },
});

const modelWithFiles = new MockLanguageModelV2({
  doGenerate: {
    ...dummyResponseValues,
    content: [
      { type: 'text', text: 'Hello, world!' },
      {
        type: 'file',
        data: new Uint8Array([1, 2, 3]),
        mediaType: 'image/png',
      },
      {
        type: 'file',
        data: 'QkFVRw==',
        mediaType: 'image/jpeg',
      },
    ],
  },
});

const modelWithReasoning = new MockLanguageModelV2({
  doGenerate: {
    ...dummyResponseValues,
    content: [
      {
        type: 'reasoning',
        text: 'I will open the conversation with witty banter.',
        providerMetadata: {
          testProvider: {
            signature: 'signature',
          },
        },
      },
      {
        type: 'reasoning',
        text: '',
        providerMetadata: {
          testProvider: {
            redactedData: 'redacted-reasoning-data',
          },
        },
      },
      { type: 'text', text: 'Hello, world!' },
    ],
  },
});

describe('generateText', () => {
  let logWarningsSpy: ReturnType<typeof vitest.spyOn>;

  beforeEach(() => {
    logWarningsSpy = vitest
      .spyOn(logWarningsModule, 'logWarnings')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    logWarningsSpy.mockRestore();
  });

  it('should reject calls to inactive tools without executing them', async () => {
    const execute = vi.fn(async () => 'result');
    let providerToolCount: number | undefined;

    const result = await generateText({
      model: new MockLanguageModelV2({
        doGenerate: async ({ tools }) => {
          providerToolCount = tools?.length;

          return {
            ...dummyResponseValues,
            finishReason: 'tool-calls',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'weather',
                input: JSON.stringify({ location: 'Basel' }),
              },
            ],
          };
        },
      }),
      tools: {
        weather: tool({
          inputSchema: z.object({ location: z.string() }),
          execute,
        }),
      },
      prompt: 'test-input',
      activeTools: [],
    });

    const [toolCall] = result.toolCalls;

    expect({
      executeCallCount: execute.mock.calls.length,
      providerToolCount,
      toolCall: {
        type: toolCall.type,
        toolName: toolCall.toolName,
        invalid: toolCall.invalid,
        error: toolCall.invalid ? toolCall.error : undefined,
      },
      toolResults: result.toolResults,
    }).toMatchInlineSnapshot(`
      {
        "executeCallCount": 0,
        "providerToolCount": 0,
        "toolCall": {
          "error": [AI_NoSuchToolError: Model tried to call unavailable tool 'weather'. Available tools: .],
          "invalid": true,
          "toolName": "weather",
          "type": "tool-call",
        },
        "toolResults": [],
      }
    `);
  });

  describe('result.content', () => {
    it('should generate content', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: {
            ...dummyResponseValues,
            content: [
              { type: 'text', text: 'Hello, world!' },
              {
                type: 'source',
                sourceType: 'url',
                id: '123',
                url: 'https://example.com',
                title: 'Example',
                providerMetadata: { provider: { custom: 'value' } },
              },
              {
                type: 'file',
                data: new Uint8Array([1, 2, 3]),
                mediaType: 'image/png',
              },
              {
                type: 'reasoning',
                text: 'I will open the conversation with witty banter.',
              },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
              { type: 'text', text: 'More text' },
            ],
          },
        }),
        prompt: 'prompt',
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async args => {
              expect(args).toStrictEqual({ value: 'value' });
              return 'result1';
            },
          },
        },
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "Hello, world!",
            "type": "text",
          },
          {
            "id": "123",
            "providerMetadata": {
              "provider": {
                "custom": "value",
              },
            },
            "sourceType": "url",
            "title": "Example",
            "type": "source",
            "url": "https://example.com",
          },
          {
            "file": DefaultGeneratedFile {
              "base64Data": "AQID",
              "mediaType": "image/png",
              "uint8ArrayData": Uint8Array [
                1,
                2,
                3,
              ],
            },
            "type": "file",
          },
          {
            "text": "I will open the conversation with witty banter.",
            "type": "reasoning",
          },
          {
            "input": {
              "value": "value",
            },
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-call",
          },
          {
            "text": "More text",
            "type": "text",
          },
          {
            "dynamic": false,
            "input": {
              "value": "value",
            },
            "output": "result1",
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-result",
          },
        ]
      `);
    });
  });

  describe('result.text', () => {
    it('should generate text', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
          },
        }),
        prompt: 'prompt',
      });

      expect(modelWithSources.doGenerateCalls).toMatchSnapshot();
      expect(result.text).toStrictEqual('Hello, world!');
    });
  });

  describe('result.reasoningText', () => {
    it('should contain reasoning string from model response', async () => {
      const result = await generateText({
        model: modelWithReasoning,
        prompt: 'prompt',
      });

      expect(result.reasoningText).toStrictEqual(
        'I will open the conversation with witty banter.',
      );
    });
  });

  describe('result.sources', () => {
    it('should contain sources', async () => {
      const result = await generateText({
        model: modelWithSources,
        prompt: 'prompt',
      });

      expect(result.sources).toMatchSnapshot();
    });
  });

  describe('result.files', () => {
    it('should contain files', async () => {
      const result = await generateText({
        model: modelWithFiles,
        prompt: 'prompt',
      });

      expect(result.files).toMatchSnapshot();
    });
  });

  describe('result.steps', () => {
    it('should add the reasoning from the model response to the step result', async () => {
      const result = await generateText({
        model: modelWithReasoning,
        prompt: 'prompt',
        _internal: {
          generateId: mockId({ prefix: 'id' }),
          currentDate: () => new Date(0),
        },
      });

      expect(result.steps).toMatchSnapshot();
    });

    it('should contain sources', async () => {
      const result = await generateText({
        model: modelWithSources,
        prompt: 'prompt',
        _internal: {
          generateId: mockId({ prefix: 'id' }),
          currentDate: () => new Date(0),
        },
      });

      expect(result.steps).toMatchSnapshot();
    });

    it('should contain files', async () => {
      const result = await generateText({
        model: modelWithFiles,
        prompt: 'prompt',
        _internal: {
          generateId: mockId({ prefix: 'id' }),
          currentDate: () => new Date(0),
        },
      });

      expect(result.steps).toMatchSnapshot();
    });
  });

  describe('result.toolCalls', () => {
    it('should contain tool calls', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({ prompt, tools, toolChoice }) => {
            expect(tools).toStrictEqual([
              {
                type: 'function',
                name: 'tool1',
                description: undefined,
                inputSchema: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
                providerOptions: undefined,
              },
              {
                type: 'function',
                name: 'tool2',
                description: undefined,
                inputSchema: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { somethingElse: { type: 'string' } },
                  required: ['somethingElse'],
                  type: 'object',
                },
                providerOptions: undefined,
              },
            ]);

            expect(toolChoice).toStrictEqual({ type: 'required' });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerOptions: undefined,
              },
            ]);

            return {
              ...dummyResponseValues,
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: `{ "value": "value" }`,
                },
              ],
            };
          },
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
          },
          // 2nd tool to show typing:
          tool2: {
            inputSchema: z.object({ somethingElse: z.string() }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
      });

      // test type inference
      if (
        result.toolCalls[0].toolName === 'tool1' &&
        !result.toolCalls[0].dynamic
      ) {
        assertType<string>(result.toolCalls[0].input.value);
      }

      expect(result.toolCalls).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "value",
            },
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-call",
          },
        ]
      `);
    });
  });

  describe('result.toolResults', () => {
    it('should contain tool results', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({ prompt, tools, toolChoice }) => {
            expect(tools).toStrictEqual([
              {
                type: 'function',
                name: 'tool1',
                description: undefined,
                inputSchema: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
                providerOptions: undefined,
              },
            ]);

            expect(toolChoice).toStrictEqual({ type: 'auto' });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerOptions: undefined,
              },
            ]);

            return {
              ...dummyResponseValues,
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: `{ "value": "value" }`,
                },
              ],
            };
          },
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async args => {
              expect(args).toStrictEqual({ value: 'value' });
              return 'result1';
            },
          },
        },
        prompt: 'test-input',
      });

      // test type inference
      if (
        result.toolResults[0].toolName === 'tool1' &&
        !result.toolResults[0].dynamic
      ) {
        assertType<string>(result.toolResults[0].output);
      }

      expect(result.toolResults).toMatchInlineSnapshot(`
        [
          {
            "dynamic": false,
            "input": {
              "value": "value",
            },
            "output": "result1",
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-result",
          },
        ]
      `);
    });
  });

  describe('result.providerMetadata', () => {
    it('should contain provider metadata', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [],
            providerMetadata: {
              exampleProvider: {
                a: 10,
                b: 20,
              },
            },
          }),
        }),
        prompt: 'test-input',
      });

      expect(result.providerMetadata).toStrictEqual({
        exampleProvider: {
          a: 10,
          b: 20,
        },
      });
    });
  });

  describe('result.response.messages', () => {
    it('should contain assistant response message when there are no tool calls', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
          }),
        }),
        prompt: 'test-input',
      });

      expect(result.response.messages).toMatchSnapshot();
    });

    it('should contain assistant response message and tool message when there are tool calls with results', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              { type: 'text', text: 'Hello, world!' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
            ],
          }),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async (args, options) => {
              expect(args).toStrictEqual({ value: 'value' });
              expect(options.messages).toStrictEqual([
                { role: 'user', content: 'test-input' },
              ]);
              return 'result1';
            },
          },
        },
        prompt: 'test-input',
      });

      expect(result.response.messages).toMatchSnapshot();
    });

    it('should contain reasoning', async () => {
      const result = await generateText({
        model: modelWithReasoning,
        prompt: 'test-input',
      });

      expect(result.response.messages).toMatchSnapshot();
    });
  });

  describe('result.request', () => {
    it('should contain request body', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({}) => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
            request: {
              body: 'test body',
            },
          }),
        }),
        prompt: 'prompt',
      });

      expect(result.request).toStrictEqual({
        body: 'test body',
      });
    });
  });

  describe('result.response', () => {
    it('should contain response body and headers', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({}) => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
            response: {
              id: 'test-id-from-model',
              timestamp: new Date(10000),
              modelId: 'test-response-model-id',
              headers: {
                'custom-response-header': 'response-header-value',
              },
              body: 'test body',
            },
          }),
        }),
        prompt: 'prompt',
      });

      expect(result.steps[0].response).toMatchSnapshot();
      expect(result.response).toMatchSnapshot();
    });
  });

  /*
  describe('options.onStart', () => {
    it('should send correct information with text prompt', async () => {
      let startEvent!: Parameters<
        GenerateTextOnStartCallback<any, any, any>
      >[0];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello, World!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        telemetry: {
          functionId: 'test-function',
        },
        _internal: {
          generateId: () => 'test-call-id',
          generateCallId: () => 'test-telemetry-call-id',
        },
        onStart: async event => {
          startEvent = event;
        },
      });

      expect(startEvent).toMatchSnapshot();
    });

    it('should pass runtimeContext', async () => {
      let startEvent!: Parameters<
        GenerateTextOnStartCallback<any, any, any>
      >[0];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        runtimeContext: { userId: 'test-user', sessionId: '123' },
        onStart: async event => {
          startEvent = event;
        },
      });

      expect(startEvent.runtimeContext).toEqual({
        userId: 'test-user',
        sessionId: '123',
      });
    });

    it('should accept deprecated experimental_telemetry as an alias for telemetry', async () => {
      let startEvent!: Parameters<
        GenerateTextOnStartCallback<any, any, any>
      >[0];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'deprecated-fn',
        },
        onStart: async event => {
          startEvent = event;
        },
      });

      expect(startEvent).not.toHaveProperty('isEnabled');
      expect(startEvent).not.toHaveProperty('functionId');
    });

    it('should send correct information with system and messages', async () => {
      let startEvent!: Parameters<
        GenerateTextOnStartCallback<any, any, any>
      >[0];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        instructions: 'you are a helpful assistant',
        messages: [{ role: 'user', content: 'test-message' }],
        maxOutputTokens: 100,
        temperature: 0.5,
        onStart: async event => {
          startEvent = event;
        },
      });

      expect(startEvent.provider).toBe('mock-provider');
      expect(startEvent.modelId).toBe('mock-model-id');
      expect(startEvent.instructions).toBe('you are a helpful assistant');
      expect(startEvent.messages).toEqual([
        { role: 'user', content: 'test-message' },
      ]);
      expect(startEvent.maxOutputTokens).toBe(100);
      expect(startEvent.temperature).toBe(0.5);
      expect(startEvent.maxRetries).toBe(2);
    });

    it('should reject system messages in messages by default', async () => {
      await expect(async () => {
        await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async () => ({
              content: [{ type: 'text', text: 'Hello!' }],
              ...dummyResponseValues,
            }),
          }),
          messages: [{ role: 'system', content: 'INSTRUCTIONS' }],
        });
      }).rejects.toThrow(InvalidPromptError);
    });

    it('should allow system messages in messages when allowSystemInMessages is true', async () => {
      const model = new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [{ type: 'text', text: 'Hello!' }],
          ...dummyResponseValues,
        }),
      });

      await generateText({
        model,
        allowSystemInMessages: true,
        messages: [{ role: 'system', content: 'INSTRUCTIONS' }],
      });

      expect(model.doGenerateCalls[0].prompt).toEqual([
        { role: 'system', content: 'INSTRUCTIONS' },
      ]);
    });

    it('should be called before doGenerate', async () => {
      const callOrder: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            callOrder.push('doGenerate');
            return {
              content: [{ type: 'text', text: 'Hello!' }],
              ...dummyResponseValues,
            };
          },
        }),
        prompt: 'test-input',
        onStart: async () => {
          callOrder.push('onStart');
        },
      });

      expect(callOrder).toEqual(['onStart', 'doGenerate']);
    });

    it('should not break generation when callback throws', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello, World!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        onStart: async () => {
          throw new Error('callback error');
        },
      });

      expect(result.text).toBe('Hello, World!');
    });
  });

  describe('options.onStepStart', () => {
    it('should be called with correct data for a single step', async () => {
      let stepStartEvent!: Parameters<
        GenerateTextOnStepStartCallback<any, any>
      >[0];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        onStepStart: async event => {
          stepStartEvent = event;
        },
      });

      expect(stepStartEvent.stepNumber).toBe(0);
      expect(stepStartEvent.steps.length).toBe(0);
      expect(stepStartEvent.provider).toBe('mock-provider');
      expect(stepStartEvent.modelId).toBe('mock-model-id');
      expect(stepStartEvent.messages).toEqual([
        {
          role: 'user',
          content: 'test-input',
        },
      ]);
      expect(stepStartEvent.steps).toEqual([]);
    });

    it('should be called once per step in a multi-step tool loop', async () => {
      const stepStartEvents: Parameters<
        GenerateTextOnStepStartCallback<any, any>
      >[0][] = [];
      let responseCount = 0;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            switch (responseCount++) {
              case 0:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      input: '{ "value": "test" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 1:
              default:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Final answer.' }],
                };
            }
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        stopWhen: isStepCount(3),
        onStepStart: async event => {
          stepStartEvents.push(event);
        },
      });

      expect(stepStartEvents.length).toBe(2);
      expect(stepStartEvents[0].stepNumber).toBe(0);
      expect(stepStartEvents[0].steps.length).toBe(0);
      expect(stepStartEvents[1].stepNumber).toBe(1);
      expect(stepStartEvents[1].steps.length).toBe(1);
    });

    it('should be called before doGenerate on each step', async () => {
      const callOrder: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            callOrder.push('doGenerate');
            return {
              content: [{ type: 'text', text: 'Hello!' }],
              ...dummyResponseValues,
            };
          },
        }),
        prompt: 'test-input',
        onStepStart: async () => {
          callOrder.push('onStepStart');
        },
      });

      expect(callOrder).toEqual(['onStepStart', 'doGenerate']);
    });

    it('should not break generation when callback throws', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello, World!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        onStepStart: async () => {
          throw new Error('callback error');
        },
      });

      expect(result.text).toBe('Hello, World!');
    });

    it('should reflect model changes from prepareStep', async () => {
      const stepStartEvents: Parameters<
        GenerateTextOnStepStartCallback<any, any>
      >[0][] = [];
      let responseCount = 0;

      const alternateModel = new MockLanguageModelV4({
        provider: 'alternate-provider',
        modelId: 'alternate-model-id',
        doGenerate: async () => ({
          ...dummyResponseValues,
          content: [{ type: 'text', text: 'Final answer.' }],
        }),
      });

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            responseCount++;
            return {
              ...dummyResponseValues,
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: '{ "value": "test" }',
                },
              ],
              finishReason: { unified: 'tool-calls', raw: undefined },
            };
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        stopWhen: isStepCount(3),
        prepareStep: async ({ stepNumber }) => {
          if (stepNumber === 1) {
            return { model: alternateModel };
          }
          return undefined;
        },
        onStepStart: async event => {
          stepStartEvents.push(event);
        },
      });

      expect(stepStartEvents[0].provider).toBe('mock-provider');
      expect(stepStartEvents[0].modelId).toBe('mock-model-id');
      expect(stepStartEvents[1].provider).toBe('alternate-provider');
      expect(stepStartEvents[1].modelId).toBe('alternate-model-id');
    });

    it('should apply prepareStep model call settings only to the current step', async () => {
      const modelCallOptions: Array<LanguageModelV4CallOptions> = [];
      const modelCallStartEvents: Array<LanguageModelCallStartEvent> = [];
      const telemetryModelCallStartEvents: Array<LanguageModelCallOptions> = [];
      let responseCount = 0;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async options => {
            modelCallOptions.push(options);

            if (responseCount++ < 2) {
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: `call-${responseCount}`,
                    toolName: 'tool1',
                    input: '{ "value": "test" }',
                  },
                ],
                finishReason: { unified: 'tool-calls', raw: undefined },
              };
            }

            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Final answer.' }],
            };
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        stopWhen: isStepCount(3),
        maxOutputTokens: 100,
        temperature: 1,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0.4,
        frequencyPenalty: 0.3,
        stopSequences: ['outer'],
        seed: 123,
        reasoning: 'high',
        prepareStep: async ({ stepNumber }) =>
          stepNumber === 1
            ? {
                maxOutputTokens: 50,
                temperature: 0,
                topP: 0.5,
                topK: 10,
                presencePenalty: 0,
                frequencyPenalty: -0.2,
                stopSequences: [],
                seed: 0,
                reasoning: 'provider-default',
              }
            : stepNumber === 2
              ? { temperature: undefined }
              : undefined,
        onLanguageModelCallStart: event => {
          modelCallStartEvents.push(event);
        },
        telemetry: {
          isEnabled: true,
          integrations: {
            onLanguageModelCallStart: event => {
              telemetryModelCallStartEvents.push(event);
            },
          },
        },
      });

      const selectCallSettings = ({
        maxOutputTokens,
        temperature,
        topP,
        topK,
        presencePenalty,
        frequencyPenalty,
        stopSequences,
        seed,
        reasoning,
      }: LanguageModelCallOptions) => ({
        maxOutputTokens,
        temperature,
        topP,
        topK,
        presencePenalty,
        frequencyPenalty,
        stopSequences,
        seed,
        reasoning,
      });

      const outerSettings = {
        maxOutputTokens: 100,
        temperature: 1,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0.4,
        frequencyPenalty: 0.3,
        stopSequences: ['outer'],
        seed: 123,
        reasoning: 'high',
      };
      const stepSettings = {
        maxOutputTokens: 50,
        temperature: 0,
        topP: 0.5,
        topK: 10,
        presencePenalty: 0,
        frequencyPenalty: -0.2,
        stopSequences: [],
        seed: 0,
        reasoning: 'provider-default',
      };

      expect(modelCallOptions.map(selectCallSettings)).toEqual([
        outerSettings,
        stepSettings,
        outerSettings,
      ]);
      expect(modelCallStartEvents.map(selectCallSettings)).toEqual([
        outerSettings,
        stepSettings,
        outerSettings,
      ]);
      expect(telemetryModelCallStartEvents.map(selectCallSettings)).toEqual([
        outerSettings,
        stepSettings,
        outerSettings,
      ]);
    });

    it('should validate model call settings returned from prepareStep', async () => {
      await expect(
        generateText({
          model: new MockLanguageModelV4(),
          prompt: 'test-input',
          prepareStep: async () => ({
            maxOutputTokens: 0,
          }),
        }),
      ).rejects.toThrow('maxOutputTokens must be >= 1');
    });

    it('should provide empty steps array on first step', async () => {
      let stepStartEvent!: Parameters<
        GenerateTextOnStepStartCallback<any, any>
      >[0];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        onStepStart: async event => {
          stepStartEvent = event;
        },
      });

      expect(stepStartEvent.stepNumber).toBe(0);
      expect(stepStartEvent.steps).toEqual([]);
      expect(stepStartEvent.steps.length).toBe(0);
    });

    it('should provide previous step results in steps array for subsequent steps', async () => {
      const stepStartEvents: Parameters<
        GenerateTextOnStepStartCallback<any, any>
      >[0][] = [];
      let responseCount = 0;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            switch (responseCount++) {
              case 0:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      input: '{ "value": "step0" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 1:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-2',
                      toolName: 'tool1',
                      input: '{ "value": "step1" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 2:
              default:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Final answer.' }],
                };
            }
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        stopWhen: isStepCount(4),
        onStepStart: async event => {
          stepStartEvents.push(event);
        },
      });

      expect(stepStartEvents.length).toBe(3);

      // Step 0: no previous steps
      expect(stepStartEvents[0].steps.length).toBe(0);

      // Step 1: has step 0's result
      expect(stepStartEvents[1].steps.length).toBe(1);
      expect(stepStartEvents[1].steps[0].finishReason).toBe('tool-calls');
      expect(stepStartEvents[1].steps[0].toolCalls.length).toBe(1);
      expect(stepStartEvents[1].steps[0].toolCalls[0].toolName).toBe('tool1');
      expect(stepStartEvents[1].steps[0].toolResults.length).toBe(1);
      expect(stepStartEvents[1].steps[0].toolResults[0].output).toBe(
        'step0-result',
      );

      // Step 2: has step 0 and step 1's results
      expect(stepStartEvents[2].steps.length).toBe(2);
      expect(stepStartEvents[2].steps[0].finishReason).toBe('tool-calls');
      expect(stepStartEvents[2].steps[1].finishReason).toBe('tool-calls');
      expect(stepStartEvents[2].steps[1].toolResults[0].output).toBe(
        'step1-result',
      );
    });

    it('should provide steps with correct text content from prior steps', async () => {
      const stepStartEvents: Parameters<
        GenerateTextOnStepStartCallback<any, any>
      >[0][] = [];
      let responseCount = 0;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            switch (responseCount++) {
              case 0:
                return {
                  ...dummyResponseValues,
                  content: [
                    { type: 'text', text: 'Thinking...' },
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      input: '{ "value": "check" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 1:
              default:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Done.' }],
                };
            }
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        stopWhen: isStepCount(3),
        onStepStart: async event => {
          stepStartEvents.push(event);
        },
      });

      expect(stepStartEvents.length).toBe(2);

      // Step 1 should see step 0's text
      expect(stepStartEvents[1].steps[0].text).toBe('Thinking...');
    });

    it('should pass runtimeContext', async () => {
      let stepStartEvent!: Parameters<
        GenerateTextOnStepStartCallback<any, any>
      >[0];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        runtimeContext: { userId: 'test-user', requestId: 'req-123' },
        onStepStart: async event => {
          stepStartEvent = event;
        },
      });

      expect(stepStartEvent.runtimeContext).toEqual({
        userId: 'test-user',
        requestId: 'req-123',
      });
    });

    it('should pass updated runtimeContext from prepareStep', async () => {
      const stepStartEvents: Parameters<
        GenerateTextOnStepStartCallback<any, any>
      >[0][] = [];
      let responseCount = 0;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            switch (responseCount++) {
              case 0:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      input: '{ "value": "test" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 1:
              default:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Done.' }],
                };
            }
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        runtimeContext: { counter: 0 },
        stopWhen: isStepCount(3),
        prepareStep: async ({ runtimeContext, stepNumber }) => {
          return {
            runtimeContext: {
              counter: (runtimeContext as any).counter + 1,
              stepNumber,
            },
          };
        },
        onStepStart: async event => {
          stepStartEvents.push(event);
        },
      });

      expect(stepStartEvents[0].runtimeContext).toEqual({
        counter: 1,
        stepNumber: 0,
      });
      expect(stepStartEvents[1].runtimeContext).toEqual({
        counter: 2,
        stepNumber: 1,
      });
    });

    it('should pass initialInstructions, initialMessages, and responseMessages to prepareStep', async () => {
      const prepareStepCalls: Array<{
        instructions: Instructions | undefined;
        initialInstructions: Instructions | undefined;
        initialMessages: Array<ModelMessage>;
        responseMessages: Array<ModelMessage>;
        messages: Array<ModelMessage>;
      }> = [];
      let responseCount = 0;

      const model = new MockLanguageModelV4({
        doGenerate: async () => {
          switch (responseCount++) {
            case 0:
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: 'call-1',
                    toolName: 'tool1',
                    input: '{ "value": "test" }',
                  },
                ],
                finishReason: { unified: 'tool-calls', raw: undefined },
              };
            case 1:
            default:
              return {
                ...dummyResponseValues,
                content: [{ type: 'text', text: 'Done.' }],
              };
          }
        },
      });

      await generateText({
        model,
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        instructions: 'test instructions',
        messages: [{ role: 'user', content: 'test-input' }],
        stopWhen: isStepCount(3),
        prepareStep: async ({
          instructions,
          initialInstructions,
          initialMessages,
          responseMessages,
          messages,
          stepNumber,
        }) => {
          prepareStepCalls.push({
            instructions,
            initialInstructions,
            initialMessages: [...initialMessages],
            responseMessages: [...responseMessages],
            messages: [...messages],
          });

          return stepNumber === 0
            ? { instructions: 'prepared instructions' }
            : undefined;
        },
      });

      expect(prepareStepCalls).toHaveLength(2);
      expect(prepareStepCalls[0].instructions).toBe('test instructions');
      expect(prepareStepCalls[0].initialInstructions).toBe('test instructions');
      expect(prepareStepCalls[0].initialMessages).toEqual([
        { role: 'user', content: 'test-input' },
      ]);
      expect(prepareStepCalls[0].responseMessages).toEqual([]);
      expect(prepareStepCalls[0].messages).toEqual([
        { role: 'user', content: 'test-input' },
      ]);

      expect(prepareStepCalls[1].instructions).toBe('prepared instructions');
      expect(prepareStepCalls[1].initialInstructions).toBe('test instructions');
      expect(prepareStepCalls[1].initialMessages).toEqual([
        { role: 'user', content: 'test-input' },
      ]);
      expect(prepareStepCalls[1].responseMessages).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "input": {
                  "value": "test",
                },
                "providerExecuted": undefined,
                "providerOptions": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "text",
                  "value": "test-result",
                },
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
      expect(prepareStepCalls[1].messages).toEqual([
        ...prepareStepCalls[1].initialMessages,
        ...prepareStepCalls[1].responseMessages,
      ]);
      expect(model.doGenerateCalls[1].prompt[0]).toEqual({
        role: 'system',
        content: 'prepared instructions',
      });
    });

    it('should pass updated toolsContext from prepareStep', async () => {
      const prepareStepToolsContexts: Array<unknown> = [];
      const stepStartEvents: Parameters<
        GenerateTextOnStepStartCallback<any, any>
      >[0][] = [];
      let responseCount = 0;
      let recordedToolContext: unknown;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            switch (responseCount++) {
              case 0:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      input: '{ "value": "test" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 1:
              default:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Done.' }],
                };
            }
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            contextSchema: z.object({ label: z.string() }),
            execute: async (_, { context }) => {
              recordedToolContext = context;
              return 'test-result';
            },
          }),
        },
        prompt: 'test-input',
        toolsContext: { tool1: { label: 'initial' } },
        stopWhen: isStepCount(3),
        prepareStep: async ({ stepNumber, toolsContext }) => {
          prepareStepToolsContexts.push(toolsContext);

          if (stepNumber === 0) {
            return {
              toolsContext: {
                tool1: { label: 'updated' },
              },
            };
          }

          return undefined;
        },
        onStepStart: async event => {
          stepStartEvents.push(event);
        },
      });

      expect(prepareStepToolsContexts).toEqual([
        { tool1: { label: 'initial' } },
        { tool1: { label: 'updated' } },
      ]);
      expect(stepStartEvents[0].toolsContext).toEqual({
        tool1: { label: 'updated' },
      });
      expect(stepStartEvents[1].toolsContext).toEqual({
        tool1: { label: 'updated' },
      });
      expect(recordedToolContext).toEqual({ label: 'updated' });
    });
  });

  describe('options.onStepEnd stepNumber', () => {
    it('should call onStepEnd with step result', async () => {
      let stepEndEvent!: Parameters<GenerateTextOnStepEndCallback<any, any>>[0];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        onStepEnd: async event => {
          stepEndEvent = event;
        },
      });

      expect(stepEndEvent.stepNumber).toBe(0);
    });

    it('should prefer onStepEnd over deprecated onStepFinish', async () => {
      const calls: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        onStepEnd: async () => {
          calls.push('onStepEnd');
        },
        onStepFinish: async () => {
          calls.push('onStepFinish');
        },
      });

      expect(calls).toEqual(['onStepEnd']);
    });
  });

  describe('options.onStepFinish stepNumber', () => {
    it('should pass stepNumber 0 for a single step', async () => {
      let stepFinishEvent!: Parameters<
        GenerateTextOnStepFinishCallback<any, any>
      >[0];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        onStepFinish: async event => {
          stepFinishEvent = event;
        },
      });

      expect(stepFinishEvent.stepNumber).toBe(0);
    });

    it('should pass correct stepNumber for each step in a multi-step tool loop', async () => {
      const stepNumbers: number[] = [];
      let responseCount = 0;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            switch (responseCount++) {
              case 0:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      input: '{ "value": "test" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 1:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-2',
                      toolName: 'tool1',
                      input: '{ "value": "test2" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 2:
              default:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Done.' }],
                };
            }
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        stopWhen: isStepCount(4),
        onStepFinish: async event => {
          stepNumbers.push(event.stepNumber);
        },
      });

      expect(stepNumbers).toEqual([0, 1, 2]);
    });

    it('should have matching stepNumber between onStepStart and onStepFinish', async () => {
      const startStepNumbers: number[] = [];
      const finishStepNumbers: number[] = [];
      let responseCount = 0;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            switch (responseCount++) {
              case 0:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      input: '{ "value": "test" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 1:
              default:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Done.' }],
                };
            }
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        stopWhen: isStepCount(3),
        onStepStart: async event => {
          startStepNumbers.push(event.stepNumber);
        },
        onStepFinish: async event => {
          finishStepNumbers.push(event.stepNumber);
        },
      });

      expect(startStepNumbers).toEqual(finishStepNumbers);
    });
  });

  describe('options.onLanguageModelCallStart and onLanguageModelCallEnd', () => {
    it('should fire the model-call callbacks before tool execution and step finish', async () => {
      const callOrder: string[] = [];
      let modelCallStartEvent!: LanguageModelCallStartEvent;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        instructions: 'test-system',
        prompt: 'test-input',
        maxOutputTokens: 128,
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0.2,
        frequencyPenalty: 0.1,
        stopSequences: ['stop'],
        seed: 123,
        reasoning: 'high',
        onStepStart: async () => {
          callOrder.push('onStepStart');
        },
        onLanguageModelCallStart: async event => {
          callOrder.push('onLanguageModelCallStart');
          modelCallStartEvent = event;
        },
        onLanguageModelCallEnd: async () => {
          callOrder.push('onLanguageModelCallEnd');
        },
        onToolExecutionStart: async () => {
          callOrder.push('onToolExecutionStart');
        },
        onToolExecutionEnd: async () => {
          callOrder.push('onToolExecutionEnd');
        },
        onStepFinish: async () => {
          callOrder.push('onStepFinish');
        },
        _internal: {
          generateCallId: () => 'test-telemetry-call-id',
        },
      });

      expect(callOrder).toEqual([
        'onStepStart',
        'onLanguageModelCallStart',
        'onLanguageModelCallEnd',
        'onToolExecutionStart',
        'onToolExecutionEnd',
        'onStepFinish',
      ]);
      expect(modelCallStartEvent).toMatchInlineSnapshot(`
        {
          "callId": "test-telemetry-call-id",
          "frequencyPenalty": 0.1,
          "instructions": "test-system",
          "maxOutputTokens": 128,
          "messages": [
            {
              "content": "test-input",
              "role": "user",
            },
          ],
          "modelId": "mock-model-id",
          "presencePenalty": 0.2,
          "provider": "mock-provider",
          "reasoning": "high",
          "seed": 123,
          "stopSequences": [
            "stop",
          ],
          "temperature": 0.7,
          "tools": [
            {
              "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "additionalProperties": false,
                "properties": {
                  "value": {
                    "type": "string",
                  },
                },
                "required": [
                  "value",
                ],
                "type": "object",
              },
              "name": "tool1",
              "type": "function",
            },
          ],
          "topK": 40,
          "topP": 0.9,
        }
      `);
    });

    it('should provide parsed tool calls on model-call end', async () => {
      const modelCallEndEvents: LanguageModelCallEndEvent<any>[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              { type: 'text', text: 'Before tool.' },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test-arg" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
            response: {
              id: 'response-1',
              timestamp: new Date('2025-01-01T00:00:00.000Z'),
              modelId: 'mock-response-model',
              headers: { 'x-test': 'true' },
            },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        onLanguageModelCallEnd: async event => {
          modelCallEndEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(modelCallEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "content": [
              {
                "text": "Before tool.",
                "type": "text",
              },
              {
                "input": {
                  "value": "test-arg",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "title": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
            ],
            "finishReason": "tool-calls",
            "modelId": "mock-model-id",
            "performance": {
              "effectiveOutputTokensPerSecond": 0,
              "effectiveTotalTokensPerSecond": 0,
              "inputTokensPerSecond": undefined,
              "outputTokensPerSecond": undefined,
              "responseTimeMs": 0,
              "timeToFirstOutputMs": undefined,
            },
            "provider": "mock-provider",
            "responseId": "response-1",
            "usage": {
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 3,
              },
              "inputTokens": 3,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 10,
              },
              "outputTokens": 10,
              "raw": undefined,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });
  });

  describe('options.onToolExecutionStart', () => {
    it('should use experimental_onToolCallStart as a fallback', async () => {
      const callOrder: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        experimental_onToolCallStart: async () => {
          callOrder.push('experimental_onToolCallStart');
        },
        ...defaultSettings(),
      });

      expect(callOrder).toEqual(['experimental_onToolCallStart']);
    });

    it('should prefer onToolExecutionStart over experimental_onToolCallStart', async () => {
      const callOrder: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        experimental_onToolCallStart: async () => {
          callOrder.push('experimental_onToolCallStart');
        },
        onToolExecutionStart: async () => {
          callOrder.push('onToolExecutionStart');
        },
        ...defaultSettings(),
      });

      expect(callOrder).toEqual(['onToolExecutionStart']);
    });

    it('should be called with correct tool name, id, and input', async () => {
      const toolExecutionStartEvents: ToolExecutionStartEvent<any>[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test-arg" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        _internal: {
          generateId: () => 'test-call-id',
          generateCallId: () => 'test-telemetry-call-id',
        },
        onToolExecutionStart: async event => {
          toolExecutionStartEvents.push(event);
        },
      });

      expect(toolExecutionStartEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "test-input",
                "role": "user",
              },
            ],
            "toolCall": {
              "input": {
                "value": "test-arg",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": undefined,
          },
        ]
      `);
    });

    it('should be called once per tool call in a multi-tool step', async () => {
      const toolExecutionStartEvents: ToolExecutionStartEvent<any>[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "a" }',
              },
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-2',
                toolName: 'tool1',
                input: '{ "value": "b" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        onToolExecutionStart: async event => {
          toolExecutionStartEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(toolExecutionStartEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "toolCall": {
              "input": {
                "value": "a",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": undefined,
          },
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "toolCall": {
              "input": {
                "value": "b",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-2",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": undefined,
          },
        ]
      `);
    });

    it('should be called before tool execution', async () => {
      const callOrder: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              callOrder.push('execute');
              return `${value}-result`;
            },
          }),
        },
        prompt: 'test-input',
        onToolExecutionStart: async () => {
          callOrder.push('onToolExecutionStart');
        },
      });

      expect(callOrder.indexOf('onToolExecutionStart')).toBeLessThan(
        callOrder.indexOf('execute'),
      );
    });

    it('should not break generation when callback throws', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        onToolExecutionStart: async () => {
          throw new Error('callback error');
        },
      });

      expect(result.toolResults.length).toBe(1);
      expect(result.toolResults[0].output).toBe('test-result');
    });

    it('should not fire for tools without execute', async () => {
      const toolExecutionStartEvents: ToolExecutionStartEvent<any>[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
          }),
        },
        prompt: 'test-input',
        onToolExecutionStart: async event => {
          toolExecutionStartEvents.push(event);
        },
      });

      expect(toolExecutionStartEvents).toMatchInlineSnapshot(`[]`);
    });

    it('should pass context', async () => {
      const toolExecutionStartEvents: ToolExecutionStartEvent<any>[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            contextSchema: z.object({ context: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        toolsContext: { tool1: { context: 'test' } },
        onToolExecutionStart: async event => {
          toolExecutionStartEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(toolExecutionStartEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "toolCall": {
              "input": {
                "value": "test",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": {
              "context": "test",
            },
          },
        ]
      `);
    });
  });

  describe('options.onToolExecutionEnd', () => {
    it('should use experimental_onToolCallFinish as a fallback', async () => {
      const callOrder: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        experimental_onToolCallFinish: async () => {
          callOrder.push('experimental_onToolCallFinish');
        },
        ...defaultSettings(),
      });

      expect(callOrder).toEqual(['experimental_onToolCallFinish']);
    });

    it('should prefer onToolExecutionEnd over experimental_onToolCallFinish', async () => {
      const callOrder: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        experimental_onToolCallFinish: async () => {
          callOrder.push('experimental_onToolCallFinish');
        },
        onToolExecutionEnd: async () => {
          callOrder.push('onToolExecutionEnd');
        },
        ...defaultSettings(),
      });

      expect(callOrder).toEqual(['onToolExecutionEnd']);
    });

    it('should be called with correct data on success', async () => {
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test-arg" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "toolCall": {
              "input": {
                "value": "test-arg",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": undefined,
            "toolExecutionMs": 0,
            "toolOutput": {
              "dynamic": false,
              "input": {
                "value": "test-arg",
              },
              "output": "test-arg-result",
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          },
        ]
      `);
    });

    it('should be called with error data when tool execution fails', async () => {
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];
      const toolError = new Error('tool execution failed');

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw toolError;
            },
          }),
        },
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "toolCall": {
              "input": {
                "value": "test",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": undefined,
            "toolExecutionMs": 0,
            "toolOutput": {
              "dynamic": false,
              "error": [Error: tool execution failed],
              "input": {
                "value": "test",
              },
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-error",
            },
          },
        ]
      `);
    });

    it('should have a positive toolExecutionMs', async () => {
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
      });

      expect(toolExecutionEndEvents[0].toolExecutionMs).toBeGreaterThanOrEqual(
        0,
      );
      expect(typeof toolExecutionEndEvents[0].toolExecutionMs).toBe('number');
    });

    it('should not break generation when callback throws', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        onToolExecutionEnd: async () => {
          throw new Error('callback error');
        },
      });

      expect(result.toolResults.length).toBe(1);
      expect(result.toolResults[0].output).toBe('test-result');
    });

    it('should not fire for tools without execute', async () => {
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
          }),
        },
        prompt: 'test-input',
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
      });

      expect(toolExecutionEndEvents.length).toBe(0);
    });

    it('should pass context on success', async () => {
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            contextSchema: z.object({ context: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        toolsContext: { tool1: { context: 'test' } },
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "toolCall": {
              "input": {
                "value": "test",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": {
              "context": "test",
            },
            "toolExecutionMs": 0,
            "toolOutput": {
              "dynamic": false,
              "input": {
                "value": "test",
              },
              "output": "test-result",
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          },
        ]
      `);
    });

    it('should pass context on error', async () => {
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];
      const toolError = new Error('Tool execution failed');

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            contextSchema: z.object({ context: z.string() }),
            execute: async (): Promise<string> => {
              throw toolError;
            },
          }),
        },
        toolsContext: { tool1: { context: 'test' } },
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "toolCall": {
              "input": {
                "value": "test",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": {
              "context": "test",
            },
            "toolExecutionMs": 0,
            "toolOutput": {
              "dynamic": false,
              "error": [Error: Tool execution failed],
              "input": {
                "value": "test",
              },
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-error",
            },
          },
        ]
      `);
    });
  });

  describe('options.onToolExecutionStart and onToolExecutionEnd ordering', () => {
    it('should call start before finish', async () => {
      const callOrder: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        onToolExecutionStart: async () => {
          callOrder.push('onToolExecutionStart');
        },
        onToolExecutionEnd: async () => {
          callOrder.push('onToolExecutionEnd');
        },
      });

      expect(callOrder).toEqual(['onToolExecutionStart', 'onToolExecutionEnd']);
    });

    it('should fire both tool call callbacks before onStepFinish', async () => {
      const callOrder: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{ "value": "test" }',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
        onToolExecutionStart: async () => {
          callOrder.push('onToolExecutionStart');
        },
        onToolExecutionEnd: async () => {
          callOrder.push('onToolExecutionEnd');
        },
        onStepFinish: async () => {
          callOrder.push('onStepFinish');
        },
      });

      expect(callOrder).toEqual([
        'onToolExecutionStart',
        'onToolExecutionEnd',
        'onStepFinish',
      ]);
    });

    it('should fire tool call callbacks for each tool in a multi-step loop', async () => {
      const toolExecutionStartEvents: ToolExecutionStartEvent<any>[] = [];
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];

      let responseCount = 0;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            switch (responseCount++) {
              case 0:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      input: '{ "value": "step0" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 1:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-2',
                      toolName: 'tool1',
                      input: '{ "value": "step1" }',
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 2:
              default:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Done.' }],
                };
            }
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        stopWhen: isStepCount(4),
        onToolExecutionStart: async event => {
          toolExecutionStartEvents.push(event);
        },
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(toolExecutionStartEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "toolCall": {
              "input": {
                "value": "step0",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": undefined,
          },
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
              {
                "content": [
                  {
                    "input": {
                      "value": "step0",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                ],
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "output": {
                      "type": "text",
                      "value": "step0-result",
                    },
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
            ],
            "toolCall": {
              "input": {
                "value": "step1",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-2",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": undefined,
          },
        ]
      `);
      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "toolCall": {
              "input": {
                "value": "step0",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": undefined,
            "toolExecutionMs": 0,
            "toolOutput": {
              "dynamic": false,
              "input": {
                "value": "step0",
              },
              "output": "step0-result",
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          },
          {
            "callId": "test-telemetry-call-id",
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
              {
                "content": [
                  {
                    "input": {
                      "value": "step0",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                ],
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "output": {
                      "type": "text",
                      "value": "step0-result",
                    },
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
            ],
            "toolCall": {
              "input": {
                "value": "step1",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-2",
              "toolName": "tool1",
              "type": "tool-call",
            },
            "toolContext": undefined,
            "toolExecutionMs": 0,
            "toolOutput": {
              "dynamic": false,
              "input": {
                "value": "step1",
              },
              "output": "step1-result",
              "toolCallId": "call-2",
              "toolName": "tool1",
              "type": "tool-result",
            },
          },
        ]
      `);
    });
  });

  describe('options.onEnd', () => {
    it('should send correct information', async () => {
      let result!: Parameters<GenerateTextOnEndCallback<any, any>>[0];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [
              { type: 'text', text: 'Hello, World!' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
            response: {
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
              headers: { call: '2' },
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
            warnings: [],
          }),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        _internal: {
          generateId: () => 'test-call-id',
          generateCallId: () => 'test-telemetry-call-id',
        },
        onEnd: async event => {
          result = event as unknown as typeof result;
        },
        prompt: 'irrelevant',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "callId": "test-telemetry-call-id",
          "content": [
            {
              "text": "Hello, World!",
              "type": "text",
            },
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            {
              "dynamic": false,
              "input": {
                "value": "value",
              },
              "output": "value-result",
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          ],
          "dynamicToolCalls": [],
          "dynamicToolResults": [],
          "files": [],
          "finalStep": DefaultStepResult {
            "callId": "test-telemetry-call-id",
            "content": [
              {
                "text": "Hello, World!",
                "type": "text",
              },
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "title": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
              {
                "dynamic": false,
                "input": {
                  "value": "value",
                },
                "output": "value-result",
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
            ],
            "finishReason": "stop",
            "model": {
              "modelId": "mock-model-id",
              "provider": "mock-provider",
            },
            "performance": {
              "effectiveOutputTokensPerSecond": 0,
              "effectiveTotalTokensPerSecond": 0,
              "inputTokensPerSecond": undefined,
              "outputTokensPerSecond": undefined,
              "responseTimeMs": 0,
              "stepTimeMs": 0,
              "timeToFirstOutputMs": undefined,
              "toolExecutionMs": {
                "call-1": 0,
              },
            },
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "request": {
              "body": undefined,
              "messages": undefined,
            },
            "response": {
              "body": undefined,
              "headers": {
                "call": "2",
              },
              "id": "id-0",
              "messages": [
                {
                  "content": [
                    {
                      "providerOptions": undefined,
                      "text": "Hello, World!",
                      "type": "text",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                  ],
                  "role": "assistant",
                },
                {
                  "content": [
                    {
                      "output": {
                        "type": "text",
                        "value": "value-result",
                      },
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "role": "tool",
                },
              ],
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "runtimeContext": {},
            "stepNumber": 0,
            "toolsContext": {},
            "usage": {
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 3,
              },
              "inputTokens": 3,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 10,
              },
              "outputTokens": 10,
              "raw": undefined,
              "totalTokens": 13,
            },
            "warnings": [],
          },
          "finishReason": "stop",
          "model": {
            "modelId": "mock-model-id",
            "provider": "mock-provider",
          },
          "providerMetadata": undefined,
          "rawFinishReason": "stop",
          "reasoning": [],
          "reasoningText": undefined,
          "request": {
            "body": undefined,
            "messages": undefined,
          },
          "response": {
            "body": undefined,
            "headers": {
              "call": "2",
            },
            "id": "id-0",
            "messages": [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "Hello, World!",
                    "type": "text",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                ],
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "output": {
                      "type": "text",
                      "value": "value-result",
                    },
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
            ],
            "modelId": "mock-model-id",
            "timestamp": 1970-01-01T00:00:00.000Z,
          },
          "responseMessages": [
            {
              "content": [
                {
                  "providerOptions": undefined,
                  "text": "Hello, World!",
                  "type": "text",
                },
                {
                  "input": {
                    "value": "value",
                  },
                  "providerExecuted": undefined,
                  "providerOptions": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-call",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "output": {
                    "type": "text",
                    "value": "value-result",
                  },
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-result",
                },
              ],
              "role": "tool",
            },
          ],
          "runtimeContext": {},
          "sources": [],
          "staticToolCalls": [
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
          ],
          "staticToolResults": [
            {
              "dynamic": false,
              "input": {
                "value": "value",
              },
              "output": "value-result",
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          ],
          "stepNumber": 0,
          "steps": [
            DefaultStepResult {
              "callId": "test-telemetry-call-id",
              "content": [
                {
                  "text": "Hello, World!",
                  "type": "text",
                },
                {
                  "input": {
                    "value": "value",
                  },
                  "providerExecuted": undefined,
                  "providerMetadata": undefined,
                  "title": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-call",
                },
                {
                  "dynamic": false,
                  "input": {
                    "value": "value",
                  },
                  "output": "value-result",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-result",
                },
              ],
              "finishReason": "stop",
              "model": {
                "modelId": "mock-model-id",
                "provider": "mock-provider",
              },
              "performance": {
                "effectiveOutputTokensPerSecond": 0,
                "effectiveTotalTokensPerSecond": 0,
                "inputTokensPerSecond": undefined,
                "outputTokensPerSecond": undefined,
                "responseTimeMs": 0,
                "stepTimeMs": 0,
                "timeToFirstOutputMs": undefined,
                "toolExecutionMs": {
                  "call-1": 0,
                },
              },
              "providerMetadata": undefined,
              "rawFinishReason": "stop",
              "request": {
                "body": undefined,
                "messages": undefined,
              },
              "response": {
                "body": undefined,
                "headers": {
                  "call": "2",
                },
                "id": "id-0",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "Hello, World!",
                        "type": "text",
                      },
                      {
                        "input": {
                          "value": "value",
                        },
                        "providerExecuted": undefined,
                        "providerOptions": undefined,
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-call",
                      },
                    ],
                    "role": "assistant",
                  },
                  {
                    "content": [
                      {
                        "output": {
                          "type": "text",
                          "value": "value-result",
                        },
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-result",
                      },
                    ],
                    "role": "tool",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "runtimeContext": {},
              "stepNumber": 0,
              "toolsContext": {},
              "usage": {
                "inputTokenDetails": {
                  "cacheReadTokens": undefined,
                  "cacheWriteTokens": undefined,
                  "noCacheTokens": 3,
                },
                "inputTokens": 3,
                "outputTokenDetails": {
                  "reasoningTokens": undefined,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "raw": undefined,
                "totalTokens": 13,
              },
              "warnings": [],
            },
          ],
          "text": "Hello, World!",
          "toolCalls": [
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
          ],
          "toolResults": [
            {
              "dynamic": false,
              "input": {
                "value": "value",
              },
              "output": "value-result",
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          ],
          "toolsContext": {},
          "totalUsage": {
            "inputTokenDetails": {
              "cacheReadTokens": undefined,
              "cacheWriteTokens": undefined,
              "noCacheTokens": 3,
            },
            "inputTokens": 3,
            "outputTokenDetails": {
              "reasoningTokens": undefined,
              "textTokens": 10,
            },
            "outputTokens": 10,
            "totalTokens": 13,
          },
          "usage": {
            "inputTokenDetails": {
              "cacheReadTokens": undefined,
              "cacheWriteTokens": undefined,
              "noCacheTokens": 3,
            },
            "inputTokens": 3,
            "outputTokenDetails": {
              "reasoningTokens": undefined,
              "textTokens": 10,
            },
            "outputTokens": 10,
            "totalTokens": 13,
          },
          "warnings": [],
        }
      `);
    });

    it('should support onFinish as a deprecated alias', async () => {
      const calls: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello, World!' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
            warnings: [],
          }),
        }),
        prompt: 'irrelevant',
        onFinish: async () => {
          calls.push('onFinish');
        },
      });

      expect(calls).toEqual(['onFinish']);
    });

    it('should prefer onEnd over onFinish', async () => {
      const calls: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello, World!' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
            warnings: [],
          }),
        }),
        prompt: 'irrelevant',
        onEnd: async () => {
          calls.push('onEnd');
        },
        onFinish: async () => {
          calls.push('onFinish');
        },
      });

      expect(calls).toEqual(['onEnd']);
    });
  });
  */
  describe('options.stopWhen', () => {
    describe('2 steps: initial, tool-result', () => {
      let result: GenerateTextResult<any, any>;
      let onStepFinishResults: StepResult<any>[];

      beforeEach(async () => {
        onStepFinishResults = [];

        let responseCount = 0;
        result = await generateText({
          model: new MockLanguageModelV2({
            doGenerate: async ({ prompt, tools, toolChoice }) => {
              switch (responseCount++) {
                case 0:
                  expect(tools).toStrictEqual([
                    {
                      type: 'function',
                      name: 'tool1',
                      description: undefined,
                      inputSchema: {
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        additionalProperties: false,
                        properties: { value: { type: 'string' } },
                        required: ['value'],
                        type: 'object',
                      },
                      providerOptions: undefined,
                    },
                  ]);

                  expect(toolChoice).toStrictEqual({ type: 'auto' });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerOptions: undefined,
                    },
                  ]);

                  return {
                    ...dummyResponseValues,
                    content: [
                      {
                        type: 'tool-call',
                        toolCallType: 'function',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        input: `{ "value": "value" }`,
                      },
                    ],
                    finishReason: 'tool-calls',
                    usage: {
                      inputTokens: 10,
                      outputTokens: 5,
                      totalTokens: 15,
                      reasoningTokens: undefined,
                      cachedInputTokens: undefined,
                    },
                    response: {
                      id: 'test-id-1-from-model',
                      timestamp: new Date(0),
                      modelId: 'test-response-model-id',
                    },
                  };
                case 1:
                  return {
                    ...dummyResponseValues,
                    content: [{ type: 'text', text: 'Hello, world!' }],
                    response: {
                      id: 'test-id-2-from-model',
                      timestamp: new Date(10000),
                      modelId: 'test-response-model-id',
                      headers: {
                        'custom-response-header': 'response-header-value',
                      },
                    },
                  };
                default:
                  throw new Error(
                    `Unexpected response count: ${responseCount}`,
                  );
              }
            },
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async (args, options) => {
                expect(args).toStrictEqual({ value: 'value' });
                expect(options.messages).toStrictEqual([
                  { role: 'user', content: 'test-input' },
                ]);
                return 'result1';
              },
            }),
          },
          prompt: 'test-input',
          stopWhen: stepCountIs(3),
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
        });
      });

      it('result.text should return text from last step', async () => {
        assert.deepStrictEqual(result.text, 'Hello, world!');
      });

      it('result.toolCalls should return empty tool calls from last step', async () => {
        assert.deepStrictEqual(result.toolCalls, []);
      });

      it('result.toolResults should return empty tool results from last step', async () => {
        assert.deepStrictEqual(result.toolResults, []);
      });

      it('result.response.messages should contain response messages from all steps', () => {
        expect(result.response.messages).toMatchSnapshot();
      });

      it('result.totalUsage should sum token usage', () => {
        expect(result.totalUsage).toMatchInlineSnapshot(`
        {
          "cachedInputTokens": undefined,
          "inputTokens": 13,
          "outputTokens": 15,
          "reasoningTokens": undefined,
          "totalTokens": 28,
        }
      `);
      });

      it('result.usage should contain token usage from final step', async () => {
        expect(result.usage).toMatchInlineSnapshot(`
        {
          "cachedInputTokens": undefined,
          "inputTokens": 3,
          "outputTokens": 10,
          "reasoningTokens": undefined,
          "totalTokens": 13,
        }
      `);
      });

      it('result.steps should contain all steps', () => {
        expect(result.steps).toMatchSnapshot();
      });

      it('onStepFinish should be called for each step', () => {
        expect(onStepFinishResults).toMatchSnapshot();
      });
    });

    describe('2 steps: initial, tool-result with prepareStep', () => {
      let result: GenerateTextResult<any, any>;
      let onStepFinishResults: StepResult<any>[];
      let doGenerateCalls: Array<LanguageModelV2CallOptions>;
      let prepareStepCalls: Array<{
        stepNumber: number;
        steps: Array<StepResult<any>>;
        messages: Array<ModelMessage>;
      }>;

      beforeEach(async () => {
        onStepFinishResults = [];
        doGenerateCalls = [];
        prepareStepCalls = [];

        let responseCount = 0;

        const trueModel = new MockLanguageModelV2({
          doGenerate: async ({ prompt, tools, toolChoice }) => {
            doGenerateCalls.push({ prompt, tools, toolChoice });

            switch (responseCount++) {
              case 0:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      input: `{ "value": "value" }`,
                    },
                  ],
                  toolResults: [
                    {
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      input: { value: 'value' },
                      output: 'result1',
                    },
                  ],
                  finishReason: 'tool-calls',
                  usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    totalTokens: 15,
                    reasoningTokens: undefined,
                    cachedInputTokens: undefined,
                  },
                  response: {
                    id: 'test-id-1-from-model',
                    timestamp: new Date(0),
                    modelId: 'test-response-model-id',
                  },
                };
              case 1:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Hello, world!' }],
                  response: {
                    id: 'test-id-2-from-model',
                    timestamp: new Date(10000),
                    modelId: 'test-response-model-id',
                    headers: {
                      'custom-response-header': 'response-header-value',
                    },
                  },
                };
              default:
                throw new Error(`Unexpected response count: ${responseCount}`);
            }
          },
        });

        result = await generateText({
          model: modelWithFiles,
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async (args, options) => {
                expect(args).toStrictEqual({ value: 'value' });
                expect(options.messages).toStrictEqual([
                  { role: 'user', content: 'test-input' },
                ]);
                return 'result1';
              },
            }),
          },
          prompt: 'test-input',
          stopWhen: stepCountIs(3),
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          prepareStep: async ({ model, stepNumber, steps, messages }) => {
            prepareStepCalls.push({ stepNumber, steps, messages });

            if (stepNumber === 0) {
              expect(steps).toStrictEqual([]);
              return {
                model: trueModel,
                toolChoice: {
                  type: 'tool',
                  toolName: 'tool1' as const,
                },
                system: 'system-message-0',
                messages: [
                  {
                    role: 'user',
                    content: 'new input from prepareStep',
                  },
                ],
              };
            }

            if (stepNumber === 1) {
              expect(steps.length).toStrictEqual(1);
              return {
                model: trueModel,
                activeTools: [],
                system: 'system-message-1',
              };
            }
          },
        });
      });

      it('should contain all prepareStep calls', async () => {
        expect(prepareStepCalls).toMatchInlineSnapshot(`
          [
            {
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "stepNumber": 0,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "dynamic": false,
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "body": undefined,
                    "headers": undefined,
                    "id": "test-id-1-from-model",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "test-response-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 10,
                    "outputTokens": 5,
                    "reasoningTokens": undefined,
                    "totalTokens": 15,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "content": [
                    {
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "finishReason": "stop",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "body": undefined,
                    "headers": {
                      "custom-response-header": "response-header-value",
                    },
                    "id": "test-id-2-from-model",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "Hello, world!",
                            "type": "text",
                          },
                        ],
                        "role": "assistant",
                      },
                    ],
                    "modelId": "test-response-model-id",
                    "timestamp": 1970-01-01T00:00:10.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
              ],
            },
            {
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
                {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                  ],
                  "role": "assistant",
                },
                {
                  "content": [
                    {
                      "output": {
                        "type": "text",
                        "value": "result1",
                      },
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "role": "tool",
                },
              ],
              "stepNumber": 1,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "dynamic": false,
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "body": undefined,
                    "headers": undefined,
                    "id": "test-id-1-from-model",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "test-response-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 10,
                    "outputTokens": 5,
                    "reasoningTokens": undefined,
                    "totalTokens": 15,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "content": [
                    {
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "finishReason": "stop",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "body": undefined,
                    "headers": {
                      "custom-response-header": "response-header-value",
                    },
                    "id": "test-id-2-from-model",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "Hello, world!",
                            "type": "text",
                          },
                        ],
                        "role": "assistant",
                      },
                    ],
                    "modelId": "test-response-model-id",
                    "timestamp": 1970-01-01T00:00:10.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
              ],
            },
          ]
        `);
      });

      it('doGenerate should be called with the correct arguments', () => {
        expect(doGenerateCalls).toMatchInlineSnapshot(`
          [
            {
              "prompt": [
                {
                  "content": "system-message-0",
                  "role": "system",
                },
                {
                  "content": [
                    {
                      "text": "new input from prepareStep",
                      "type": "text",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "user",
                },
              ],
              "toolChoice": {
                "toolName": "tool1",
                "type": "tool",
              },
              "tools": [
                {
                  "description": undefined,
                  "inputSchema": {
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "additionalProperties": false,
                    "properties": {
                      "value": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "value",
                    ],
                    "type": "object",
                  },
                  "name": "tool1",
                  "providerOptions": undefined,
                  "type": "function",
                },
              ],
            },
            {
              "prompt": [
                {
                  "content": "system-message-1",
                  "role": "system",
                },
                {
                  "content": [
                    {
                      "text": "test-input",
                      "type": "text",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "user",
                },
                {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "assistant",
                },
                {
                  "content": [
                    {
                      "output": {
                        "type": "text",
                        "value": "result1",
                      },
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "tool",
                },
              ],
              "toolChoice": {
                "type": "auto",
              },
              "tools": [],
            },
          ]
        `);
      });

      it('result.text should return text from last step', async () => {
        expect(result.text).toStrictEqual('Hello, world!');
      });

      it('result.toolCalls should return empty tool calls from last step', async () => {
        expect(result.toolCalls).toStrictEqual([]);
      });

      it('result.toolResults should return empty tool results from last step', async () => {
        expect(result.toolResults).toStrictEqual([]);
      });

      it('result.response.messages should contain response messages from all steps', () => {
        expect(result.response.messages).toMatchSnapshot();
      });

      it('result.totalUsage should sum token usage', () => {
        expect(result.totalUsage).toMatchInlineSnapshot(`
        {
          "cachedInputTokens": undefined,
          "inputTokens": 13,
          "outputTokens": 15,
          "reasoningTokens": undefined,
          "totalTokens": 28,
        }
      `);
      });

      it('result.usage should contain token usage from final step', async () => {
        expect(result.usage).toMatchInlineSnapshot(`
        {
          "cachedInputTokens": undefined,
          "inputTokens": 3,
          "outputTokens": 10,
          "reasoningTokens": undefined,
          "totalTokens": 13,
        }
      `);
      });

      it('result.steps should contain all steps', () => {
        expect(result.steps).toMatchSnapshot();
      });

      it('onStepFinish should be called for each step', () => {
        expect(onStepFinishResults).toMatchSnapshot();
      });

      it('content should contain content from the last step', () => {
        expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "Hello, world!",
            "type": "text",
          },
        ]
      `);
      });
    });

    describe('2 stop conditions', () => {
      let result: GenerateTextResult<any, any>;
      let stopConditionCalls: Array<{
        number: number;
        steps: StepResult<any>[];
      }>;

      beforeEach(async () => {
        stopConditionCalls = [];

        let responseCount = 0;
        result = await generateText({
          model: new MockLanguageModelV2({
            doGenerate: async () => {
              switch (responseCount++) {
                case 0:
                  return {
                    ...dummyResponseValues,
                    content: [
                      {
                        type: 'tool-call',
                        toolCallType: 'function',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        input: `{ "value": "value" }`,
                      },
                    ],
                    finishReason: 'tool-calls',
                    usage: {
                      inputTokens: 10,
                      outputTokens: 5,
                      totalTokens: 15,
                      reasoningTokens: undefined,
                      cachedInputTokens: undefined,
                    },
                    response: {
                      id: 'test-id-1-from-model',
                      timestamp: new Date(0),
                      modelId: 'test-response-model-id',
                    },
                  };
                default:
                  throw new Error(
                    `Unexpected response count: ${responseCount}`,
                  );
              }
            },
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async (input, options) => {
                expect(input).toStrictEqual({ value: 'value' });
                expect(options.messages).toStrictEqual([
                  { role: 'user', content: 'test-input' },
                ]);
                return 'result1';
              },
            }),
          },
          prompt: 'test-input',
          stopWhen: [
            ({ steps }) => {
              stopConditionCalls.push({ number: 0, steps });
              return false;
            },
            ({ steps }) => {
              stopConditionCalls.push({ number: 1, steps });
              return true;
            },
          ],
        });
      });

      it('result.steps should contain a single step', () => {
        expect(result.steps.length).toStrictEqual(1);
      });

      it('stopConditionCalls should be called for each stop condition', () => {
        expect(stopConditionCalls).toMatchInlineSnapshot(`
          [
            {
              "number": 0,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "dynamic": false,
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "body": undefined,
                    "headers": undefined,
                    "id": "test-id-1-from-model",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "test-response-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 10,
                    "outputTokens": 5,
                    "reasoningTokens": undefined,
                    "totalTokens": 15,
                  },
                  "warnings": [],
                },
              ],
            },
            {
              "number": 1,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "dynamic": false,
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "body": undefined,
                    "headers": undefined,
                    "id": "test-id-1-from-model",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "test-response-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 10,
                    "outputTokens": 5,
                    "reasoningTokens": undefined,
                    "totalTokens": 15,
                  },
                  "warnings": [],
                },
              ],
            },
          ]
        `);
      });
    });
  });

  describe('options.headers', () => {
    it('should pass headers to model', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({ headers }) => {
            assert.equal(
              headers?.['custom-request-header'],
              'request-header-value',
            );

            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            };
          },
        }),
        prompt: 'test-input',
        headers: { 'custom-request-header': 'request-header-value' },
      });

      assert.deepStrictEqual(result.text, 'Hello, world!');
    });
  });

  describe('options.providerOptions', () => {
    it('should pass provider options to model', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({ providerOptions }) => {
            expect(providerOptions).toStrictEqual({
              aProvider: { someKey: 'someValue' },
            });

            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'provider metadata test' }],
            };
          },
        }),
        prompt: 'test-input',
        providerOptions: {
          aProvider: { someKey: 'someValue' },
        },
      });

      expect(result.text).toStrictEqual('provider metadata test');
    });
  });

  describe('options.abortSignal', () => {
    it('should forward abort signal to tool execution', async () => {
      const abortController = new AbortController();
      const toolExecuteMock = vi.fn().mockResolvedValue('tool result');

      const generateTextPromise = generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
            ],
          }),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: toolExecuteMock,
          },
        },
        prompt: 'test-input',
        abortSignal: abortController.signal,
      });

      // Abort the operation
      abortController.abort();

      await generateTextPromise;

      expect(toolExecuteMock).toHaveBeenCalledWith(
        { value: 'value' },
        {
          abortSignal: abortController.signal,
          toolCallId: 'call-1',
          messages: expect.any(Array),
        },
      );
    });
  });

  describe('options.activeTools', () => {
    it('should filter available tools to only the ones in activeTools', async () => {
      let tools:
        | (LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool)[]
        | undefined;

      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({ tools: toolsArg }) => {
            tools = toolsArg;

            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            };
          },
        }),

        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
          tool2: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result2',
          },
        },
        prompt: 'test-input',
        activeTools: ['tool1'],
      });

      expect(tools).toMatchInlineSnapshot(`
      [
        {
          "description": undefined,
          "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "value": {
                "type": "string",
              },
            },
            "required": [
              "value",
            ],
            "type": "object",
          },
          "name": "tool1",
          "providerOptions": undefined,
          "type": "function",
        },
      ]
    `);
    });
  });

  describe('telemetry', () => {
    let tracer: MockTracer;

    beforeEach(() => {
      tracer = new MockTracer();
    });

    it('should not record any telemetry data when not explicitly enabled', async () => {
      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({}) => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
          }),
        }),
        prompt: 'prompt',
        experimental_telemetry: { tracer },
      });

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should record telemetry data when enabled', async () => {
      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({}) => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
            response: {
              id: 'test-id-from-model',
              timestamp: new Date(10000),
              modelId: 'test-response-model-id',
            },
            providerMetadata: {
              testProvider: {
                testKey: 'testValue',
              },
            },
          }),
        }),
        prompt: 'prompt',
        topK: 0.1,
        topP: 0.2,
        frequencyPenalty: 0.3,
        presencePenalty: 0.4,
        temperature: 0.5,
        stopSequences: ['stop'],
        headers: {
          header1: 'value1',
          header2: 'value2',
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'test-function-id',
          metadata: {
            test1: 'value1',
            test2: false,
          },
          tracer,
        },
      });

      expect(tracer.jsonSpans).toMatchSnapshot();
    });

    it('should record successful tool call', async () => {
      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({}) => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
            ],
          }),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
        },
        prompt: 'test-input',
        experimental_telemetry: {
          isEnabled: true,
          tracer,
        },
        _internal: {
          generateId: () => 'test-id',
          currentDate: () => new Date(0),
        },
      });

      expect(tracer.jsonSpans).toMatchInlineSnapshot(`
        [
          {
            "attributes": {
              "ai.model.id": "mock-model-id",
              "ai.model.provider": "mock-provider",
              "ai.operationId": "ai.generateText",
              "ai.prompt": "{"prompt":"test-input"}",
              "ai.request.headers.user-agent": "ai/0.0.0-test",
              "ai.response.finishReason": "stop",
              "ai.response.toolCalls": "[{"toolCallId":"call-1","toolName":"tool1","input":"{ \\"value\\": \\"value\\" }"}]",
              "ai.settings.maxRetries": 2,
              "ai.usage.completionTokens": 10,
              "ai.usage.promptTokens": 3,
              "operation.name": "ai.generateText",
            },
            "events": [],
            "name": "ai.generateText",
          },
          {
            "attributes": {
              "ai.model.id": "mock-model-id",
              "ai.model.provider": "mock-provider",
              "ai.operationId": "ai.generateText.doGenerate",
              "ai.prompt.messages": "[{"role":"user","content":[{"type":"text","text":"test-input"}]}]",
              "ai.prompt.toolChoice": "{"type":"auto"}",
              "ai.prompt.tools": [
                "{"type":"function","name":"tool1","inputSchema":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false}}",
              ],
              "ai.request.headers.user-agent": "ai/0.0.0-test",
              "ai.response.finishReason": "stop",
              "ai.response.id": "test-id",
              "ai.response.model": "mock-model-id",
              "ai.response.timestamp": "1970-01-01T00:00:00.000Z",
              "ai.response.toolCalls": "[{"toolCallId":"call-1","toolName":"tool1","input":"{ \\"value\\": \\"value\\" }"}]",
              "ai.settings.maxRetries": 2,
              "ai.usage.completionTokens": 10,
              "ai.usage.promptTokens": 3,
              "gen_ai.request.model": "mock-model-id",
              "gen_ai.response.finish_reasons": [
                "stop",
              ],
              "gen_ai.response.id": "test-id",
              "gen_ai.response.model": "mock-model-id",
              "gen_ai.system": "mock-provider",
              "gen_ai.usage.input_tokens": 3,
              "gen_ai.usage.output_tokens": 10,
              "operation.name": "ai.generateText.doGenerate",
            },
            "events": [],
            "name": "ai.generateText.doGenerate",
          },
          {
            "attributes": {
              "ai.operationId": "ai.toolCall",
              "ai.toolCall.args": "{"value":"value"}",
              "ai.toolCall.id": "call-1",
              "ai.toolCall.name": "tool1",
              "ai.toolCall.result": ""result1"",
              "operation.name": "ai.toolCall",
            },
            "events": [],
            "name": "ai.toolCall",
          },
        ]
      `);
    });

    it('should record error on tool call', async () => {
      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({}) => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
            ],
          }),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => {
              throw new Error('Tool execution failed');
            },
          },
        },
        prompt: 'test-input',
        experimental_telemetry: {
          isEnabled: true,
          tracer,
        },
        _internal: {
          generateId: () => 'test-id',
          currentDate: () => new Date(0),
        },
      });

      expect(tracer.jsonSpans).toHaveLength(3);

      // Check that we have the expected spans
      expect(tracer.jsonSpans[0].name).toBe('ai.generateText');
      expect(tracer.jsonSpans[1].name).toBe('ai.generateText.doGenerate');
      expect(tracer.jsonSpans[2].name).toBe('ai.toolCall');

      // Check that the tool call span has error status
      const toolCallSpan = tracer.jsonSpans[2];
      expect(toolCallSpan.status).toEqual({
        code: 2,
        message: 'Tool execution failed',
      });

      expect(toolCallSpan.events).toHaveLength(1);
      const exceptionEvent = toolCallSpan.events[0];
      expect(exceptionEvent.name).toBe('exception');
      expect(exceptionEvent.attributes).toMatchObject({
        'exception.message': 'Tool execution failed',
        'exception.name': 'Error',
      });
      expect(exceptionEvent.attributes?.['exception.stack']).toContain(
        'Tool execution failed',
      );
      expect(exceptionEvent.time).toEqual([0, 0]);
    });

    it('should not record telemetry inputs / outputs when disabled', async () => {
      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({}) => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
            ],
          }),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
        },
        prompt: 'test-input',
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: false,
          recordOutputs: false,
          tracer,
        },
        _internal: {
          generateId: () => 'test-id',
          currentDate: () => new Date(0),
        },
      });

      expect(tracer.jsonSpans).toMatchSnapshot();
    });
  });

  describe('tool callbacks', () => {
    it('should invoke callbacks in the correct order', async () => {
      const recordedCalls: unknown[] = [];

      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => {
            return {
              ...dummyResponseValues,
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'test-tool',
                  input: `{ "value": "value" }`,
                },
              ],
            };
          },
        }),
        tools: {
          'test-tool': tool({
            inputSchema: jsonSchema<{ value: string }>({
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
            }),
            onInputAvailable: options => {
              recordedCalls.push({ type: 'onInputAvailable', options });
            },
            onInputStart: options => {
              recordedCalls.push({ type: 'onInputStart', options });
            },
            onInputDelta: options => {
              recordedCalls.push({ type: 'onInputDelta', options });
            },
          }),
        },
        toolChoice: 'required',
        prompt: 'test-input',
      });

      expect(recordedCalls).toMatchInlineSnapshot(`
        [
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call-1",
            },
            "type": "onInputStart",
          },
          {
            "options": {
              "abortSignal": undefined,
              "experimental_context": undefined,
              "input": {
                "value": "value",
              },
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "toolCallId": "call-1",
            },
            "type": "onInputAvailable",
          },
        ]
      `);
    });
  });

  describe('tools with custom schema', () => {
    it('should contain tool calls', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async ({ prompt, tools, toolChoice }) => {
            expect(tools).toStrictEqual([
              {
                type: 'function',
                name: 'tool1',
                description: undefined,
                inputSchema: {
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
                providerOptions: undefined,
              },
              {
                type: 'function',
                name: 'tool2',
                description: undefined,
                inputSchema: {
                  additionalProperties: false,
                  properties: { somethingElse: { type: 'string' } },
                  required: ['somethingElse'],
                  type: 'object',
                },
                providerOptions: undefined,
              },
            ]);

            expect(toolChoice).toStrictEqual({ type: 'required' });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                providerOptions: undefined,
              },
            ]);

            return {
              ...dummyResponseValues,
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: `{ "value": "value" }`,
                },
              ],
            };
          },
        }),
        tools: {
          tool1: {
            inputSchema: jsonSchema<{ value: string }>({
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
            }),
          },
          // 2nd tool to show typing:
          tool2: {
            inputSchema: jsonSchema<{ somethingElse: string }>({
              type: 'object',
              properties: { somethingElse: { type: 'string' } },
              required: ['somethingElse'],
              additionalProperties: false,
            }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
        _internal: {
          generateId: () => 'test-id',
          currentDate: () => new Date(0),
        },
      });

      // test type inference
      if (
        result.toolCalls[0].toolName === 'tool1' &&
        !result.toolCalls[0].dynamic
      ) {
        assertType<string>(result.toolCalls[0].input.value);
      }

      expect(result.toolCalls).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "value",
            },
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-call",
          },
        ]
      `);
    });
  });

  describe('provider-executed tools', () => {
    describe('two provider-executed tool calls and results', () => {
      let result: GenerateTextResult<any, any>;

      beforeEach(async () => {
        result = await generateText({
          model: new MockLanguageModelV2({
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'web_search',
                  input: `{ "value": "value" }`,
                  providerExecuted: true,
                },
                {
                  type: 'tool-result',
                  toolCallId: 'call-1',
                  toolName: 'web_search',
                  result: `{ "value": "result1" }`,
                },
                {
                  type: 'tool-call',
                  toolCallId: 'call-2',
                  toolName: 'web_search',
                  input: `{ "value": "value" }`,
                  providerExecuted: true,
                },
                {
                  type: 'tool-result',
                  toolCallId: 'call-2',
                  toolName: 'web_search',
                  result: 'ERROR',
                  isError: true,
                  providerExecuted: true,
                },
              ],
            }),
          }),
          tools: {
            web_search: {
              type: 'provider-defined',
              id: 'test.web_search',
              name: 'web_search',
              inputSchema: z.object({ value: z.string() }),
              outputSchema: z.object({ value: z.string() }),
              args: {},
            },
          },
          prompt: 'test-input',
          stopWhen: stepCountIs(4),
        });
      });

      it('should include provider-executed tool calls and results in the content', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": true,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "web_search",
              "type": "tool-call",
            },
            {
              "dynamic": undefined,
              "input": {
                "value": "value",
              },
              "output": "{ "value": "result1" }",
              "providerExecuted": true,
              "toolCallId": "call-1",
              "toolName": "web_search",
              "type": "tool-result",
            },
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": true,
              "providerMetadata": undefined,
              "toolCallId": "call-2",
              "toolName": "web_search",
              "type": "tool-call",
            },
            {
              "dynamic": undefined,
              "error": "ERROR",
              "input": {
                "value": "value",
              },
              "providerExecuted": true,
              "toolCallId": "call-2",
              "toolName": "web_search",
              "type": "tool-error",
            },
          ]
        `);
      });

      it('should include provider-executed tool calls in staticToolCalls', async () => {
        expect(result.staticToolCalls).toMatchInlineSnapshot(`
          [
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": true,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "web_search",
              "type": "tool-call",
            },
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": true,
              "providerMetadata": undefined,
              "toolCallId": "call-2",
              "toolName": "web_search",
              "type": "tool-call",
            },
          ]
        `);
      });

      it('should include provider-executed results in staticToolResults (errors excluded)', async () => {
        expect(result.staticToolResults).toMatchInlineSnapshot(`
          [
            {
              "dynamic": undefined,
              "input": {
                "value": "value",
              },
              "output": "{ "value": "result1" }",
              "providerExecuted": true,
              "toolCallId": "call-1",
              "toolName": "web_search",
              "type": "tool-result",
            },
          ]
        `);
      });

      it('should only execute a single step', async () => {
        expect(result.steps.length).toBe(1);
      });
    });
  });

  describe('options.messages', () => {
    it('should support models that use "this" context in supportedUrls', async () => {
      let supportedUrlsCalled = false;
      class MockLanguageModelWithImageSupport extends MockLanguageModelV2 {
        constructor() {
          super({
            supportedUrls() {
              supportedUrlsCalled = true;
              // Reference 'this' to verify context
              return this.modelId === 'mock-model-id'
                ? ({ 'image/*': [/^https:\/\/.*$/] } as Record<
                    string,
                    RegExp[]
                  >)
                : {};
            },
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            }),
          });
        }
      }

      const model = new MockLanguageModelWithImageSupport();

      const result = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', image: 'https://example.com/test.jpg' }],
          },
        ],
      });

      expect(result.text).toStrictEqual('Hello, world!');
      expect(supportedUrlsCalled).toBe(true);
    });
  });

  describe('options.output', () => {
    describe('no output', () => {
      it('should throw error when accessing output', async () => {
        const result = await generateText({
          model: new MockLanguageModelV2({
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [{ type: 'text', text: `Hello, world!` }],
            }),
          }),
          prompt: 'prompt',
        });

        expect(() => {
          result.experimental_output;
        }).toThrow('No output specified');
      });
    });

    describe('text output', () => {
      it('should forward text as output', async () => {
        const result = await generateText({
          model: new MockLanguageModelV2({
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [{ type: 'text', text: `Hello, world!` }],
            }),
          }),
          prompt: 'prompt',
          experimental_output: Output.text(),
        });

        expect(result.experimental_output).toStrictEqual('Hello, world!');
      });

      it('should set responseFormat to text and not change the prompt', async () => {
        let callOptions: LanguageModelV2CallOptions;

        await generateText({
          model: new MockLanguageModelV2({
            doGenerate: async args => {
              callOptions = args;
              return {
                ...dummyResponseValues,
                content: [{ type: 'text', text: `Hello, world!` }],
              };
            },
          }),
          prompt: 'prompt',
          experimental_output: Output.text(),
        });

        expect(callOptions!).toMatchInlineSnapshot(`
          {
            "abortSignal": undefined,
            "frequencyPenalty": undefined,
            "headers": {
              "user-agent": "ai/0.0.0-test",
            },
            "maxOutputTokens": undefined,
            "presencePenalty": undefined,
            "prompt": [
              {
                "content": [
                  {
                    "text": "prompt",
                    "type": "text",
                  },
                ],
                "providerOptions": undefined,
                "role": "user",
              },
            ],
            "providerOptions": undefined,
            "responseFormat": {
              "type": "text",
            },
            "seed": undefined,
            "stopSequences": undefined,
            "temperature": undefined,
            "toolChoice": undefined,
            "tools": undefined,
            "topK": undefined,
            "topP": undefined,
          }
        `);
      });
    });

    describe('object output', () => {
      it('should parse the output', async () => {
        const result = await generateText({
          model: new MockLanguageModelV2({
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [{ type: 'text', text: `{ "value": "test-value" }` }],
            }),
          }),
          prompt: 'prompt',
          experimental_output: Output.object({
            schema: z.object({ value: z.string() }),
          }),
        });

        expect(result.experimental_output).toEqual({ value: 'test-value' });
      });

      it('should set responseFormat to json and send schema as part of the responseFormat', async () => {
        let callOptions: LanguageModelV2CallOptions;

        await generateText({
          model: new MockLanguageModelV2({
            doGenerate: async args => {
              callOptions = args;
              return {
                ...dummyResponseValues,
                content: [{ type: 'text', text: `{ "value": "test-value" }` }],
              };
            },
          }),
          prompt: 'prompt',
          experimental_output: Output.object({
            schema: z.object({ value: z.string() }),
          }),
        });

        expect(callOptions!).toMatchInlineSnapshot(`
          {
            "abortSignal": undefined,
            "frequencyPenalty": undefined,
            "headers": {
              "user-agent": "ai/0.0.0-test",
            },
            "maxOutputTokens": undefined,
            "presencePenalty": undefined,
            "prompt": [
              {
                "content": [
                  {
                    "text": "prompt",
                    "type": "text",
                  },
                ],
                "providerOptions": undefined,
                "role": "user",
              },
            ],
            "providerOptions": undefined,
            "responseFormat": {
              "schema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "additionalProperties": false,
                "properties": {
                  "value": {
                    "type": "string",
                  },
                },
                "required": [
                  "value",
                ],
                "type": "object",
              },
              "type": "json",
            },
            "seed": undefined,
            "stopSequences": undefined,
            "temperature": undefined,
            "toolChoice": undefined,
            "tools": undefined,
            "topK": undefined,
            "topP": undefined,
          }
        `);
      });
    });

    it('should not parse output when finish reason is tool-calls', async () => {
      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => ({
            ...dummyResponseValues,
            finishReason: 'tool-calls',
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'testTool',
                input: `{ "value": "test" }`,
              },
            ],
          }),
        }),
        prompt: 'prompt',
        experimental_output: Output.object({
          schema: z.object({ summary: z.string() }),
        }),
        tools: {
          testTool: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'tool result',
          },
        },
      });

      // experimental_output should be undefined when finish reason is tool-calls
      expect(() => {
        result.experimental_output;
      }).toThrow('No output specified');

      // But tool calls should work normally
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolResults).toHaveLength(1);
    });
  });

  describe('tool execution errors', () => {
    let result: GenerateTextResult<any, any>;

    beforeEach(async () => {
      result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: `{ "value": "value" }`,
              },
            ],
          }),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => {
              throw new Error('test error');
            },
          },
        },
        prompt: 'test-input',
      });
    });

    it('should add tool error part to the content', async () => {
      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "value",
            },
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-call",
          },
          {
            "dynamic": false,
            "error": [Error: test error],
            "input": {
              "value": "value",
            },
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-error",
          },
        ]
      `);
    });

    it('should include error result in response messages', async () => {
      expect(result.response.messages).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerOptions": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "error-text",
                  "value": "test error",
                },
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
    });
  });

  describe('provider-executed tools', () => {
    it('should not call execute for provider-executed tool calls', async () => {
      let toolExecuted = false;

      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'providerTool',
                input: `{ "value": "test" }`,
                providerExecuted: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'providerTool',
                providerExecuted: true,
                result: { example: 'example' },
              },
            ],
            finishReason: 'stop',
          }),
        }),
        tools: {
          providerTool: {
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              toolExecuted = true;
              return `${value}-should-not-execute`;
            },
          },
        },
        prompt: 'test-input',
      });

      // tool should not be executed by client
      expect(toolExecuted).toBe(false);

      // tool call should still be included in content
      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "test",
            },
            "providerExecuted": true,
            "providerMetadata": undefined,
            "toolCallId": "call-1",
            "toolName": "providerTool",
            "type": "tool-call",
          },
          {
            "dynamic": undefined,
            "input": {
              "value": "test",
            },
            "output": {
              "example": "example",
            },
            "providerExecuted": true,
            "toolCallId": "call-1",
            "toolName": "providerTool",
            "type": "tool-result",
          },
        ]
      `);

      // tool results should include the result from the provider
      expect(result.toolResults).toMatchInlineSnapshot(`
        [
          {
            "dynamic": undefined,
            "input": {
              "value": "test",
            },
            "output": {
              "example": "example",
            },
            "providerExecuted": true,
            "toolCallId": "call-1",
            "toolName": "providerTool",
            "type": "tool-result",
          },
        ]
      `);
    });
  });

  describe('dynamic tools', () => {
    it('should execute dynamic tools', async () => {
      let toolExecuted = false;

      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'dynamicTool',
                input: `{ "value": "test" }`,
              },
            ],
            finishReason: 'tool-calls',
          }),
        }),
        tools: {
          dynamicTool: dynamicTool({
            inputSchema: z.object({ value: z.string() }),
            execute: async () => {
              toolExecuted = true;
              return { value: 'test-result' };
            },
          }),
        },
        prompt: 'test-input',
      });

      // tool should be executed by client
      expect(toolExecuted).toBe(true);

      // tool call should be included in content
      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "dynamic": true,
            "input": {
              "value": "test",
            },
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "toolCallId": "call-1",
            "toolName": "dynamicTool",
            "type": "tool-call",
          },
          {
            "dynamic": true,
            "input": {
              "value": "test",
            },
            "output": {
              "value": "test-result",
            },
            "toolCallId": "call-1",
            "toolName": "dynamicTool",
            "type": "tool-result",
          },
        ]
      `);
    });
  });

  describe('tool execution context', () => {
    it('should send context to tool execution', async () => {
      let recordedContext: unknown | undefined;

      const result = await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 't1',
                input: `{ "value": "test" }`,
              },
            ],
            finishReason: 'tool-calls',
          }),
        }),
        tools: {
          t1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }, { experimental_context }) => {
              recordedContext = experimental_context;
              return { value: 'test-result' };
            },
          }),
        },
        experimental_context: {
          context: 'test',
        },
        prompt: 'test-input',
      });

      // tool should be executed by client
      expect(recordedContext).toStrictEqual({
        context: 'test',
      });
    });
  });

  describe('invalid tool calls', () => {
    describe('single invalid tool call', () => {
      let result: GenerateTextResult<any, any>;

      beforeEach(async () => {
        result = await generateText({
          model: new MockLanguageModelV2({
            doGenerate: async () => ({
              warnings: [],
              usage: {
                inputTokens: 10,
                outputTokens: 20,
                totalTokens: 30,
              },
              finishReason: 'tool-calls',
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'cityAttractions',
                  // wrong tool call arguments (city vs cities):
                  input: `{ "cities": "San Francisco" }`,
                },
              ],
            }),
          }),
          tools: {
            cityAttractions: tool({
              inputSchema: z.object({ city: z.string() }),
            }),
          },
          prompt: 'What are the tourist attractions in San Francisco?',
        });
      });

      it('should add tool error part to the content', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "dynamic": true,
              "error": [AI_InvalidToolInputError: Invalid input for tool cityAttractions: Type validation failed: Value: {"cities":"San Francisco"}.
          Error message: [
            {
              "expected": "string",
              "code": "invalid_type",
              "path": [
                "city"
              ],
              "message": "Invalid input: expected string, received undefined"
            }
          ]],
              "input": {
                "cities": "San Francisco",
              },
              "invalid": true,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "cityAttractions",
              "type": "tool-call",
            },
            {
              "dynamic": true,
              "error": "Invalid input for tool cityAttractions: Type validation failed: Value: {"cities":"San Francisco"}.
          Error message: [
            {
              "expected": "string",
              "code": "invalid_type",
              "path": [
                "city"
              ],
              "message": "Invalid input: expected string, received undefined"
            }
          ]",
              "input": {
                "cities": "San Francisco",
              },
              "toolCallId": "call-1",
              "toolName": "cityAttractions",
              "type": "tool-error",
            },
          ]
        `);
      });

      it('should include error result in response messages', async () => {
        expect(result.response.messages).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "input": {
                    "cities": "San Francisco",
                  },
                  "providerExecuted": undefined,
                  "providerOptions": undefined,
                  "toolCallId": "call-1",
                  "toolName": "cityAttractions",
                  "type": "tool-call",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "output": {
                    "type": "error-text",
                    "value": "Invalid input for tool cityAttractions: Type validation failed: Value: {"cities":"San Francisco"}.
          Error message: [
            {
              "expected": "string",
              "code": "invalid_type",
              "path": [
                "city"
              ],
              "message": "Invalid input: expected string, received undefined"
            }
          ]",
                  },
                  "toolCallId": "call-1",
                  "toolName": "cityAttractions",
                  "type": "tool-result",
                },
              ],
              "role": "tool",
            },
          ]
        `);
      });
    });
  });

  describe('tools with preliminary results', () => {
    describe('single tool with preliminary results', () => {
      let result: GenerateTextResult<any, any>;

      beforeEach(async () => {
        result = await generateText({
          model: new MockLanguageModelV2({
            doGenerate: async () => ({
              warnings: [],
              usage: {
                inputTokens: 10,
                outputTokens: 20,
                totalTokens: 30,
              },
              finishReason: 'tool-calls',
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'cityAttractions',
                  input: `{ "city": "San Francisco" }`,
                },
              ],
            }),
          }),
          prompt: 'test-input',
          _internal: {
            generateId: () => 'test-id',
            currentDate: () => new Date(0),
          },
          tools: {
            cityAttractions: tool({
              inputSchema: z.object({ city: z.string() }),
              async *execute({ city }) {
                yield {
                  status: 'loading',
                  text: `Getting weather for ${city}`,
                };

                yield {
                  status: 'success',
                  text: `The weather in ${city} is 72°F`,
                  temperature: 72,
                };
              },
            }),
          },
        });
      });

      it('should only include final tool result in content', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "input": {
                "city": "San Francisco",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "cityAttractions",
              "type": "tool-call",
            },
            {
              "dynamic": false,
              "input": {
                "city": "San Francisco",
              },
              "output": {
                "status": "success",
                "temperature": 72,
                "text": "The weather in San Francisco is 72°F",
              },
              "toolCallId": "call-1",
              "toolName": "cityAttractions",
              "type": "tool-result",
            },
          ]
        `);
      });

      it('should only include final tool result in step content', async () => {
        expect(result.steps).toMatchInlineSnapshot(`
          [
            DefaultStepResult {
              "content": [
                {
                  "input": {
                    "city": "San Francisco",
                  },
                  "providerExecuted": undefined,
                  "providerMetadata": undefined,
                  "toolCallId": "call-1",
                  "toolName": "cityAttractions",
                  "type": "tool-call",
                },
                {
                  "dynamic": false,
                  "input": {
                    "city": "San Francisco",
                  },
                  "output": {
                    "status": "success",
                    "temperature": 72,
                    "text": "The weather in San Francisco is 72°F",
                  },
                  "toolCallId": "call-1",
                  "toolName": "cityAttractions",
                  "type": "tool-result",
                },
              ],
              "finishReason": "tool-calls",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "body": undefined,
                "headers": undefined,
                "id": "test-id",
                "messages": [
                  {
                    "content": [
                      {
                        "input": {
                          "city": "San Francisco",
                        },
                        "providerExecuted": undefined,
                        "providerOptions": undefined,
                        "toolCallId": "call-1",
                        "toolName": "cityAttractions",
                        "type": "tool-call",
                      },
                    ],
                    "role": "assistant",
                  },
                  {
                    "content": [
                      {
                        "output": {
                          "type": "json",
                          "value": {
                            "status": "success",
                            "temperature": 72,
                            "text": "The weather in San Francisco is 72°F",
                          },
                        },
                        "toolCallId": "call-1",
                        "toolName": "cityAttractions",
                        "type": "tool-result",
                      },
                    ],
                    "role": "tool",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "usage": {
                "inputTokens": 10,
                "outputTokens": 20,
                "totalTokens": 30,
              },
              "warnings": [],
            },
          ]
        `);
      });
    });
  });

  describe('logWarnings', () => {
    it('should call logWarnings with warnings from a single step', async () => {
      const expectedWarnings = [
        {
          type: 'other' as const,
          message: 'Setting is not supported',
        },
        {
          type: 'unsupported-setting' as const,
          setting: 'temperature',
          details: 'Temperature parameter not supported',
        },
      ];

      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
            warnings: expectedWarnings,
          },
        }),
        prompt: 'Hello',
      });

      expect(logWarningsSpy).toHaveBeenCalledOnce();
      expect(logWarningsSpy).toHaveBeenCalledWith(expectedWarnings);
    });

    it('should call logWarnings once for each step with warnings from that step', async () => {
      const warning1 = {
        type: 'other' as const,
        message: 'Warning from step 1',
      };
      const warning2 = {
        type: 'other' as const,
        message: 'Warning from step 2',
      };

      let callCount = 0;

      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async () => {
            switch (callCount++) {
              case 0:
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'tool-call',
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'testTool',
                      input: `{ "value": "test" }`,
                    },
                  ],
                  finishReason: 'tool-calls',
                  warnings: [warning1],
                };
              case 1:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Final response' }],
                  warnings: [warning2],
                };
              default:
                throw new Error('Unexpected call');
            }
          },
        }),
        prompt: 'Hello',
        tools: {
          testTool: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result',
          },
        },
        stopWhen: stepCountIs(3),
      });

      expect(logWarningsSpy).toHaveBeenCalledTimes(2);
      expect(logWarningsSpy).toHaveBeenNthCalledWith(1, [warning1]);
      expect(logWarningsSpy).toHaveBeenNthCalledWith(2, [warning2]);
    });

    it('should call logWarnings with empty array when no warnings are present', async () => {
      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
            warnings: [], // no warnings
          },
        }),
        prompt: 'Hello',
      });

      expect(logWarningsSpy).toHaveBeenCalledOnce();
      expect(logWarningsSpy).toHaveBeenCalledWith([]);
    });
  });

  describe('prepareStep with model switch and image URLs', () => {
    it('should use the prepareStep model supportedUrls for download decision', async () => {
      const downloadCalls: Array<{ url: URL; isUrlSupportedByModel: boolean }> =
        [];
      const languageModelCalls: Array<
        Parameters<LanguageModelV2['doGenerate']>[0]
      > = [];

      const modelWithImageUrlSupport = new MockLanguageModelV2({
        provider: 'with-image-url-support',
        modelId: 'with-image-url-support',
        supportedUrls: {
          'image/*': [/^https?:\/\/.*$/],
        },
        doGenerate: async options => {
          languageModelCalls.push(options);
          return {
            ...dummyResponseValues,
            content: [
              { type: 'text', text: 'response from with-image-url-support' },
            ],
          };
        },
      });

      const modelWithoutImageUrlSupport = new MockLanguageModelV2({
        provider: 'without-image-url-support',
        modelId: 'without-image-url-support',
        supportedUrls: {},
        doGenerate: async options => {
          languageModelCalls.push(options);
          return {
            ...dummyResponseValues,
            content: [
              { type: 'text', text: 'response from without-image-url-support' },
            ],
          };
        },
      });

      const customDownload = async (
        requestedDownloads: Array<{ url: URL; isUrlSupportedByModel: boolean }>,
      ) => {
        downloadCalls.push(...requestedDownloads);
        return requestedDownloads.map(download =>
          download.isUrlSupportedByModel
            ? null
            : {
                data: new Uint8Array([1, 2, 3, 4]),
                mediaType: 'image/png',
              },
        );
      };

      const result = await generateText({
        model: modelWithImageUrlSupport,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image' },
              { type: 'image', image: 'https://example.com/test.jpg' },
            ],
          },
        ],
        prepareStep: async () => {
          return { model: modelWithoutImageUrlSupport }; // model switch
        },
        experimental_download: customDownload,
      });

      expect(downloadCalls).toMatchInlineSnapshot(`
        [
          {
            "isUrlSupportedByModel": false,
            "url": "https://example.com/test.jpg",
          },
        ]
      `);

      expect(languageModelCalls).toMatchInlineSnapshot(`
        [
          {
            "abortSignal": undefined,
            "frequencyPenalty": undefined,
            "headers": {
              "user-agent": "ai/0.0.0-test",
            },
            "maxOutputTokens": undefined,
            "presencePenalty": undefined,
            "prompt": [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "Describe this image",
                    "type": "text",
                  },
                  {
                    "data": Uint8Array [
                      1,
                      2,
                      3,
                      4,
                    ],
                    "filename": undefined,
                    "mediaType": "image/png",
                    "providerOptions": undefined,
                    "type": "file",
                  },
                ],
                "providerOptions": undefined,
                "role": "user",
              },
            ],
            "providerOptions": undefined,
            "responseFormat": undefined,
            "seed": undefined,
            "stopSequences": undefined,
            "temperature": undefined,
            "toolChoice": undefined,
            "tools": undefined,
            "topK": undefined,
            "topP": undefined,
          },
        ]
      `);

      expect(result.text).toBe('response from without-image-url-support');
    });
  });

  describe('prepareStep model call settings', () => {
    it('applies overrides only to the current step', async () => {
      const calls: LanguageModelV2CallOptions[] = [];
      let responseCount = 0;

      await generateText({
        model: new MockLanguageModelV2({
          doGenerate: async options => {
            calls.push(options);

            if (responseCount++ === 0) {
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: 'call-1',
                    toolName: 'tool1',
                    input: '{}',
                  },
                ],
                finishReason: 'tool-calls',
              };
            }

            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'done' }],
            };
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({}),
            execute: async () => 'result',
          }),
        },
        prompt: 'test-input',
        stopWhen: stepCountIs(2),
        maxOutputTokens: 100,
        temperature: 1,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0.4,
        frequencyPenalty: 0.3,
        stopSequences: ['outer'],
        seed: 123,
        prepareStep: ({ stepNumber }) =>
          stepNumber === 0
            ? {
                maxOutputTokens: 50,
                temperature: 0,
                topP: 0.5,
                topK: 10,
                presencePenalty: 0,
                frequencyPenalty: -0.2,
                stopSequences: [],
                seed: 0,
              }
            : { temperature: undefined },
      });

      const selectSettings = ({
        maxOutputTokens,
        temperature,
        topP,
        topK,
        presencePenalty,
        frequencyPenalty,
        stopSequences,
        seed,
      }: LanguageModelV2CallOptions) => ({
        maxOutputTokens,
        temperature,
        topP,
        topK,
        presencePenalty,
        frequencyPenalty,
        stopSequences,
        seed,
      });

      expect(calls.map(selectSettings)).toEqual([
        {
          maxOutputTokens: 50,
          temperature: 0,
          topP: 0.5,
          topK: 10,
          presencePenalty: 0,
          frequencyPenalty: -0.2,
          stopSequences: [],
          seed: 0,
        },
        {
          maxOutputTokens: 100,
          temperature: 1,
          topP: 0.9,
          topK: 40,
          presencePenalty: 0.4,
          frequencyPenalty: 0.3,
          stopSequences: ['outer'],
          seed: 123,
        },
      ]);
    });
  });
});
