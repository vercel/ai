import {
  LanguageModelV2CallOptions,
  LanguageModelV2FunctionTool,
  LanguageModelV2ProviderDefinedClientTool,
  LanguageModelV2ProviderDefinedServerTool,
} from '@ai-sdk/provider';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { mockId } from '@ai-sdk/provider-utils/test';
import assert from 'node:assert';
import { z } from 'zod';
import { stepCountIs, Output } from '.';
import { ToolExecutionError } from '../../src/error/tool-execution-error';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { MockTracer } from '../test/mock-tracer';
import { tool } from '../tool/tool';
import { generateText } from './generate-text';
import { GenerateTextResult } from './generate-text-result';
import { StepResult } from './step-result';

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
              toolCallType: 'function',
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
          "toolCallId": "call-1",
          "toolName": "tool1",
          "type": "tool-call",
        },
        {
          "text": "More text",
          "type": "text",
        },
        {
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
    if (result.toolCalls[0].toolName === 'tool1') {
      assertType<string>(result.toolCalls[0].input.value);
    }

    expect(result.toolCalls).toStrictEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'tool1',
        input: { value: 'value' },
      },
    ]);
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
    if (result.toolResults[0].toolName === 'tool1') {
      assertType<string>(result.toolResults[0].output);
    }

    expect(result.toolResults).toStrictEqual([
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'tool1',
        input: { value: 'value' },
        output: 'result1',
      },
    ]);
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
                  },
                ]);

                expect(toolChoice).toStrictEqual({ type: 'auto' });

                expect(prompt).toStrictEqual([
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
                        output: 'result1',
                        content: undefined,
                        isError: undefined,
                        providerOptions: undefined,
                      },
                    ],
                    providerOptions: undefined,
                  },
                ]);
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

    beforeEach(async () => {
      onStepFinishResults = [];

      let responseCount = 0;

      const trueModel = new MockLanguageModelV2({
        doGenerate: async ({ prompt, tools, toolChoice }) => {
          switch (responseCount++) {
            case 0:
              expect(toolChoice).toStrictEqual({
                type: 'tool',
                toolName: 'tool1',
              });
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
                },
              ]);

              expect(prompt).toStrictEqual([
                {
                  role: 'system',
                  content: 'system-message-0',
                },
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
              expect(tools).toStrictEqual([]);
              expect(toolChoice).toStrictEqual({ type: 'auto' });

              expect(prompt).toStrictEqual([
                {
                  role: 'system',
                  content: 'system-message-1',
                },
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
                      output: 'result1',
                      content: undefined,
                      isError: undefined,
                      providerOptions: undefined,
                    },
                  ],
                  providerOptions: undefined,
                },
              ]);
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
        prepareStep: async ({ model, stepNumber, steps }) => {
          expect(model).toStrictEqual(modelWithFiles);

          if (stepNumber === 0) {
            expect(steps).toStrictEqual([]);
            return {
              model: trueModel,
              toolChoice: {
                type: 'tool',
                toolName: 'tool1' as const,
              },
              system: 'system-message-0',
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
                throw new Error(`Unexpected response count: ${responseCount}`);
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
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
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
                          "output": "result1",
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
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
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
                          "output": "result1",
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
          assert.deepStrictEqual(headers, {
            'custom-request-header': 'request-header-value',
          });

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
      | (
          | LanguageModelV2FunctionTool
          | LanguageModelV2ProviderDefinedClientTool
          | LanguageModelV2ProviderDefinedServerTool
        )[]
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

    expect(tracer.jsonSpans).toMatchSnapshot();
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
    if (result.toolCalls[0].toolName === 'tool1') {
      assertType<string>(result.toolCalls[0].input.value);
    }

    assert.deepStrictEqual(result.toolCalls, [
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'tool1',
        input: { value: 'value' },
      },
    ]);
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
              ? ({ 'image/*': [/^https:\/\/.*$/] } as Record<string, RegExp[]>)
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
          "headers": undefined,
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
          "headers": undefined,
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
});

describe('tool execution errors', () => {
  it('should throw a ToolExecutionError when a tool execution throws an error', async () => {
    await expect(async () => {
      await generateText({
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
    }).rejects.toThrow(
      new ToolExecutionError({
        toolName: 'tool1',
        toolCallId: 'call-1',
        toolInput: { value: 'value' },
        cause: new Error('test error'),
      }),
    );
  });
});
