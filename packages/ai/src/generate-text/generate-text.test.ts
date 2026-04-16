import {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FunctionTool,
  LanguageModelV4Prompt,
  LanguageModelV4ProviderTool,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  dynamicTool,
  jsonSchema,
  ModelMessage,
  tool,
  ToolExecuteFunction,
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
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import {
  generateText,
  GenerateTextOnFinishCallback,
  GenerateTextOnStartCallback,
  GenerateTextOnStepFinishCallback,
  GenerateTextOnStepStartCallback,
  GenerateTextOnToolCallStartCallback,
  GenerateTextOnToolCallFinishCallback,
} from './generate-text';
import { GenerateTextResult } from './generate-text-result';
import { StepResult } from './step-result';
import { isLoopFinished, isStepCount } from './stop-condition';
vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

const testUsage: LanguageModelV4Usage = {
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

const dummyResponseValues = {
  finishReason: { unified: 'stop', raw: 'stop' } as const,
  usage: testUsage,
  warnings: [],
};

const modelWithSources = new MockLanguageModelV4({
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

const modelWithFiles = new MockLanguageModelV4({
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

const modelWithReasoning = new MockLanguageModelV4({
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

const defaultSettings = () =>
  ({
    prompt: 'prompt',
    experimental_generateMessageId: mockId({ prefix: 'msg' }),
    _internal: {
      generateId: mockId({ prefix: 'id' }),
      generateCallId: () => 'test-telemetry-call-id',
    },
    onError: () => {},
  }) as const;

describe('generateText', () => {
  let logWarningsSpy: ReturnType<typeof vitest.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    logWarningsSpy = vitest
      .spyOn(logWarningsModule, 'logWarnings')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    logWarningsSpy.mockRestore();
  });

  describe('result.content', () => {
    it('should generate content', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
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
            "title": undefined,
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

    it('should include custom parts in content', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
          doGenerate: {
            ...dummyResponseValues,
            content: [
              { type: 'text', text: 'Hello' },
              {
                type: 'custom',
                kind: 'openai.compaction',
                providerMetadata: {
                  openai: { itemId: 'cmp_123' },
                },
              },
              {
                type: 'custom',
                kind: 'openai.other',
              },
            ],
          },
        }),
        prompt: 'prompt',
      });

      expect(result.content).toStrictEqual([
        { type: 'text', text: 'Hello' },
        {
          type: 'custom',
          kind: 'openai.compaction',
          providerMetadata: {
            openai: { itemId: 'cmp_123' },
          },
        },
        {
          type: 'custom',
          kind: 'openai.other',
        },
      ]);
    });

    it('should include reasoning-file in content and exclude from files', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
          doGenerate: {
            ...dummyResponseValues,
            content: [
              { type: 'text', text: 'Here is a thought image:' },
              {
                type: 'reasoning-file',
                data: new Uint8Array([10, 20, 30]),
                mediaType: 'image/png',
                providerMetadata: {
                  google: { thoughtSignature: 'sig123' },
                },
              },
              {
                type: 'file',
                data: new Uint8Array([40, 50, 60]),
                mediaType: 'image/jpeg',
              },
            ],
          },
        }),
        prompt: 'prompt',
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "Here is a thought image:",
            "type": "text",
          },
          {
            "file": DefaultGeneratedFile {
              "base64Data": "ChQe",
              "mediaType": "image/png",
              "uint8ArrayData": Uint8Array [
                10,
                20,
                30,
              ],
            },
            "providerMetadata": {
              "google": {
                "thoughtSignature": "sig123",
              },
            },
            "type": "reasoning-file",
          },
          {
            "file": DefaultGeneratedFile {
              "base64Data": "KDI8",
              "mediaType": "image/jpeg",
              "uint8ArrayData": Uint8Array [
                40,
                50,
                60,
              ],
            },
            "type": "file",
          },
        ]
      `);

      expect(result.files).toMatchInlineSnapshot(`
        [
          DefaultGeneratedFile {
            "base64Data": "KDI8",
            "mediaType": "image/jpeg",
            "uint8ArrayData": Uint8Array [
              40,
              50,
              60,
            ],
          },
        ]
      `);
    });
  });

  describe('result.text', () => {
    it('should generate text', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
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
          generateCallId: () => 'test-telemetry-call-id',
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
          generateCallId: () => 'test-telemetry-call-id',
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
          generateCallId: () => 'test-telemetry-call-id',
        },
      });

      expect(result.steps).toMatchSnapshot();
    });
  });

  describe('result.toolCalls', () => {
    it('should contain tool calls', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
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
            "title": undefined,
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
        model: new MockLanguageModelV4({
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
        model: new MockLanguageModelV4({
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
        model: new MockLanguageModelV4({
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
        model: new MockLanguageModelV4({
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
    it('should contain request body by default', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
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

    it('should exclude request body when retention.requestBody is false', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async ({}) => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
            request: {
              body: 'test body',
            },
          }),
        }),
        prompt: 'prompt',
        experimental_include: { requestBody: false },
      });

      expect(result.request).toStrictEqual({
        body: undefined,
      });
    });
  });

  describe('result.response', () => {
    it('should contain response body and headers', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
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

  describe('options.experimental_onStart', () => {
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
        experimental_telemetry: {
          functionId: 'test-function',
        },
        _internal: {
          generateId: () => 'test-call-id',
          generateCallId: () => 'test-telemetry-call-id',
        },
        experimental_onStart: async event => {
          startEvent = event;
        },
      });

      expect(startEvent).toMatchSnapshot();
    });

    it('should pass context', async () => {
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
        context: { userId: 'test-user', sessionId: '123' },
        experimental_onStart: async event => {
          startEvent = event;
        },
      });

      expect(startEvent.context).toEqual({
        userId: 'test-user',
        sessionId: '123',
      });
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
        system: 'you are a helpful assistant',
        messages: [{ role: 'user', content: 'test-message' }],
        maxOutputTokens: 100,
        temperature: 0.5,
        experimental_onStart: async event => {
          startEvent = event;
        },
      });

      expect(startEvent.provider).toBe('mock-provider');
      expect(startEvent.modelId).toBe('mock-model-id');
      expect(startEvent.system).toBe('you are a helpful assistant');
      expect(startEvent.prompt).toBeUndefined();
      expect(startEvent.messages).toEqual([
        { role: 'user', content: 'test-message' },
      ]);
      expect(startEvent.maxOutputTokens).toBe(100);
      expect(startEvent.temperature).toBe(0.5);
      expect(startEvent.maxRetries).toBe(2);
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
        experimental_onStart: async () => {
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
        experimental_onStart: async () => {
          throw new Error('callback error');
        },
      });

      expect(result.text).toBe('Hello, World!');
    });
  });

  describe('options.experimental_onStepStart', () => {
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
        experimental_onStepStart: async event => {
          stepStartEvent = event;
        },
      });

      expect(stepStartEvent.stepNumber).toBe(0);
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
        experimental_onStepStart: async event => {
          stepStartEvents.push(event);
        },
      });

      expect(stepStartEvents.length).toBe(2);
      expect(stepStartEvents[0].stepNumber).toBe(0);
      expect(stepStartEvents[1].stepNumber).toBe(1);
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
        experimental_onStepStart: async () => {
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
        experimental_onStepStart: async () => {
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
        experimental_onStepStart: async event => {
          stepStartEvents.push(event);
        },
      });

      expect(stepStartEvents[0].provider).toBe('mock-provider');
      expect(stepStartEvents[0].modelId).toBe('mock-model-id');
      expect(stepStartEvents[1].provider).toBe('alternate-provider');
      expect(stepStartEvents[1].modelId).toBe('alternate-model-id');
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
        experimental_onStepStart: async event => {
          stepStartEvent = event;
        },
      });

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
        experimental_onStepStart: async event => {
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
        experimental_onStepStart: async event => {
          stepStartEvents.push(event);
        },
      });

      expect(stepStartEvents.length).toBe(2);

      // Step 1 should see step 0's text
      expect(stepStartEvents[1].steps[0].text).toBe('Thinking...');
    });

    it('should pass context', async () => {
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
        context: { userId: 'test-user', requestId: 'req-123' },
        experimental_onStepStart: async event => {
          stepStartEvent = event;
        },
      });

      expect(stepStartEvent.context).toEqual({
        userId: 'test-user',
        requestId: 'req-123',
      });
    });

    it('should pass updated context from prepareStep', async () => {
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
        context: { counter: 0 },
        stopWhen: isStepCount(3),
        prepareStep: async ({ context, stepNumber }) => {
          return {
            context: {
              counter: (context as any).counter + 1,
              stepNumber,
            },
          };
        },
        experimental_onStepStart: async event => {
          stepStartEvents.push(event);
        },
      });

      expect(stepStartEvents[0].context).toEqual({
        counter: 1,
        stepNumber: 0,
      });
      expect(stepStartEvents[1].context).toEqual({
        counter: 2,
        stepNumber: 1,
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
        experimental_onStepStart: async event => {
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
        experimental_onStepStart: async event => {
          startStepNumbers.push(event.stepNumber);
        },
        onStepFinish: async event => {
          finishStepNumbers.push(event.stepNumber);
        },
      });

      expect(startStepNumbers).toEqual(finishStepNumbers);
    });
  });

  describe('options.experimental_onToolCallStart', () => {
    it('should be called with correct tool name, id, and input', async () => {
      const toolCallStartEvents: Parameters<
        GenerateTextOnToolCallStartCallback<any>
      >[0][] = [];

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
        experimental_onToolCallStart: async event => {
          toolCallStartEvents.push(event);
        },
      });

      expect(toolCallStartEvents.length).toBe(1);
      expect(toolCallStartEvents[0]).toMatchSnapshot();
    });

    it('should be called once per tool call in a multi-tool step', async () => {
      const toolCallStartEvents: Parameters<
        GenerateTextOnToolCallStartCallback<any>
      >[0][] = [];

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
        prompt: 'test-input',
        experimental_onToolCallStart: async event => {
          toolCallStartEvents.push(event);
        },
      });

      expect(toolCallStartEvents.length).toBe(2);
      expect(toolCallStartEvents[0].toolCall.toolCallId).toBe('call-1');
      expect(toolCallStartEvents[1].toolCall.toolCallId).toBe('call-2');
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
        experimental_onToolCallStart: async () => {
          callOrder.push('onToolCallStart');
        },
      });

      expect(callOrder.indexOf('onToolCallStart')).toBeLessThan(
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
        experimental_onToolCallStart: async () => {
          throw new Error('callback error');
        },
      });

      expect(result.toolResults.length).toBe(1);
      expect(result.toolResults[0].output).toBe('test-result');
    });

    it('should not fire for tools without execute', async () => {
      const toolCallStartEvents: Parameters<
        GenerateTextOnToolCallStartCallback<any>
      >[0][] = [];

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
        experimental_onToolCallStart: async event => {
          toolCallStartEvents.push(event);
        },
      });

      expect(toolCallStartEvents.length).toBe(0);
    });

    it('should pass context', async () => {
      const toolCallStartEvents: Parameters<
        GenerateTextOnToolCallStartCallback<any>
      >[0][] = [];

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
        experimental_onToolCallStart: async event => {
          toolCallStartEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(toolCallStartEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": {
              "context": "test",
            },
            "functionId": undefined,
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "modelId": "mock-model-id",
            "provider": "mock-provider",
            "stepNumber": 0,
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
          },
        ]
      `);
    });
  });

  describe('options.experimental_onToolCallFinish', () => {
    it('should be called with correct data on success', async () => {
      const toolCallFinishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
      >[0][] = [];

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
        experimental_onToolCallFinish: async event => {
          toolCallFinishEvents.push(event);
        },
      });

      expect(toolCallFinishEvents.length).toBe(1);
      expect(toolCallFinishEvents[0].toolCall.toolName).toBe('tool1');
      expect(toolCallFinishEvents[0].toolCall.toolCallId).toBe('call-1');
      expect(toolCallFinishEvents[0].toolCall.input).toEqual({
        value: 'test-arg',
      });
      expect(toolCallFinishEvents[0].success).toBe(true);
      expect(toolCallFinishEvents[0].output).toBe('test-arg-result');
      expect(toolCallFinishEvents[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should be called with error data when tool execution fails', async () => {
      const toolCallFinishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
      >[0][] = [];
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
        prompt: 'test-input',
        experimental_onToolCallFinish: async event => {
          toolCallFinishEvents.push(event);
        },
      });

      expect(toolCallFinishEvents.length).toBe(1);
      expect(toolCallFinishEvents[0].toolCall.toolName).toBe('tool1');
      expect(toolCallFinishEvents[0].toolCall.toolCallId).toBe('call-1');
      expect(toolCallFinishEvents[0].success).toBe(false);
      expect(toolCallFinishEvents[0].error).toBe(toolError);
      expect(toolCallFinishEvents[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should have a positive durationMs', async () => {
      const toolCallFinishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
      >[0][] = [];

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
        experimental_onToolCallFinish: async event => {
          toolCallFinishEvents.push(event);
        },
      });

      expect(toolCallFinishEvents[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof toolCallFinishEvents[0].durationMs).toBe('number');
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
        experimental_onToolCallFinish: async () => {
          throw new Error('callback error');
        },
      });

      expect(result.toolResults.length).toBe(1);
      expect(result.toolResults[0].output).toBe('test-result');
    });

    it('should not fire for tools without execute', async () => {
      const toolCallFinishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
      >[0][] = [];

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
        experimental_onToolCallFinish: async event => {
          toolCallFinishEvents.push(event);
        },
      });

      expect(toolCallFinishEvents.length).toBe(0);
    });

    it('should pass context on success', async () => {
      const toolCallFinishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
      >[0][] = [];

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
        experimental_onToolCallFinish: async event => {
          toolCallFinishEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(toolCallFinishEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": {
              "context": "test",
            },
            "durationMs": 0,
            "functionId": undefined,
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "modelId": "mock-model-id",
            "output": "test-result",
            "provider": "mock-provider",
            "stepNumber": 0,
            "success": true,
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
          },
        ]
      `);
    });

    it('should pass context on error', async () => {
      const toolCallFinishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
      >[0][] = [];
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
        experimental_onToolCallFinish: async event => {
          toolCallFinishEvents.push(event);
        },
        ...defaultSettings(),
      });

      expect(toolCallFinishEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": {
              "context": "test",
            },
            "durationMs": 0,
            "error": [Error: Tool execution failed],
            "functionId": undefined,
            "messages": [
              {
                "content": "prompt",
                "role": "user",
              },
            ],
            "modelId": "mock-model-id",
            "provider": "mock-provider",
            "stepNumber": 0,
            "success": false,
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
          },
        ]
      `);
    });
  });

  describe('options.experimental_onToolCallStart and experimental_onToolCallFinish ordering', () => {
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
        experimental_onToolCallStart: async () => {
          callOrder.push('onToolCallStart');
        },
        experimental_onToolCallFinish: async () => {
          callOrder.push('onToolCallFinish');
        },
      });

      expect(callOrder).toEqual(['onToolCallStart', 'onToolCallFinish']);
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
        experimental_onToolCallStart: async () => {
          callOrder.push('onToolCallStart');
        },
        experimental_onToolCallFinish: async () => {
          callOrder.push('onToolCallFinish');
        },
        onStepFinish: async () => {
          callOrder.push('onStepFinish');
        },
      });

      expect(callOrder).toEqual([
        'onToolCallStart',
        'onToolCallFinish',
        'onStepFinish',
      ]);
    });

    it('should fire tool call callbacks for each tool in a multi-step loop', async () => {
      const toolCallStartEvents: Parameters<
        GenerateTextOnToolCallStartCallback<any>
      >[0][] = [];
      const toolCallFinishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
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
        experimental_onToolCallStart: async event => {
          toolCallStartEvents.push(event);
        },
        experimental_onToolCallFinish: async event => {
          toolCallFinishEvents.push(event);
        },
      });

      expect(toolCallStartEvents.length).toBe(2);
      expect(toolCallFinishEvents.length).toBe(2);

      expect(toolCallStartEvents[0].toolCall.toolCallId).toBe('call-1');
      expect(toolCallStartEvents[1].toolCall.toolCallId).toBe('call-2');

      expect(toolCallFinishEvents[0].success).toBe(true);
      expect(toolCallFinishEvents[0].output).toBe('step0-result');
      expect(toolCallFinishEvents[1].success).toBe(true);
      expect(toolCallFinishEvents[1].output).toBe('step1-result');
    });
  });

  describe('options.onFinish', () => {
    it('should send correct information', async () => {
      let result!: Parameters<GenerateTextOnFinishCallback<any, any>>[0];

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
        onFinish: async event => {
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
          "context": {},
          "dynamicToolCalls": [],
          "dynamicToolResults": [],
          "files": [],
          "finishReason": "stop",
          "functionId": undefined,
          "model": {
            "modelId": "mock-model-id",
            "provider": "mock-provider",
          },
          "providerMetadata": undefined,
          "rawFinishReason": "stop",
          "reasoning": [],
          "reasoningText": undefined,
          "request": {},
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
              "context": {},
              "finishReason": "stop",
              "functionId": undefined,
              "model": {
                "modelId": "mock-model-id",
                "provider": "mock-provider",
              },
              "providerMetadata": undefined,
              "rawFinishReason": "stop",
              "request": {},
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
              "stepNumber": 0,
              "toolsContext": {},
              "usage": {
                "cachedInputTokens": undefined,
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
                "reasoningTokens": undefined,
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
            "cachedInputTokens": undefined,
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
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "usage": {
            "cachedInputTokens": undefined,
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
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "warnings": [],
        }
      `);
    });
  });

  describe('options.stopWhen', () => {
    let result: GenerateTextResult<any, any, any>;
    let onFinishResult: Parameters<GenerateTextOnFinishCallback<any, any>>[0];
    let onStepFinishResults: StepResult<any, any>[];

    beforeEach(() => {
      result = undefined as any;
      onFinishResult = undefined as any;
      onStepFinishResults = [];
    });

    describe('2 steps: initial, tool-result', () => {
      beforeEach(async () => {
        let responseCount = 0;
        result = await generateText({
          model: new MockLanguageModelV4({
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
                    finishReason: { unified: 'tool-calls', raw: undefined },
                    usage: {
                      inputTokens: {
                        total: 10,
                        noCache: 10,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                      },
                      outputTokens: {
                        total: 5,
                        text: 5,
                        reasoning: undefined,
                      },
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
              title: 'Tool One',
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
          _internal: {
            generateId: () => 'test-call-id',
            generateCallId: () => 'test-telemetry-call-id',
          },
          onFinish: async event => {
            onFinishResult = event as unknown as typeof onFinishResult;
          },
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          stopWhen: isStepCount(3),
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
            "inputTokenDetails": {
              "cacheReadTokens": undefined,
              "cacheWriteTokens": undefined,
              "noCacheTokens": 13,
            },
            "inputTokens": 13,
            "outputTokenDetails": {
              "reasoningTokens": undefined,
              "textTokens": 15,
            },
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
            "reasoningTokens": undefined,
            "totalTokens": 13,
          }
        `);
      });

      it('result.steps should contain all steps', () => {
        expect(result.steps).toMatchSnapshot();
      });

      describe('callbacks', () => {
        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchSnapshot();
        });

        it('onStepFinish should be called for each step', () => {
          expect(onStepFinishResults).toMatchSnapshot();
        });
      });
    });

    describe('2 steps: initial, tool-result with prepareStep', () => {
      let result: GenerateTextResult<any, any, any>;
      let onStepFinishResults: StepResult<any, any>[];
      let doGenerateCalls: Array<LanguageModelV4CallOptions>;
      let prepareStepCalls: Array<{
        modelId: string;
        stepNumber: number;
        steps: Array<StepResult<any, any>>;
        messages: Array<ModelMessage>;
        context: unknown;
      }>;

      beforeEach(async () => {
        onStepFinishResults = [];
        doGenerateCalls = [];
        prepareStepCalls = [];

        let responseCount = 0;

        const trueModel = new MockLanguageModelV4({
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
                  finishReason: { unified: 'tool-calls', raw: undefined },
                  usage: {
                    inputTokens: {
                      total: 10,
                      noCache: 10,
                      cacheRead: undefined,
                      cacheWrite: undefined,
                    },
                    outputTokens: {
                      total: 5,
                      text: 5,
                      reasoning: undefined,
                    },
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
          context: { context: 'state1' },
          prompt: 'test-input',
          _internal: {
            generateId: () => 'test-call-id',
            generateCallId: () => 'test-telemetry-call-id',
          },
          stopWhen: isStepCount(3),
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          prepareStep: async ({
            model,
            stepNumber,
            steps,
            messages,
            context,
          }) => {
            prepareStepCalls.push({
              modelId: typeof model === 'string' ? model : model.modelId,
              stepNumber,
              steps,
              messages,
              context,
            });

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
                context: { context: 'state2' },
              };
            }

            if (stepNumber === 1) {
              expect(steps.length).toStrictEqual(1);
              return {
                model: trueModel,
                activeTools: [],
                system: 'system-message-1',
                context: { context: 'state3' },
              };
            }
          },
        });
      });

      it('should contain all prepareStep calls', async () => {
        expect(prepareStepCalls).toMatchInlineSnapshot(`
          [
            {
              "context": {
                "context": "state1",
              },
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "modelId": "mock-model-id",
              "stepNumber": 0,
              "steps": [
                DefaultStepResult {
                  "callId": "test-telemetry-call-id",
                  "content": [
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
                      "output": "result1",
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "context": {
                    "context": "state2",
                  },
                  "finishReason": "tool-calls",
                  "functionId": undefined,
                  "model": {
                    "modelId": "mock-model-id",
                    "provider": "mock-provider",
                  },
                  "providerMetadata": undefined,
                  "rawFinishReason": undefined,
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
                  "stepNumber": 0,
                  "toolsContext": {},
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokenDetails": {
                      "cacheReadTokens": undefined,
                      "cacheWriteTokens": undefined,
                      "noCacheTokens": 10,
                    },
                    "inputTokens": 10,
                    "outputTokenDetails": {
                      "reasoningTokens": undefined,
                      "textTokens": 5,
                    },
                    "outputTokens": 5,
                    "raw": undefined,
                    "reasoningTokens": undefined,
                    "totalTokens": 15,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "callId": "test-telemetry-call-id",
                  "content": [
                    {
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "context": {
                    "context": "state3",
                  },
                  "finishReason": "stop",
                  "functionId": undefined,
                  "model": {
                    "modelId": "mock-model-id",
                    "provider": "mock-provider",
                  },
                  "providerMetadata": undefined,
                  "rawFinishReason": "stop",
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
                  "stepNumber": 1,
                  "toolsContext": {},
                  "usage": {
                    "cachedInputTokens": undefined,
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
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
              ],
            },
            {
              "context": {
                "context": "state2",
              },
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
              "modelId": "mock-model-id",
              "stepNumber": 1,
              "steps": [
                DefaultStepResult {
                  "callId": "test-telemetry-call-id",
                  "content": [
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
                      "output": "result1",
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "context": {
                    "context": "state2",
                  },
                  "finishReason": "tool-calls",
                  "functionId": undefined,
                  "model": {
                    "modelId": "mock-model-id",
                    "provider": "mock-provider",
                  },
                  "providerMetadata": undefined,
                  "rawFinishReason": undefined,
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
                  "stepNumber": 0,
                  "toolsContext": {},
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokenDetails": {
                      "cacheReadTokens": undefined,
                      "cacheWriteTokens": undefined,
                      "noCacheTokens": 10,
                    },
                    "inputTokens": 10,
                    "outputTokenDetails": {
                      "reasoningTokens": undefined,
                      "textTokens": 5,
                    },
                    "outputTokens": 5,
                    "raw": undefined,
                    "reasoningTokens": undefined,
                    "totalTokens": 15,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "callId": "test-telemetry-call-id",
                  "content": [
                    {
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "context": {
                    "context": "state3",
                  },
                  "finishReason": "stop",
                  "functionId": undefined,
                  "model": {
                    "modelId": "mock-model-id",
                    "provider": "mock-provider",
                  },
                  "providerMetadata": undefined,
                  "rawFinishReason": "stop",
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
                  "stepNumber": 1,
                  "toolsContext": {},
                  "usage": {
                    "cachedInputTokens": undefined,
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
              "tools": undefined,
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
            "inputTokenDetails": {
              "cacheReadTokens": undefined,
              "cacheWriteTokens": undefined,
              "noCacheTokens": 13,
            },
            "inputTokens": 13,
            "outputTokenDetails": {
              "reasoningTokens": undefined,
              "textTokens": 15,
            },
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
      let result: GenerateTextResult<any, any, any>;
      let stopConditionCalls: Array<{
        number: number;
        steps: StepResult<any, any>[];
      }>;

      beforeEach(async () => {
        stopConditionCalls = [];

        let responseCount = 0;
        result = await generateText({
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
                        input: `{ "value": "value" }`,
                      },
                    ],
                    finishReason: { unified: 'tool-calls', raw: undefined },
                    usage: {
                      inputTokens: {
                        total: 10,
                        noCache: 10,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                      },
                      outputTokens: {
                        total: 5,
                        text: 5,
                        reasoning: undefined,
                      },
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
          _internal: {
            generateId: () => 'test-call-id',
            generateCallId: () => 'test-telemetry-call-id',
          },
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
                  "callId": "test-telemetry-call-id",
                  "content": [
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
                      "output": "result1",
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "context": {},
                  "finishReason": "tool-calls",
                  "functionId": undefined,
                  "model": {
                    "modelId": "mock-model-id",
                    "provider": "mock-provider",
                  },
                  "providerMetadata": undefined,
                  "rawFinishReason": undefined,
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
                  "stepNumber": 0,
                  "toolsContext": {},
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokenDetails": {
                      "cacheReadTokens": undefined,
                      "cacheWriteTokens": undefined,
                      "noCacheTokens": 10,
                    },
                    "inputTokens": 10,
                    "outputTokenDetails": {
                      "reasoningTokens": undefined,
                      "textTokens": 5,
                    },
                    "outputTokens": 5,
                    "raw": undefined,
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
                  "callId": "test-telemetry-call-id",
                  "content": [
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
                      "output": "result1",
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "context": {},
                  "finishReason": "tool-calls",
                  "functionId": undefined,
                  "model": {
                    "modelId": "mock-model-id",
                    "provider": "mock-provider",
                  },
                  "providerMetadata": undefined,
                  "rawFinishReason": undefined,
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
                  "stepNumber": 0,
                  "toolsContext": {},
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokenDetails": {
                      "cacheReadTokens": undefined,
                      "cacheWriteTokens": undefined,
                      "noCacheTokens": 10,
                    },
                    "inputTokens": 10,
                    "outputTokenDetails": {
                      "reasoningTokens": undefined,
                      "textTokens": 5,
                    },
                    "outputTokens": 5,
                    "raw": undefined,
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

    it('should complete tool loop with isLoopFinished()', async () => {
      let responseCount = 0;
      const result = await generateText({
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
                      input: `{ "value": "value" }`,
                    },
                  ],
                  finishReason: { unified: 'tool-calls', raw: undefined },
                };
              case 1:
                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Done!' }],
                };
              default:
                throw new Error(`Unexpected response count: ${responseCount}`);
            }
          },
        }),
        tools: {
          tool1: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result1',
          }),
        },
        prompt: 'test-input',
        stopWhen: isLoopFinished(),
      });

      expect(result.text).toBe('Done!');
      expect(result.steps).toHaveLength(2);
    });
  });

  describe('options.headers', () => {
    it('should pass headers to model', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
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
        model: new MockLanguageModelV4({
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

  describe('options.reasoning', () => {
    it('should pass reasoning to model doGenerate call', async () => {
      const model = new MockLanguageModelV4({
        doGenerate: {
          ...dummyResponseValues,
          content: [{ type: 'text', text: 'test' }],
        },
      });

      await generateText({
        model,
        prompt: 'test-input',
        reasoning: 'high',
      });

      expect(model.doGenerateCalls[0].reasoning).toBe('high');
    });

    it('should pass through provider-default', async () => {
      const model = new MockLanguageModelV4({
        doGenerate: {
          ...dummyResponseValues,
          content: [{ type: 'text', text: 'test' }],
        },
      });

      await generateText({
        model,
        prompt: 'test-input',
        reasoning: 'provider-default',
      });

      expect(model.doGenerateCalls[0].reasoning).toBe('provider-default');
    });
  });

  describe('options.abortSignal', () => {
    it('should forward abort signal to tool execution', async () => {
      const abortController = new AbortController();
      const toolExecuteMock = vi.fn().mockResolvedValue('tool result');

      const generateTextPromise = generateText({
        model: new MockLanguageModelV4({
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
          context: undefined,
        },
      );
    });
  });

  describe('options.timeout', () => {
    it('should forward timeout as abort signal to model', async () => {
      let receivedAbortSignal: AbortSignal | undefined;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async ({ abortSignal }) => {
            receivedAbortSignal = abortSignal;
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            };
          },
        }),
        prompt: 'test-input',
        timeout: 5000,
      });

      expect(receivedAbortSignal).toBeDefined();
    });

    it('should merge timeout with abort signal', async () => {
      const abortController = new AbortController();
      let receivedAbortSignal: AbortSignal | undefined;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async ({ abortSignal }) => {
            receivedAbortSignal = abortSignal;
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            };
          },
        }),
        prompt: 'test-input',
        timeout: 5000,
        abortSignal: abortController.signal,
      });

      // The merged signal should be different from the original
      expect(receivedAbortSignal).toBeDefined();
      expect(receivedAbortSignal).not.toBe(abortController.signal);
    });

    it('should pass undefined when no timeout or abortSignal provided', async () => {
      let receivedAbortSignal: AbortSignal | undefined = 'not-set' as any;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async ({ abortSignal }) => {
            receivedAbortSignal = abortSignal;
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            };
          },
        }),
        prompt: 'test-input',
      });

      expect(receivedAbortSignal).toBeUndefined();
    });

    it('should forward timeout abort signal to tool execution', async () => {
      const toolExecuteMock = vi.fn().mockResolvedValue('tool result');

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
        timeout: 5000,
      });

      expect(toolExecuteMock).toHaveBeenCalledWith(
        { value: 'value' },
        {
          abortSignal: expect.any(AbortSignal),
          toolCallId: 'call-1',
          messages: expect.any(Array),
          context: undefined,
        },
      );
    });

    it('should support timeout object with totalMs', async () => {
      let receivedAbortSignal: AbortSignal | undefined;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async ({ abortSignal }) => {
            receivedAbortSignal = abortSignal;
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            };
          },
        }),
        prompt: 'test-input',
        timeout: { totalMs: 5000 },
      });

      expect(receivedAbortSignal).toBeDefined();
    });

    it('should merge timeout object with abort signal', async () => {
      const abortController = new AbortController();
      let receivedAbortSignal: AbortSignal | undefined;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async ({ abortSignal }) => {
            receivedAbortSignal = abortSignal;
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            };
          },
        }),
        prompt: 'test-input',
        timeout: { totalMs: 5000 },
        abortSignal: abortController.signal,
      });

      // The merged signal should be different from the original
      expect(receivedAbortSignal).toBeDefined();
      expect(receivedAbortSignal).not.toBe(abortController.signal);
    });

    it('should pass undefined when timeout object has no totalMs', async () => {
      let receivedAbortSignal: AbortSignal | undefined = 'not-set' as any;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async ({ abortSignal }) => {
            receivedAbortSignal = abortSignal;
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            };
          },
        }),
        prompt: 'test-input',
        timeout: {},
      });

      expect(receivedAbortSignal).toBeUndefined();
    });

    it('should forward stepMs as abort signal to each step', async () => {
      const receivedAbortSignals: (AbortSignal | undefined)[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async ({ abortSignal }) => {
            receivedAbortSignals.push(abortSignal);
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            };
          },
        }),
        prompt: 'test-input',
        timeout: { stepMs: 5000 },
      });

      expect(receivedAbortSignals.length).toBe(1);
      expect(receivedAbortSignals[0]).toBeDefined();
    });

    it('should reuse the same abort signal for all steps when stepMs is set', async () => {
      const receivedAbortSignals: (AbortSignal | undefined)[] = [];
      let stepCount = 0;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async ({ abortSignal }) => {
            receivedAbortSignals.push(abortSignal);
            stepCount++;
            if (stepCount === 1) {
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: 'call-1',
                    toolName: 'tool1',
                    input: `{ "value": "test" }`,
                  },
                ],
              };
            }
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Final response' }],
            };
          },
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'tool result',
          },
        },
        prompt: 'test-input',
        timeout: { stepMs: 5000 },
        stopWhen: isStepCount(2),
      });

      expect(receivedAbortSignals.length).toBe(2);
      // The same abort signal is reused for all steps (timeout is reset per step)
      expect(receivedAbortSignals[0]).toBeDefined();
      expect(receivedAbortSignals[1]).toBeDefined();
      expect(receivedAbortSignals[0]).toBe(receivedAbortSignals[1]);
    });

    it('should forward stepMs abort signal to tool execution', async () => {
      let toolAbortSignal: AbortSignal | undefined;

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
                input: `{ "value": "test" }`,
              },
            ],
          }),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async (_args, { abortSignal }) => {
              toolAbortSignal = abortSignal;
              return 'tool result';
            },
          },
        },
        prompt: 'test-input',
        timeout: { stepMs: 5000 },
      });

      expect(toolAbortSignal).toBeDefined();
    });

    it('should support both totalMs and stepMs together', async () => {
      let receivedAbortSignal: AbortSignal | undefined;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async ({ abortSignal }) => {
            receivedAbortSignal = abortSignal;
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'Hello, world!' }],
            };
          },
        }),
        prompt: 'test-input',
        timeout: { totalMs: 10000, stepMs: 5000 },
      });

      expect(receivedAbortSignal).toBeDefined();
    });
  });

  describe('options.activeTools', () => {
    it('should filter available tools to only the ones in activeTools', async () => {
      let tools:
        | (LanguageModelV4FunctionTool | LanguageModelV4ProviderTool)[]
        | undefined;

      await generateText({
        model: new MockLanguageModelV4({
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

  describe('tool callbacks', () => {
    it('should invoke callbacks in the correct order', async () => {
      const recordedCalls: unknown[] = [];

      await generateText({
        model: new MockLanguageModelV4({
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
              "context": {},
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
        model: new MockLanguageModelV4({
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
          generateCallId: () => 'test-telemetry-call-id',
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
            "title": undefined,
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
      let result: GenerateTextResult<any, any, any>;

      beforeEach(async () => {
        result = await generateText({
          model: new MockLanguageModelV4({
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
                  providerMetadata: {
                    openai: { itemId: 'tool-result-1' },
                  },
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
                  providerMetadata: {
                    openai: { itemId: 'tool-result-2' },
                  },
                },
              ],
            }),
          }),
          tools: {
            web_search: {
              type: 'provider',
              id: 'test.web_search',
              inputSchema: z.object({ value: z.string() }),
              outputSchema: z.object({ value: z.string() }),
              args: {},
            },
          },
          prompt: 'test-input',
          stopWhen: isStepCount(4),
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
              "title": undefined,
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
              "providerMetadata": {
                "openai": {
                  "itemId": "tool-result-1",
                },
              },
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
              "title": undefined,
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
              "providerMetadata": {
                "openai": {
                  "itemId": "tool-result-2",
                },
              },
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
              "title": undefined,
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
              "title": undefined,
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
              "providerMetadata": {
                "openai": {
                  "itemId": "tool-result-1",
                },
              },
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
      class MockLanguageModelWithImageSupport extends MockLanguageModelV4 {
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
    describe('text output (default)', () => {
      it('should throw error when accessing output', async () => {
        const result = await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [{ type: 'text', text: `Hello, world!` }],
            }),
          }),
          prompt: 'prompt',
        });

        expect(result.output).toStrictEqual('Hello, world!');
      });
    });

    describe('text output', () => {
      it('should forward text as output', async () => {
        const result = await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [{ type: 'text', text: `Hello, world!` }],
            }),
          }),
          prompt: 'prompt',
          output: Output.text(),
        });

        expect(result.output).toStrictEqual('Hello, world!');
      });

      it('should set responseFormat to text and not change the prompt', async () => {
        let callOptions: LanguageModelV4CallOptions;

        await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async args => {
              callOptions = args;
              return {
                ...dummyResponseValues,
                content: [{ type: 'text', text: `Hello, world!` }],
              };
            },
          }),
          prompt: 'prompt',
          output: Output.text(),
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
            "reasoning": undefined,
            "responseFormat": {
              "type": "text",
            },
            "seed": undefined,
            "stopSequences": undefined,
            "temperature": undefined,
            "toolChoice": {
              "type": "auto",
            },
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
          model: new MockLanguageModelV4({
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [{ type: 'text', text: `{ "value": "test-value" }` }],
            }),
          }),
          prompt: 'prompt',
          output: Output.object({
            schema: z.object({ value: z.string() }),
          }),
        });

        expect(result.output).toEqual({ value: 'test-value' });
      });

      it('should set responseFormat to json and send schema as part of the responseFormat', async () => {
        let callOptions: LanguageModelV4CallOptions;

        await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async args => {
              callOptions = args;
              return {
                ...dummyResponseValues,
                content: [{ type: 'text', text: `{ "value": "test-value" }` }],
              };
            },
          }),
          prompt: 'prompt',
          output: Output.object({
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
            "reasoning": undefined,
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
            "toolChoice": {
              "type": "auto",
            },
            "tools": undefined,
            "topK": undefined,
            "topP": undefined,
          }
        `);
      });
    });

    describe('array output', () => {
      it('should generate an array with 3 elements', async () => {
        const model = new MockLanguageModelV4({
          doGenerate: {
            ...dummyResponseValues,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  elements: [
                    { content: 'element 1' },
                    { content: 'element 2' },
                    { content: 'element 3' },
                  ],
                }),
              },
            ],
          },
        });

        const result = await generateText({
          model,
          output: Output.array({
            element: z.object({ content: z.string() }),
          }),
          prompt: 'prompt',
        });

        expect(result.output).toMatchInlineSnapshot(`
        [
          {
            "content": "element 1",
          },
          {
            "content": "element 2",
          },
          {
            "content": "element 3",
          },
        ]
      `);

        expect(model.doGenerateCalls[0].prompt).toMatchInlineSnapshot(`
        [
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
        ]
      `);

        expect(model.doGenerateCalls[0].responseFormat).toMatchInlineSnapshot(`
        {
          "schema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "elements": {
                "items": {
                  "additionalProperties": false,
                  "properties": {
                    "content": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "content",
                  ],
                  "type": "object",
                },
                "type": "array",
              },
            },
            "required": [
              "elements",
            ],
            "type": "object",
          },
          "type": "json",
        }
      `);
      });
    });

    describe('choice output', () => {
      it('should generate a choice value', async () => {
        const model = new MockLanguageModelV4({
          doGenerate: {
            ...dummyResponseValues,
            content: [
              {
                type: 'text',
                text: JSON.stringify({ result: 'sunny' }),
              },
            ],
          },
        });

        const result = await generateText({
          model,
          output: Output.choice({
            options: ['sunny', 'rainy', 'snowy'],
          }),
          prompt: 'prompt',
        });

        expect(result.output).toEqual('sunny');
        expect(model.doGenerateCalls[0].prompt).toMatchInlineSnapshot(`
        [
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
        ]
      `);
        expect(model.doGenerateCalls[0].responseFormat).toMatchInlineSnapshot(`
        {
          "schema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "result": {
                "enum": [
                  "sunny",
                  "rainy",
                  "snowy",
                ],
                "type": "string",
              },
            },
            "required": [
              "result",
            ],
            "type": "object",
          },
          "type": "json",
        }
      `);
      });
    });

    it('should not parse output when finish reason is tool-calls', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            finishReason: { unified: 'tool-calls', raw: undefined },
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
        output: Output.object({
          schema: z.object({ summary: z.string() }),
        }),
        tools: {
          testTool: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'tool result',
          },
        },
      });

      // output should be undefined when finish reason is tool-calls
      expect(() => {
        result.output;
      }).toThrow('No output generated');

      // But tool calls should work normally
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolResults).toHaveLength(1);
    });
  });

  describe('tool execution errors', () => {
    let result: GenerateTextResult<any, any, any>;

    beforeEach(async () => {
      result = await generateText({
        model: new MockLanguageModelV4({
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
            "title": undefined,
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
                  "value": "Error: test error",
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
        model: new MockLanguageModelV4({
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
            finishReason: { unified: 'stop', raw: 'stop' },
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
            "title": undefined,
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

  describe('programmatic tool calling', () => {
    describe('5 steps: code_execution triggers client tool across multiple turns (dice game fixture)', () => {
      let result: GenerateTextResult<any, any, any>;
      let onFinishResult: Parameters<GenerateTextOnFinishCallback<any, any>>[0];
      let onStepFinishResults: StepResult<any, any>[];
      let doGenerateCalls: Array<LanguageModelV4CallOptions>;
      let prepareStepCalls: Array<{
        modelId: string;
        stepNumber: number;
        steps: Array<StepResult<any, any>>;
        messages: Array<ModelMessage>;
      }>;
      let rollDieExecutions: Array<{ player: string }>;

      // Fixture-based tool call IDs (from anthropic-programmatic-tool-calling.1.json)
      const CODE_EXEC_ID = 'srvtoolu_01CberhXc9TgYXrCZU8bQoks';
      const CONTAINER_ID = 'container_011CWHQB57xVregfCMPrKgew';

      beforeEach(async () => {
        onFinishResult = undefined as any;
        onStepFinishResults = [];
        doGenerateCalls = [];
        prepareStepCalls = [];
        rollDieExecutions = [];

        let responseCount = 0;

        result = await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async options => {
              doGenerateCalls.push(options);

              switch (responseCount++) {
                case 0:
                  // Step 1: text + server_tool_use (code_execution) + 2 rollDie calls
                  return {
                    ...dummyResponseValues,
                    content: [
                      {
                        type: 'text',
                        text: "I'll help you simulate this dice game between two players! Let me run the game where both players roll dice each round until one player wins 3 rounds.",
                      },
                      {
                        type: 'tool-call',
                        toolCallId: CODE_EXEC_ID,
                        toolName: 'code_execution',
                        input: `{"type":"programmatic-tool-call","code":"game_loop()"}`,
                        providerExecuted: true,
                      },
                      {
                        type: 'tool-call',
                        toolCallId: 'toolu_01PMcE1JBKCeLjn83cgUCvR5',
                        toolName: 'rollDie',
                        input: `{ "player": "player2" }`,
                      },
                      {
                        type: 'tool-call',
                        toolCallId: 'toolu_01MZf5QJ1EQyd2yGyeLzBxAS',
                        toolName: 'rollDie',
                        input: `{ "player": "player1" }`,
                      },
                    ],
                    finishReason: { unified: 'tool-calls', raw: undefined },
                    usage: {
                      inputTokens: {
                        total: 3369,
                        noCache: 3369,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                      },
                      outputTokens: {
                        total: 577,
                        text: 577,
                        reasoning: undefined,
                      },
                    },
                    response: {
                      id: 'msg_01V3gktwqnMAsXxpJ6sG9KDR',
                      timestamp: new Date(0),
                      modelId: 'claude-sonnet-4-5-20250929',
                    },
                    providerMetadata: {
                      anthropic: {
                        container: { id: CONTAINER_ID },
                      },
                    },
                  };

                case 1:
                  // Step 2: 2 rollDie calls (round 2)
                  return {
                    ...dummyResponseValues,
                    content: [
                      {
                        type: 'tool-call',
                        toolCallId: 'toolu_01UvVQ2xwA6preZppeajCkYK',
                        toolName: 'rollDie',
                        input: `{ "player": "player1" }`,
                      },
                      {
                        type: 'tool-call',
                        toolCallId: 'toolu_01BghspNownQFtRgv8jVicr3',
                        toolName: 'rollDie',
                        input: `{ "player": "player2" }`,
                      },
                    ],
                    finishReason: { unified: 'tool-calls', raw: undefined },
                    usage: {
                      inputTokens: {
                        total: 0,
                        noCache: 0,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                      },
                      outputTokens: {
                        total: 0,
                        text: 0,
                        reasoning: undefined,
                      },
                    },
                    response: {
                      id: 'msg_01DmEmveJkWRUR1y41DfGfEQ',
                      timestamp: new Date(1000),
                      modelId: 'claude-sonnet-4-5-20250929',
                    },
                    providerMetadata: {
                      anthropic: {
                        container: { id: CONTAINER_ID },
                      },
                    },
                  };

                case 2:
                  // Step 3: 2 rollDie calls (round 3)
                  return {
                    ...dummyResponseValues,
                    content: [
                      {
                        type: 'tool-call',
                        toolCallId: 'toolu_01T7Upuuv8C71nq7DZ9ZPNQW',
                        toolName: 'rollDie',
                        input: `{ "player": "player1" }`,
                      },
                      {
                        type: 'tool-call',
                        toolCallId: 'toolu_016Da1tDet9Bf7dAdYTkF5Ar',
                        toolName: 'rollDie',
                        input: `{ "player": "player2" }`,
                      },
                    ],
                    finishReason: { unified: 'tool-calls', raw: undefined },
                    usage: {
                      inputTokens: {
                        total: 0,
                        noCache: 0,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                      },
                      outputTokens: {
                        total: 0,
                        text: 0,
                        reasoning: undefined,
                      },
                    },
                    response: {
                      id: 'msg_01AxicwpZwTqKCtty95VTAoL',
                      timestamp: new Date(2000),
                      modelId: 'claude-sonnet-4-5-20250929',
                    },
                    providerMetadata: {
                      anthropic: {
                        container: { id: CONTAINER_ID },
                      },
                    },
                  };

                case 3:
                  // Step 4: 2 rollDie calls (round 4 - final round)
                  return {
                    ...dummyResponseValues,
                    content: [
                      {
                        type: 'tool-call',
                        toolCallId: 'toolu_01DiUBRds64sNajVPTZRrDSM',
                        toolName: 'rollDie',
                        input: `{ "player": "player1" }`,
                      },
                      {
                        type: 'tool-call',
                        toolCallId: 'toolu_01XQa3r3y1Fe8rnkGSncq626',
                        toolName: 'rollDie',
                        input: `{ "player": "player2" }`,
                      },
                    ],
                    finishReason: { unified: 'tool-calls', raw: undefined },
                    usage: {
                      inputTokens: {
                        total: 0,
                        noCache: 0,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                      },
                      outputTokens: {
                        total: 0,
                        text: 0,
                        reasoning: undefined,
                      },
                    },
                    response: {
                      id: 'msg_01TjXmSMrfqKVMpHHM3wMaBy',
                      timestamp: new Date(3000),
                      modelId: 'claude-sonnet-4-5-20250929',
                    },
                    providerMetadata: {
                      anthropic: {
                        container: { id: CONTAINER_ID },
                      },
                    },
                  };

                case 4:
                  // Step 5: code_execution_tool_result + final text
                  return {
                    ...dummyResponseValues,
                    content: [
                      {
                        type: 'tool-result',
                        toolCallId: CODE_EXEC_ID,
                        toolName: 'code_execution',
                        providerExecuted: true,
                        result: {
                          type: 'code_execution_result',
                          stdout:
                            '============================================================\nDICE GAME: First to 3 Round Wins\n============================================================\n\nRound 1:\n  Player 1 rolls: 6\n  Player 2 rolls: 6\n  → Draw! No points awarded.\n  Score: Player 1: 0 | Player 2: 0\n\nRound 2:\n  Player 1 rolls: 5\n  Player 2 rolls: 4\n  → Player 1 wins this round!\n  Score: Player 1: 1 | Player 2: 0\n\nRound 3:\n  Player 1 rolls: 6\n  Player 2 rolls: 4\n  → Player 1 wins this round!\n  Score: Player 1: 2 | Player 2: 0\n\nRound 4:\n  Player 1 rolls: 6\n  Player 2 rolls: 3\n  → Player 1 wins this round!\n  Score: Player 1: 3 | Player 2: 0\n\n============================================================\n🏆 PLAYER 1 WINS THE GAME!\nFinal Score: Player 1: 3 | Player 2: 0\nTotal Rounds: 4\n============================================================\n',
                          stderr: '',
                          return_code: 0,
                          content: [],
                        },
                      },
                      {
                        type: 'text',
                        text: "**Game Over!**\n\nPlayer 1 dominated this game with a decisive 3-0 victory! Looking at the rolls:\n- **Round 1**: Both rolled 6 (Draw)\n- **Round 2**: Player 1 (5) beat Player 2 (4)\n- **Round 3**: Player 1 (6) beat Player 2 (4)\n- **Round 4**: Player 1 (6) beat Player 2 (3)\n\nBased on these results, it appears **Player 1 is likely the one with the loaded die** - they rolled 6 three times out of four rolls (including the draw), and consistently rolled high numbers (5, 6, 6, 6). Player 2's rolls were more varied and lower (6, 4, 4, 3), which looks more like a fair die distribution.\n\nThe loaded die gave Player 1 a significant advantage, allowing them to win the game without Player 2 scoring a single round!",
                      },
                    ],
                    finishReason: { unified: 'stop', raw: 'stop' },
                    usage: {
                      inputTokens: {
                        total: 4243,
                        noCache: 4243,
                        cacheRead: undefined,
                        cacheWrite: undefined,
                      },
                      outputTokens: {
                        total: 229,
                        text: 229,
                        reasoning: undefined,
                      },
                    },
                    response: {
                      id: 'msg_01LPPbjvqcSgBPfApMEiJ4qv',
                      timestamp: new Date(4000),
                      modelId: 'claude-sonnet-4-5-20250929',
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
            code_execution: {
              type: 'provider',
              id: 'anthropic.code_execution_20250825',
              inputSchema: z.object({ code: z.string() }),
              outputSchema: z.object({
                stdout: z.string(),
                stderr: z.string(),
              }),
              args: {},
              supportsDeferredResults: true,
            },
            rollDie: tool({
              description: 'Roll a die and return the result.',
              inputSchema: z.object({
                player: z.enum(['player1', 'player2']),
              }),
              execute: async ({ player }) => {
                rollDieExecutions.push({ player });
                return player === 'player1' ? 6 : 3;
              },
              providerOptions: {
                anthropic: {
                  allowedCallers: ['code_execution_20250825'],
                },
              },
            }),
          },
          prompt: 'Play a dice game between two players.',
          stopWhen: isStepCount(10),
          onFinish: async event => {
            onFinishResult = event as unknown as typeof onFinishResult;
          },
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          prepareStep: async ({ model, stepNumber, steps, messages }) => {
            prepareStepCalls.push({
              modelId: typeof model === 'string' ? model : model.modelId,
              stepNumber,
              steps: [...steps],
              messages: [...messages],
            });

            // Forward container ID from previous step (simulating forwardAnthropicContainerIdFromLastStep)
            if (stepNumber > 0 && steps.length > 0) {
              const lastStep = steps[steps.length - 1];
              const containerId = (
                lastStep.providerMetadata?.anthropic as
                  | { container?: { id?: string } }
                  | undefined
              )?.container?.id;

              if (containerId) {
                return {
                  providerOptions: {
                    anthropic: {
                      container: { id: containerId },
                    },
                  },
                };
              }
            }
            return undefined;
          },
        });
      });

      describe('step inputs', () => {
        it('should send correct prompt in step 1', () => {
          expect(doGenerateCalls[0].prompt).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "text": "Play a dice game between two players.",
                    "type": "text",
                  },
                ],
                "providerOptions": undefined,
                "role": "user",
              },
            ]
          `);
        });

        it('should send correct tools in step 1', () => {
          expect(doGenerateCalls[0].tools).toMatchInlineSnapshot(`
            [
              {
                "args": {},
                "id": "anthropic.code_execution_20250825",
                "name": "code_execution",
                "type": "provider",
              },
              {
                "description": "Roll a die and return the result.",
                "inputSchema": {
                  "$schema": "http://json-schema.org/draft-07/schema#",
                  "additionalProperties": false,
                  "properties": {
                    "player": {
                      "enum": [
                        "player1",
                        "player2",
                      ],
                      "type": "string",
                    },
                  },
                  "required": [
                    "player",
                  ],
                  "type": "object",
                },
                "name": "rollDie",
                "providerOptions": {
                  "anthropic": {
                    "allowedCallers": [
                      "code_execution_20250825",
                    ],
                  },
                },
                "type": "function",
              },
            ]
          `);
        });

        it('should include assistant messages and tool results in step 2 prompt', () => {
          expect(doGenerateCalls[1].prompt).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "text": "Play a dice game between two players.",
                    "type": "text",
                  },
                ],
                "providerOptions": undefined,
                "role": "user",
              },
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "I'll help you simulate this dice game between two players! Let me run the game where both players roll dice each round until one player wins 3 rounds.",
                    "type": "text",
                  },
                  {
                    "input": {
                      "code": "game_loop()",
                    },
                    "providerExecuted": true,
                    "providerOptions": undefined,
                    "toolCallId": "srvtoolu_01CberhXc9TgYXrCZU8bQoks",
                    "toolName": "code_execution",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "player": "player2",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01PMcE1JBKCeLjn83cgUCvR5",
                    "toolName": "rollDie",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "player": "player1",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01MZf5QJ1EQyd2yGyeLzBxAS",
                    "toolName": "rollDie",
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
                      "type": "json",
                      "value": 3,
                    },
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01PMcE1JBKCeLjn83cgUCvR5",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                  {
                    "output": {
                      "type": "json",
                      "value": 6,
                    },
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01MZf5QJ1EQyd2yGyeLzBxAS",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                ],
                "providerOptions": undefined,
                "role": "tool",
              },
            ]
          `);
        });

        it('should include all previous messages in step 3 prompt (round 3)', () => {
          expect(doGenerateCalls[2].prompt).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "text": "Play a dice game between two players.",
                    "type": "text",
                  },
                ],
                "providerOptions": undefined,
                "role": "user",
              },
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "I'll help you simulate this dice game between two players! Let me run the game where both players roll dice each round until one player wins 3 rounds.",
                    "type": "text",
                  },
                  {
                    "input": {
                      "code": "game_loop()",
                    },
                    "providerExecuted": true,
                    "providerOptions": undefined,
                    "toolCallId": "srvtoolu_01CberhXc9TgYXrCZU8bQoks",
                    "toolName": "code_execution",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "player": "player2",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01PMcE1JBKCeLjn83cgUCvR5",
                    "toolName": "rollDie",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "player": "player1",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01MZf5QJ1EQyd2yGyeLzBxAS",
                    "toolName": "rollDie",
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
                      "type": "json",
                      "value": 3,
                    },
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01PMcE1JBKCeLjn83cgUCvR5",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                  {
                    "output": {
                      "type": "json",
                      "value": 6,
                    },
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01MZf5QJ1EQyd2yGyeLzBxAS",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                ],
                "providerOptions": undefined,
                "role": "tool",
              },
              {
                "content": [
                  {
                    "input": {
                      "player": "player1",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01UvVQ2xwA6preZppeajCkYK",
                    "toolName": "rollDie",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "player": "player2",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01BghspNownQFtRgv8jVicr3",
                    "toolName": "rollDie",
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
                      "type": "json",
                      "value": 6,
                    },
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01UvVQ2xwA6preZppeajCkYK",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                  {
                    "output": {
                      "type": "json",
                      "value": 3,
                    },
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01BghspNownQFtRgv8jVicr3",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                ],
                "providerOptions": undefined,
                "role": "tool",
              },
            ]
          `);
        });

        it('should forward container ID via providerOptions in step 2', () => {
          expect(doGenerateCalls[1].providerOptions).toMatchInlineSnapshot(`
            {
              "anthropic": {
                "container": {
                  "id": "container_011CWHQB57xVregfCMPrKgew",
                },
              },
            }
          `);
        });

        it('should include all previous messages in step 5 prompt (final step)', () => {
          expect(doGenerateCalls[4].prompt).toMatchSnapshot();
        });
      });

      describe('result.response.messages', () => {
        it('should contain all response messages from all steps', () => {
          expect(result.response.messages).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "I'll help you simulate this dice game between two players! Let me run the game where both players roll dice each round until one player wins 3 rounds.",
                    "type": "text",
                  },
                  {
                    "input": {
                      "code": "game_loop()",
                    },
                    "providerExecuted": true,
                    "providerOptions": undefined,
                    "toolCallId": "srvtoolu_01CberhXc9TgYXrCZU8bQoks",
                    "toolName": "code_execution",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "player": "player2",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01PMcE1JBKCeLjn83cgUCvR5",
                    "toolName": "rollDie",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "player": "player1",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01MZf5QJ1EQyd2yGyeLzBxAS",
                    "toolName": "rollDie",
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
                      "value": 3,
                    },
                    "toolCallId": "toolu_01PMcE1JBKCeLjn83cgUCvR5",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                  {
                    "output": {
                      "type": "json",
                      "value": 6,
                    },
                    "toolCallId": "toolu_01MZf5QJ1EQyd2yGyeLzBxAS",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
              {
                "content": [
                  {
                    "input": {
                      "player": "player1",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01UvVQ2xwA6preZppeajCkYK",
                    "toolName": "rollDie",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "player": "player2",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01BghspNownQFtRgv8jVicr3",
                    "toolName": "rollDie",
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
                      "value": 6,
                    },
                    "toolCallId": "toolu_01UvVQ2xwA6preZppeajCkYK",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                  {
                    "output": {
                      "type": "json",
                      "value": 3,
                    },
                    "toolCallId": "toolu_01BghspNownQFtRgv8jVicr3",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
              {
                "content": [
                  {
                    "input": {
                      "player": "player1",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01T7Upuuv8C71nq7DZ9ZPNQW",
                    "toolName": "rollDie",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "player": "player2",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_016Da1tDet9Bf7dAdYTkF5Ar",
                    "toolName": "rollDie",
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
                      "value": 6,
                    },
                    "toolCallId": "toolu_01T7Upuuv8C71nq7DZ9ZPNQW",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                  {
                    "output": {
                      "type": "json",
                      "value": 3,
                    },
                    "toolCallId": "toolu_016Da1tDet9Bf7dAdYTkF5Ar",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
              {
                "content": [
                  {
                    "input": {
                      "player": "player1",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01DiUBRds64sNajVPTZRrDSM",
                    "toolName": "rollDie",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "player": "player2",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "toolu_01XQa3r3y1Fe8rnkGSncq626",
                    "toolName": "rollDie",
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
                      "value": 6,
                    },
                    "toolCallId": "toolu_01DiUBRds64sNajVPTZRrDSM",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                  {
                    "output": {
                      "type": "json",
                      "value": 3,
                    },
                    "toolCallId": "toolu_01XQa3r3y1Fe8rnkGSncq626",
                    "toolName": "rollDie",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
              {
                "content": [
                  {
                    "output": {
                      "type": "json",
                      "value": {
                        "content": [],
                        "return_code": 0,
                        "stderr": "",
                        "stdout": "============================================================
            DICE GAME: First to 3 Round Wins
            ============================================================

            Round 1:
              Player 1 rolls: 6
              Player 2 rolls: 6
              → Draw! No points awarded.
              Score: Player 1: 0 | Player 2: 0

            Round 2:
              Player 1 rolls: 5
              Player 2 rolls: 4
              → Player 1 wins this round!
              Score: Player 1: 1 | Player 2: 0

            Round 3:
              Player 1 rolls: 6
              Player 2 rolls: 4
              → Player 1 wins this round!
              Score: Player 1: 2 | Player 2: 0

            Round 4:
              Player 1 rolls: 6
              Player 2 rolls: 3
              → Player 1 wins this round!
              Score: Player 1: 3 | Player 2: 0

            ============================================================
            🏆 PLAYER 1 WINS THE GAME!
            Final Score: Player 1: 3 | Player 2: 0
            Total Rounds: 4
            ============================================================
            ",
                        "type": "code_execution_result",
                      },
                    },
                    "providerOptions": undefined,
                    "toolCallId": "srvtoolu_01CberhXc9TgYXrCZU8bQoks",
                    "toolName": "code_execution",
                    "type": "tool-result",
                  },
                  {
                    "providerOptions": undefined,
                    "text": "**Game Over!**

            Player 1 dominated this game with a decisive 3-0 victory! Looking at the rolls:
            - **Round 1**: Both rolled 6 (Draw)
            - **Round 2**: Player 1 (5) beat Player 2 (4)
            - **Round 3**: Player 1 (6) beat Player 2 (4)
            - **Round 4**: Player 1 (6) beat Player 2 (3)

            Based on these results, it appears **Player 1 is likely the one with the loaded die** - they rolled 6 three times out of four rolls (including the draw), and consistently rolled high numbers (5, 6, 6, 6). Player 2's rolls were more varied and lower (6, 4, 4, 3), which looks more like a fair die distribution.

            The loaded die gave Player 1 a significant advantage, allowing them to win the game without Player 2 scoring a single round!",
                    "type": "text",
                  },
                ],
                "role": "assistant",
              },
            ]
          `);
        });
      });

      describe('result.toolCalls and result.toolResults', () => {
        it('should return empty toolCalls from final step (no tool calls in step 5)', () => {
          expect(result.toolCalls).toMatchInlineSnapshot(`[]`);
        });

        it('should return empty toolResults from final step (deferred result only)', () => {
          // The final step has a deferred tool result but no client-executed tool results
          expect(result.toolResults).toMatchInlineSnapshot(`
            [
              {
                "dynamic": undefined,
                "input": undefined,
                "output": {
                  "content": [],
                  "return_code": 0,
                  "stderr": "",
                  "stdout": "============================================================
            DICE GAME: First to 3 Round Wins
            ============================================================

            Round 1:
              Player 1 rolls: 6
              Player 2 rolls: 6
              → Draw! No points awarded.
              Score: Player 1: 0 | Player 2: 0

            Round 2:
              Player 1 rolls: 5
              Player 2 rolls: 4
              → Player 1 wins this round!
              Score: Player 1: 1 | Player 2: 0

            Round 3:
              Player 1 rolls: 6
              Player 2 rolls: 4
              → Player 1 wins this round!
              Score: Player 1: 2 | Player 2: 0

            Round 4:
              Player 1 rolls: 6
              Player 2 rolls: 3
              → Player 1 wins this round!
              Score: Player 1: 3 | Player 2: 0

            ============================================================
            🏆 PLAYER 1 WINS THE GAME!
            Final Score: Player 1: 3 | Player 2: 0
            Total Rounds: 4
            ============================================================
            ",
                  "type": "code_execution_result",
                },
                "providerExecuted": true,
                "toolCallId": "srvtoolu_01CberhXc9TgYXrCZU8bQoks",
                "toolName": "code_execution",
                "type": "tool-result",
              },
            ]
          `);
        });
      });

      describe('tool execution', () => {
        it('should execute rollDie tool 4 times (twice per step for steps 1 and 2)', () => {
          expect(rollDieExecutions).toMatchInlineSnapshot(`
            [
              {
                "player": "player2",
              },
              {
                "player": "player1",
              },
              {
                "player": "player1",
              },
              {
                "player": "player2",
              },
              {
                "player": "player1",
              },
              {
                "player": "player2",
              },
              {
                "player": "player1",
              },
              {
                "player": "player2",
              },
            ]
          `);
        });
      });

      describe('result.steps', () => {
        it('should contain 5 steps', () => {
          expect(result.steps.length).toBe(5);
        });

        it('should have correct finishReason for each step', () => {
          expect(result.steps[0].finishReason).toBe('tool-calls');
          expect(result.steps[1].finishReason).toBe('tool-calls');
          expect(result.steps[2].finishReason).toBe('tool-calls');
          expect(result.steps[3].finishReason).toBe('tool-calls');
          expect(result.steps[4].finishReason).toBe('stop');
        });
      });

      describe('result.text', () => {
        it('should return final text from last step', () => {
          expect(result.text).toContain('**Game Over!**');
        });
      });

      describe('result.finishReason', () => {
        it('should return stop from final step', () => {
          expect(result.finishReason).toBe('stop');
        });
      });

      describe('result.totalUsage', () => {
        it('should sum token usage across all steps', () => {
          expect(result.totalUsage).toMatchInlineSnapshot(`
            {
              "cachedInputTokens": undefined,
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 7612,
              },
              "inputTokens": 7612,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 806,
              },
              "outputTokens": 806,
              "reasoningTokens": undefined,
              "totalTokens": 8418,
            }
          `);
        });
      });

      describe('prepareStep calls', () => {
        it('should call prepareStep for each step with correct stepNumber', () => {
          expect(prepareStepCalls.length).toBe(5);
          expect(prepareStepCalls[0].stepNumber).toBe(0);
          expect(prepareStepCalls[1].stepNumber).toBe(1);
          expect(prepareStepCalls[2].stepNumber).toBe(2);
          expect(prepareStepCalls[3].stepNumber).toBe(3);
          expect(prepareStepCalls[4].stepNumber).toBe(4);
        });

        it('should pass empty steps array for first prepareStep call', () => {
          expect(prepareStepCalls[0].steps.length).toBe(0);
        });

        it('should pass accumulated steps to subsequent prepareStep calls', () => {
          expect(prepareStepCalls[1].steps.length).toBe(1);
          expect(prepareStepCalls[2].steps.length).toBe(2);
          expect(prepareStepCalls[3].steps.length).toBe(3);
          expect(prepareStepCalls[4].steps.length).toBe(4);
        });

        it('should pass accumulated messages to prepareStep', () => {
          // Step 0: just the initial user message
          expect(prepareStepCalls[0].messages.length).toBe(1);

          // Step 1: user message + assistant message + tool message
          expect(prepareStepCalls[1].messages.length).toBe(3);

          // Step 2: user message + assistant + tool + assistant + tool
          expect(prepareStepCalls[2].messages.length).toBe(5);

          // Step 3: continued accumulation
          expect(prepareStepCalls[3].messages.length).toBe(7);

          // Step 4: continued accumulation
          expect(prepareStepCalls[4].messages.length).toBe(9);
        });
      });

      describe('onStepFinish callback', () => {
        it('should be called for each step', () => {
          expect(onStepFinishResults.length).toBe(5);
        });

        it('should contain correct finishReason for each step', () => {
          expect(onStepFinishResults[0].finishReason).toBe('tool-calls');
          expect(onStepFinishResults[1].finishReason).toBe('tool-calls');
          expect(onStepFinishResults[2].finishReason).toBe('tool-calls');
          expect(onStepFinishResults[3].finishReason).toBe('tool-calls');
          expect(onStepFinishResults[4].finishReason).toBe('stop');
        });

        it('should contain provider metadata with container ID for steps 1 and 2', () => {
          expect(onStepFinishResults[0].providerMetadata)
            .toMatchInlineSnapshot(`
              {
                "anthropic": {
                  "container": {
                    "id": "container_011CWHQB57xVregfCMPrKgew",
                  },
                },
              }
            `);
          expect(onStepFinishResults[1].providerMetadata)
            .toMatchInlineSnapshot(`
              {
                "anthropic": {
                  "container": {
                    "id": "container_011CWHQB57xVregfCMPrKgew",
                  },
                },
              }
            `);
        });
      });

      describe('onFinish callback', () => {
        it('should be called with correct text', () => {
          expect(onFinishResult.text).toContain('**Game Over!**');
        });

        it('should be called with correct finishReason', () => {
          expect(onFinishResult.finishReason).toBe('stop');
        });

        it('should contain all steps', () => {
          expect(onFinishResult.steps.length).toBe(5);
        });

        it('should contain correct totalUsage', () => {
          expect(onFinishResult.totalUsage).toMatchInlineSnapshot(`
            {
              "cachedInputTokens": undefined,
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 7612,
              },
              "inputTokens": 7612,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 806,
              },
              "outputTokens": 806,
              "reasoningTokens": undefined,
              "totalTokens": 8418,
            }
          `);
        });

        it('should contain all response messages', () => {
          expect(onFinishResult.response.messages.length).toBe(9);
        });
      });
    });
  });

  describe('dynamic tools', () => {
    it('should execute dynamic tools', async () => {
      let toolExecuted = false;

      const result = await generateText({
        model: new MockLanguageModelV4({
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
            finishReason: { unified: 'tool-calls', raw: undefined },
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
            "title": undefined,
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

  describe('context', () => {
    it('should send context to tool execution', async () => {
      let recordedContext: unknown | undefined;

      await generateText({
        model: new MockLanguageModelV4({
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
            finishReason: { unified: 'tool-calls', raw: undefined },
          }),
        }),
        tools: {
          t1: tool({
            inputSchema: z.object({ value: z.string() }),
            contextSchema: z.object({ context: z.string() }),
            execute: async (input, { context }) => {
              recordedContext = context;
              return { value: 'test-result' };
            },
          }),
        },
        toolsContext: { t1: { context: 'test' } },
        prompt: 'test-input',
      });

      // tool should be executed by client
      expect(recordedContext).toMatchInlineSnapshot(`
        {
          "context": "test",
        }
      `);
    });

    it('should pass context to prepareStep', async () => {
      let capturedContext: unknown;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
          }),
        }),
        context: { myData: 'test-value' },
        prepareStep: async ({ context }) => {
          capturedContext = context;
          return undefined;
        },
        prompt: 'test',
      });

      expect(capturedContext).toEqual({ myData: 'test-value' });
    });

    it('should send context in onFinish callback', async () => {
      let recordedContext: unknown | undefined;

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
            finishReason: { unified: 'stop', raw: 'stop' },
          }),
        }),
        context: {
          context: 'test',
        },
        prompt: 'test-input',
        onFinish: ({ context }) => {
          recordedContext = context;
        },
      });

      expect(recordedContext).toStrictEqual({
        context: 'test',
      });
    });
  });

  describe('invalid tool calls', () => {
    describe('single invalid tool call', () => {
      let result: GenerateTextResult<any, any, any>;

      beforeEach(async () => {
        result = await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async () => ({
              warnings: [],
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 20,
                  text: 20,
                  reasoning: undefined,
                },
              },
              finishReason: { unified: 'tool-calls', raw: undefined },
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
              "error": [AI_InvalidToolInputError: Invalid input for tool cityAttractions: AI_TypeValidationError: Type validation failed: Value: {"cities":"San Francisco"}.
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
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "cityAttractions",
              "type": "tool-call",
            },
            {
              "dynamic": true,
              "error": "AI_InvalidToolInputError: Invalid input for tool cityAttractions: AI_TypeValidationError: Type validation failed: Value: {"cities":"San Francisco"}.
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
                    "value": "AI_InvalidToolInputError: Invalid input for tool cityAttractions: AI_TypeValidationError: Type validation failed: Value: {"cities":"San Francisco"}.
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
      let result: GenerateTextResult<any, any, any>;

      beforeEach(async () => {
        result = await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async () => ({
              warnings: [],
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 20,
                  text: 20,
                  reasoning: undefined,
                },
              },
              finishReason: { unified: 'tool-calls', raw: undefined },
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
            generateCallId: () => 'test-telemetry-call-id',
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
              "title": undefined,
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
              "callId": "test-telemetry-call-id",
              "content": [
                {
                  "input": {
                    "city": "San Francisco",
                  },
                  "providerExecuted": undefined,
                  "providerMetadata": undefined,
                  "title": undefined,
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
              "context": {},
              "finishReason": "tool-calls",
              "functionId": undefined,
              "model": {
                "modelId": "mock-model-id",
                "provider": "mock-provider",
              },
              "providerMetadata": undefined,
              "rawFinishReason": undefined,
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
              "stepNumber": 0,
              "toolsContext": {},
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokenDetails": {
                  "cacheReadTokens": undefined,
                  "cacheWriteTokens": undefined,
                  "noCacheTokens": 10,
                },
                "inputTokens": 10,
                "outputTokenDetails": {
                  "reasoningTokens": undefined,
                  "textTokens": 20,
                },
                "outputTokens": 20,
                "raw": undefined,
                "reasoningTokens": undefined,
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
          type: 'unsupported' as const,
          feature: 'temperature',
          details: 'Temperature parameter not supported',
        },
      ];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
            warnings: expectedWarnings,
          },
        }),
        prompt: 'Hello',
      });

      expect(logWarningsSpy).toHaveBeenCalledOnce();
      expect(logWarningsSpy).toHaveBeenCalledWith({
        warnings: expectedWarnings,
        provider: 'mock-provider',
        model: 'mock-model-id',
      });
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
        model: new MockLanguageModelV4({
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
                  finishReason: { unified: 'tool-calls', raw: undefined },
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
        stopWhen: isStepCount(3),
      });

      expect(logWarningsSpy).toHaveBeenCalledTimes(2);
      expect(logWarningsSpy).toHaveBeenNthCalledWith(1, {
        warnings: [warning1],
        provider: 'mock-provider',
        model: 'mock-model-id',
      });
      expect(logWarningsSpy).toHaveBeenNthCalledWith(2, {
        warnings: [warning2],
        provider: 'mock-provider',
        model: 'mock-model-id',
      });
    });

    it('should call logWarnings with empty array when no warnings are present', async () => {
      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello, world!' }],
            warnings: [], // no warnings
          },
        }),
        prompt: 'Hello',
      });

      expect(logWarningsSpy).toHaveBeenCalledOnce();
      expect(logWarningsSpy).toHaveBeenCalledWith({
        warnings: [],
        provider: 'mock-provider',
        model: 'mock-model-id',
      });
    });
  });

  describe('tool execution approval', () => {
    describe('when a single tool needs approval (user-defined)', () => {
      let result: GenerateTextResult<any, any, any>;

      beforeEach(async () => {
        result = await generateText({
          model: new MockLanguageModelV4({
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
              finishReason: { unified: 'tool-calls', raw: undefined },
            }),
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            }),
          },
          toolNeedsApproval: {
            tool1: true,
          },
          stopWhen: isStepCount(3),
          prompt: 'test-input',
          _internal: {
            generateId: mockId({ prefix: 'id' }),
            generateCallId: () => 'test-telemetry-call-id',
          },
        });
      });

      it('should only execute 1 step when the tool needs approval', async () => {
        expect(result.steps.length).toBe(1);
      });

      it('should have tool-calls finish reason', async () => {
        expect(result.finishReason).toBe('tool-calls');
      });

      it('should add a tool approval request to the content', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
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
              "approvalId": "id-1",
              "toolCall": {
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
              "type": "tool-approval-request",
            },
          ]
        `);
      });

      it('should include tool approval request in response messages', async () => {
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
                {
                  "approvalId": "id-1",
                  "toolCallId": "call-1",
                  "type": "tool-approval-request",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });

    describe('when a single tool needs approval (tool-defined)', () => {
      let result: GenerateTextResult<any, any, any>;

      beforeEach(async () => {
        result = await generateText({
          model: new MockLanguageModelV4({
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
              finishReason: { unified: 'tool-calls', raw: undefined },
            }),
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
              needsApproval: true,
            }),
          },
          stopWhen: isStepCount(3),
          prompt: 'test-input',
          _internal: {
            generateId: mockId({ prefix: 'id' }),
            generateCallId: () => 'test-telemetry-call-id',
          },
        });
      });

      it('should only execute 1 step when the tool needs approval', async () => {
        expect(result.steps.length).toBe(1);
      });

      it('should have tool-calls finish reason', async () => {
        expect(result.finishReason).toBe('tool-calls');
      });

      it('should add a tool approval request to the content', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
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
              "approvalId": "id-1",
              "toolCall": {
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
              "type": "tool-approval-request",
            },
          ]
        `);
      });

      it('should include tool approval request in response messages', async () => {
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
                {
                  "approvalId": "id-1",
                  "toolCallId": "call-1",
                  "type": "tool-approval-request",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });

    describe('when a single tool has a needsApproval function', () => {
      let result: GenerateTextResult<any, any, any>;
      let needsApprovalCalls: Array<{ input: any; options: any }> = [];

      beforeEach(async () => {
        needsApprovalCalls = [];
        result = await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async () => ({
              ...dummyResponseValues,
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: `{ "value": "value-needs-approval" }`,
                },
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-2',
                  toolName: 'tool1',
                  input: `{ "value": "value-no-approval" }`,
                },
              ],
              finishReason: { unified: 'tool-calls', raw: undefined },
            }),
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: input => `result for ${input.value}`,
            }),
          },
          toolNeedsApproval: {
            tool1: (input, options) => {
              needsApprovalCalls.push({ input, options });
              return input.value === 'value-needs-approval';
            },
          },
          stopWhen: isStepCount(3),
          prompt: 'test-input',
          _internal: {
            generateId: mockId({ prefix: 'id' }),
            generateCallId: () => 'test-telemetry-call-id',
          },
        });
      });

      it('should only execute 1 step when the tool needs approval', async () => {
        expect(result.steps.length).toBe(1);
      });

      it('should have tool-calls finish reason', async () => {
        expect(result.finishReason).toBe('tool-calls');
      });

      it('should add a tool approval request to the content', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "input": {
                "value": "value-needs-approval",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            {
              "input": {
                "value": "value-no-approval",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-2",
              "toolName": "tool1",
              "type": "tool-call",
            },
            {
              "dynamic": false,
              "input": {
                "value": "value-no-approval",
              },
              "output": "result for value-no-approval",
              "toolCallId": "call-2",
              "toolName": "tool1",
              "type": "tool-result",
            },
            {
              "approvalId": "id-1",
              "toolCall": {
                "input": {
                  "value": "value-needs-approval",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "title": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
              "type": "tool-approval-request",
            },
          ]
        `);
      });

      it('should include tool approval request in response messages', async () => {
        expect(result.response.messages).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "input": {
                    "value": "value-needs-approval",
                  },
                  "providerExecuted": undefined,
                  "providerOptions": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-call",
                },
                {
                  "input": {
                    "value": "value-no-approval",
                  },
                  "providerExecuted": undefined,
                  "providerOptions": undefined,
                  "toolCallId": "call-2",
                  "toolName": "tool1",
                  "type": "tool-call",
                },
                {
                  "approvalId": "id-1",
                  "toolCallId": "call-1",
                  "type": "tool-approval-request",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "output": {
                    "type": "text",
                    "value": "result for value-no-approval",
                  },
                  "toolCallId": "call-2",
                  "toolName": "tool1",
                  "type": "tool-result",
                },
              ],
              "role": "tool",
            },
          ]
        `);
      });

      it('should call the needsApproval function with the correct input and options', async () => {
        expect(needsApprovalCalls).toMatchInlineSnapshot(`
          [
            {
              "input": {
                "value": "value-needs-approval",
              },
              "options": {
                "context": undefined,
                "messages": [
                  {
                    "content": "test-input",
                    "role": "user",
                  },
                ],
                "toolCallId": "call-1",
              },
            },
            {
              "input": {
                "value": "value-no-approval",
              },
              "options": {
                "context": undefined,
                "messages": [
                  {
                    "content": "test-input",
                    "role": "user",
                  },
                ],
                "toolCallId": "call-2",
              },
            },
          ]
        `);
      });
    });

    describe('when a call from a single tool that needs approval is approved', () => {
      let result: GenerateTextResult<any, any, any>;
      let prompts: LanguageModelV4Prompt[];
      let executeFunction: ToolExecuteFunction<any, any, any>;

      beforeEach(async () => {
        prompts = [];
        executeFunction = vi.fn().mockReturnValue('result1');
        result = await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async ({ prompt }) => {
              prompts.push(prompt);
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'text',
                    text: 'Hello, world!',
                  },
                ],
                finishReason: { unified: 'stop', raw: 'stop' },
              };
            },
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: executeFunction,
            }),
          },
          toolNeedsApproval: {
            tool1: true,
          },
          stopWhen: isStepCount(3),
          _internal: {
            generateId: mockId({ prefix: 'id' }),
            generateCallId: () => 'test-telemetry-call-id',
          },
          messages: [
            { role: 'user', content: 'test-input' },
            {
              role: 'assistant',
              content: [
                {
                  input: {
                    value: 'value',
                  },
                  providerExecuted: undefined,
                  providerOptions: undefined,
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  type: 'tool-call',
                },
                {
                  approvalId: 'id-1',
                  toolCallId: 'call-1',
                  type: 'tool-approval-request',
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  approvalId: 'id-1',
                  type: 'tool-approval-response',
                  approved: true,
                },
              ],
            },
          ],
        });
      });

      it('should execute the tool', async () => {
        expect(executeFunction).toHaveBeenCalledWith(
          { value: 'value' },
          expect.objectContaining({
            abortSignal: undefined,
            toolCallId: 'call-1',
            messages: expect.any(Array),
          }),
        );
      });

      it('should call the model with a prompt that includes the tool result', async () => {
        expect(prompts).toMatchInlineSnapshot(`
          [
            [
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
          ]
        `);
      });

      it('should include the tool result in the response messages', async () => {
        expect(result.response.messages).toMatchInlineSnapshot(`
          [
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
          ]
        `);
      });
    });

    describe('when a call from a single tool that needs approval is approved and the tool throws', () => {
      let result: GenerateTextResult<any, any, any>;
      let prompts: LanguageModelV4Prompt[];

      beforeEach(async () => {
        prompts = [];
        result = await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async ({ prompt }) => {
              prompts.push(prompt);
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'text',
                    text: 'Hello, world!',
                  },
                ],
                finishReason: { unified: 'stop', raw: 'stop' },
              };
            },
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async (): Promise<string> => {
                throw new Error('No valid token for plugin');
              },
            }),
          },
          toolNeedsApproval: {
            tool1: true,
          },
          stopWhen: isStepCount(3),
          _internal: {
            generateId: mockId({ prefix: 'id' }),
          },
          messages: [
            { role: 'user', content: 'test-input' },
            {
              role: 'assistant',
              content: [
                {
                  input: {
                    value: 'value',
                  },
                  providerExecuted: undefined,
                  providerOptions: undefined,
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  type: 'tool-call',
                },
                {
                  approvalId: 'id-1',
                  toolCallId: 'call-1',
                  type: 'tool-approval-request',
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  approvalId: 'id-1',
                  type: 'tool-approval-response',
                  approved: true,
                },
              ],
            },
          ],
        });
      });

      it('should serialize the tool error as error-text in the continuation prompt', async () => {
        expect(prompts).toEqual([
          [
            {
              role: 'user',
              content: [{ type: 'text', text: 'test-input' }],
              providerOptions: undefined,
            },
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: { value: 'value' },
                  providerExecuted: undefined,
                  providerOptions: undefined,
                },
              ],
              providerOptions: undefined,
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  output: {
                    type: 'error-text',
                    value: 'Error: No valid token for plugin',
                  },
                  providerOptions: undefined,
                },
              ],
              providerOptions: undefined,
            },
          ],
        ]);
      });
    });

    describe('when a call from a single tool that needs approval is denied', () => {
      let result: GenerateTextResult<any, any, any>;
      let prompts: LanguageModelV4Prompt[];
      let executeFunction: ToolExecuteFunction<any, any, any>;

      beforeEach(async () => {
        prompts = [];
        executeFunction = vi.fn().mockReturnValue('result1');
        result = await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async ({ prompt }) => {
              prompts.push(prompt);
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'text',
                    text: 'Hello, world!',
                  },
                ],
                finishReason: { unified: 'tool-calls', raw: undefined },
              };
            },
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: executeFunction,
            }),
          },
          toolNeedsApproval: {
            tool1: true,
          },
          stopWhen: isStepCount(3),
          _internal: {
            generateId: mockId({ prefix: 'id' }),
            generateCallId: () => 'test-telemetry-call-id',
          },
          messages: [
            { role: 'user', content: 'test-input' },
            {
              role: 'assistant',
              content: [
                {
                  input: {
                    value: 'value',
                  },
                  providerExecuted: undefined,
                  providerOptions: undefined,
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  type: 'tool-call',
                },
                {
                  approvalId: 'id-1',
                  toolCallId: 'call-1',
                  type: 'tool-approval-request',
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  approvalId: 'id-1',
                  type: 'tool-approval-response',
                  approved: false,
                },
              ],
            },
          ],
        });
      });

      it('should not execute the tool', async () => {
        expect(executeFunction).not.toHaveBeenCalled();
      });

      it('should call the model with a prompt that includes the tool error', async () => {
        expect(prompts).toMatchInlineSnapshot(`
          [
            [
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
                      "reason": undefined,
                      "type": "execution-denied",
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
          ]
        `);
      });

      it('should include the tool error in the response messages', async () => {
        expect(result.response.messages).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "output": {
                    "reason": undefined,
                    "type": "execution-denied",
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
          ]
        `);
      });
    });

    describe('when two calls from a single tool that needs approval are approved', () => {
      let result: GenerateTextResult<any, any, any>;
      let prompts: LanguageModelV4Prompt[];
      let executeFunction: ToolExecuteFunction<any, any, any>;

      beforeEach(async () => {
        prompts = [];
        executeFunction = vi.fn().mockReturnValue('result1');
        result = await generateText({
          model: new MockLanguageModelV4({
            doGenerate: async ({ prompt }) => {
              prompts.push(prompt);
              return {
                ...dummyResponseValues,
                content: [
                  {
                    type: 'text',
                    text: 'Hello, world!',
                  },
                ],
                finishReason: { unified: 'tool-calls', raw: undefined },
              };
            },
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: executeFunction,
            }),
          },
          toolNeedsApproval: {
            tool1: true,
          },
          stopWhen: isStepCount(3),
          _internal: {
            generateId: mockId({ prefix: 'id' }),
            generateCallId: () => 'test-telemetry-call-id',
          },
          messages: [
            { role: 'user', content: 'test-input' },
            {
              role: 'assistant',
              content: [
                {
                  input: {
                    value: 'value1',
                  },
                  providerExecuted: undefined,
                  providerOptions: undefined,
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  type: 'tool-call',
                },
                {
                  approvalId: 'id-1',
                  toolCallId: 'call-1',
                  type: 'tool-approval-request',
                },
                {
                  input: {
                    value: 'value2',
                  },
                  providerExecuted: undefined,
                  providerOptions: undefined,
                  toolCallId: 'call-2',
                  toolName: 'tool1',
                  type: 'tool-call',
                },
                {
                  approvalId: 'id-2',
                  toolCallId: 'call-2',
                  type: 'tool-approval-request',
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  approvalId: 'id-1',
                  type: 'tool-approval-response',
                  approved: true,
                },
                {
                  approvalId: 'id-2',
                  type: 'tool-approval-response',
                  approved: true,
                },
              ],
            },
          ],
        });
      });

      it('should call the model with a prompt that includes the tool results', async () => {
        expect(prompts).toMatchInlineSnapshot(`
          [
            [
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
                      "value": "value1",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "value": "value2",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-2",
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
                  {
                    "output": {
                      "type": "text",
                      "value": "result1",
                    },
                    "providerOptions": undefined,
                    "toolCallId": "call-2",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "providerOptions": undefined,
                "role": "tool",
              },
            ],
          ]
        `);
      });

      it('should include the tool results in the response messages', async () => {
        expect(result.response.messages).toMatchInlineSnapshot(`
          [
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
                {
                  "output": {
                    "type": "text",
                    "value": "result1",
                  },
                  "toolCallId": "call-2",
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
          ]
        `);
      });
    });

    describe('provider-executed tool (MCP) approval', () => {
      describe('when a provider-executed tool emits tool-approval-request', () => {
        let result: GenerateTextResult<any, any, any>;

        beforeEach(async () => {
          result = await generateText({
            model: new MockLanguageModelV4({
              doGenerate: async () => ({
                ...dummyResponseValues,
                content: [
                  {
                    type: 'tool-call',
                    toolCallId: 'mcp-call-1',
                    toolName: 'mcp_tool',
                    input: `{ "query": "test" }`,
                    providerExecuted: true,
                  },
                  {
                    type: 'tool-approval-request',
                    approvalId: 'mcp-approval-1',
                    toolCallId: 'mcp-call-1',
                  },
                ],
                finishReason: { unified: 'tool-calls', raw: undefined },
              }),
            }),
            tools: {
              mcp_tool: {
                type: 'provider',
                id: 'test.mcp_tool',
                inputSchema: z.object({ query: z.string() }),
                args: {},
              },
            },
            stopWhen: isStepCount(3),
            prompt: 'test-input',
            _internal: {
              generateId: mockId({ prefix: 'id' }),
              generateCallId: () => 'test-telemetry-call-id',
            },
          });
        });

        it('should only execute 1 step when waiting for approval', async () => {
          expect(result.steps.length).toBe(1);
        });

        it('should have tool-calls finish reason', async () => {
          expect(result.finishReason).toBe('tool-calls');
        });

        it('should add tool approval request with providerExecuted tool call to content', async () => {
          expect(result.content).toMatchInlineSnapshot(`
            [
              {
                "input": {
                  "query": "test",
                },
                "providerExecuted": true,
                "providerMetadata": undefined,
                "title": undefined,
                "toolCallId": "mcp-call-1",
                "toolName": "mcp_tool",
                "type": "tool-call",
              },
              {
                "approvalId": "mcp-approval-1",
                "toolCall": {
                  "input": {
                    "query": "test",
                  },
                  "providerExecuted": true,
                  "providerMetadata": undefined,
                  "title": undefined,
                  "toolCallId": "mcp-call-1",
                  "toolName": "mcp_tool",
                  "type": "tool-call",
                },
                "type": "tool-approval-request",
              },
            ]
          `);
        });

        it('should include tool approval request in response messages', async () => {
          expect(result.response.messages).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "input": {
                      "query": "test",
                    },
                    "providerExecuted": true,
                    "providerOptions": undefined,
                    "toolCallId": "mcp-call-1",
                    "toolName": "mcp_tool",
                    "type": "tool-call",
                  },
                  {
                    "approvalId": "mcp-approval-1",
                    "toolCallId": "mcp-call-1",
                    "type": "tool-approval-request",
                  },
                ],
                "role": "assistant",
              },
            ]
          `);
        });
      });

      describe('when a provider-executed tool approval is approved', () => {
        let result: GenerateTextResult<any, any, any>;
        let prompts: LanguageModelV4Prompt[];

        beforeEach(async () => {
          prompts = [];
          let callCount = 0;
          result = await generateText({
            model: new MockLanguageModelV4({
              doGenerate: async ({ prompt }) => {
                prompts.push(prompt);
                callCount++;

                if (callCount === 1) {
                  // Model returns tool call with result after approval
                  return {
                    ...dummyResponseValues,
                    content: [
                      {
                        type: 'tool-call',
                        toolCallId: 'mcp-call-1',
                        toolName: 'mcp_tool',
                        input: `{ "query": "test" }`,
                        providerExecuted: true,
                      },
                      {
                        type: 'tool-result',
                        toolCallId: 'mcp-call-1',
                        toolName: 'mcp_tool',
                        result: { shortened_url: 'https://short.url/abc' },
                        providerExecuted: true,
                      },
                      {
                        type: 'text',
                        text: 'Here is your shortened URL: https://short.url/abc',
                      },
                    ],
                    finishReason: { unified: 'stop', raw: 'stop' },
                  };
                }

                return {
                  ...dummyResponseValues,
                  content: [{ type: 'text', text: 'Done' }],
                  finishReason: { unified: 'stop', raw: 'stop' },
                };
              },
            }),
            tools: {
              mcp_tool: {
                type: 'provider',
                id: 'test.mcp_tool',
                inputSchema: z.object({ query: z.string() }),
                args: {},
              },
            },
            stopWhen: isStepCount(3),
            _internal: {
              generateId: mockId({ prefix: 'id' }),
              generateCallId: () => 'test-telemetry-call-id',
            },
            messages: [
              {
                role: 'user',
                content: 'Shorten this URL: https://example.com',
              },
              {
                role: 'assistant',
                content: [
                  {
                    input: { query: 'test' },
                    providerExecuted: true,
                    providerOptions: undefined,
                    toolCallId: 'mcp-call-1',
                    toolName: 'mcp_tool',
                    type: 'tool-call',
                  },
                  {
                    approvalId: 'mcp-approval-1',
                    toolCallId: 'mcp-call-1',
                    type: 'tool-approval-request',
                  },
                ],
              },
              {
                role: 'tool',
                content: [
                  {
                    approvalId: 'mcp-approval-1',
                    type: 'tool-approval-response',
                    approved: true,
                    providerExecuted: true,
                  },
                ],
              },
            ],
          });
        });

        it('should send tool-approval-response to the model exactly once', async () => {
          expect(prompts[0]).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "text": "Shorten this URL: https://example.com",
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
                      "query": "test",
                    },
                    "providerExecuted": true,
                    "providerOptions": undefined,
                    "toolCallId": "mcp-call-1",
                    "toolName": "mcp_tool",
                    "type": "tool-call",
                  },
                ],
                "providerOptions": undefined,
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "approvalId": "mcp-approval-1",
                    "approved": true,
                    "reason": undefined,
                    "type": "tool-approval-response",
                  },
                ],
                "providerOptions": undefined,
                "role": "tool",
              },
            ]
          `);
        });

        it('should include provider-executed tool result in content', async () => {
          expect(result.content).toMatchInlineSnapshot(`
            [
              {
                "input": {
                  "query": "test",
                },
                "providerExecuted": true,
                "providerMetadata": undefined,
                "title": undefined,
                "toolCallId": "mcp-call-1",
                "toolName": "mcp_tool",
                "type": "tool-call",
              },
              {
                "dynamic": undefined,
                "input": {
                  "query": "test",
                },
                "output": {
                  "shortened_url": "https://short.url/abc",
                },
                "providerExecuted": true,
                "toolCallId": "mcp-call-1",
                "toolName": "mcp_tool",
                "type": "tool-result",
              },
              {
                "text": "Here is your shortened URL: https://short.url/abc",
                "type": "text",
              },
            ]
          `);
        });
      });

      describe('when a provider-executed tool approval is denied', () => {
        let result: GenerateTextResult<any, any, any>;
        let prompts: LanguageModelV4Prompt[];

        beforeEach(async () => {
          prompts = [];
          result = await generateText({
            model: new MockLanguageModelV4({
              doGenerate: async ({ prompt }) => {
                prompts.push(prompt);
                return {
                  ...dummyResponseValues,
                  content: [
                    {
                      type: 'text',
                      text: 'I understand. The tool execution was not approved.',
                    },
                  ],
                  finishReason: { unified: 'stop', raw: 'stop' },
                };
              },
            }),
            tools: {
              mcp_tool: {
                type: 'provider',
                id: 'test.mcp_tool',
                inputSchema: z.object({ query: z.string() }),
                args: {},
              },
            },
            stopWhen: isStepCount(3),
            _internal: {
              generateId: mockId({ prefix: 'id' }),
              generateCallId: () => 'test-telemetry-call-id',
            },
            messages: [
              {
                role: 'user',
                content: 'Shorten this URL: https://example.com',
              },
              {
                role: 'assistant',
                content: [
                  {
                    input: { query: 'test' },
                    providerExecuted: true,
                    providerOptions: undefined,
                    toolCallId: 'mcp-call-1',
                    toolName: 'mcp_tool',
                    type: 'tool-call',
                  },
                  {
                    approvalId: 'mcp-approval-1',
                    toolCallId: 'mcp-call-1',
                    type: 'tool-approval-request',
                  },
                ],
              },
              {
                role: 'tool',
                content: [
                  {
                    approvalId: 'mcp-approval-1',
                    type: 'tool-approval-response',
                    approved: false,
                    reason: 'User denied the request',
                    providerExecuted: true,
                  },
                ],
              },
            ],
          });
        });

        it('should send denied tool-approval-response to the model exactly once', async () => {
          expect(prompts[0]).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "text": "Shorten this URL: https://example.com",
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
                      "query": "test",
                    },
                    "providerExecuted": true,
                    "providerOptions": undefined,
                    "toolCallId": "mcp-call-1",
                    "toolName": "mcp_tool",
                    "type": "tool-call",
                  },
                ],
                "providerOptions": undefined,
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "approvalId": "mcp-approval-1",
                    "approved": false,
                    "reason": "User denied the request",
                    "type": "tool-approval-response",
                  },
                  {
                    "output": {
                      "providerOptions": {
                        "openai": {
                          "approvalId": "mcp-approval-1",
                        },
                      },
                      "reason": "User denied the request",
                      "type": "execution-denied",
                    },
                    "providerOptions": undefined,
                    "toolCallId": "mcp-call-1",
                    "toolName": "mcp_tool",
                    "type": "tool-result",
                  },
                ],
                "providerOptions": undefined,
                "role": "tool",
              },
            ]
          `);
        });

        it('should include text response from model in content', async () => {
          expect(result.content).toMatchInlineSnapshot(`
            [
              {
                "text": "I understand. The tool execution was not approved.",
                "type": "text",
              },
            ]
          `);
        });

        it('should have stop finish reason', async () => {
          expect(result.finishReason).toBe('stop');
        });
      });
    });
  });

  describe('prepareStep with model switch and image URLs', () => {
    it('should use the prepareStep model supportedUrls for download decision', async () => {
      const downloadCalls: Array<{ url: URL; isUrlSupportedByModel: boolean }> =
        [];
      const languageModelCalls: Array<LanguageModelV4CallOptions> = [];

      const modelWithImageUrlSupport = new MockLanguageModelV4({
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

      const modelWithoutImageUrlSupport = new MockLanguageModelV4({
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
            "reasoning": undefined,
            "responseFormat": undefined,
            "seed": undefined,
            "stopSequences": undefined,
            "temperature": undefined,
            "toolChoice": {
              "type": "auto",
            },
            "tools": undefined,
            "topK": undefined,
            "topP": undefined,
          },
        ]
      `);

      expect(result.text).toBe('response from without-image-url-support');
    });
  });

  describe('telemetry integrations', () => {
    afterEach(() => {
      globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
    });

    it('should call per-call integration listeners for all lifecycle events', async () => {
      const events: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'testTool',
                input: '{ "value": "test" }',
              },
            ],
            ...dummyResponseValues,
          }),
        }),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        prompt: 'test-input',
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

      expect(events).toEqual([
        'onStart',
        'onStepStart',
        'onToolCallStart',
        'onToolCallFinish',
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

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
      });

      expect(events).toEqual([
        'global-onStart',
        'global-onStepFinish',
        'global-onFinish',
      ]);
    });

    it('should only call per-call integrations when both global and per-call integrations are provided', async () => {
      const events: string[] = [];

      globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [
        {
          onStart: async () => {
            events.push('global');
          },
        },
      ];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        experimental_telemetry: {
          integrations: {
            onStart: async () => {
              events.push('per-call');
            },
          },
        },
      });

      expect(events).toEqual(['per-call']);
    });

    it('should call integration listeners alongside user callbacks', async () => {
      const events: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        experimental_onStart: async () => {
          events.push('user-onStart');
        },
        onStepFinish: async () => {
          events.push('user-onStepFinish');
        },
        onFinish: async () => {
          events.push('user-onFinish');
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

      expect(events).toEqual([
        'user-onStart',
        'integration-onStart',
        'user-onStepFinish',
        'integration-onStepFinish',
        'user-onFinish',
        'integration-onFinish',
      ]);
    });

    it('should not break generation when an integration listener throws', async () => {
      const result = await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
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

      expect(result.text).toBe('Hello!');
    });

    it('should support multiple per-call integrations as an array', async () => {
      const events: string[] = [];

      await generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [{ type: 'text', text: 'Hello!' }],
            ...dummyResponseValues,
          }),
        }),
        prompt: 'test-input',
        experimental_telemetry: {
          integrations: [
            {
              onStart: async () => {
                events.push('first');
              },
            },
            {
              onStart: async () => {
                events.push('second');
              },
            },
          ],
        },
      });

      expect(events).toEqual(['first', 'second']);
    });
  });
});
