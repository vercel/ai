import { jsonSchema } from '@ai-sdk/ui-utils';
import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { MockTracer } from '../test/mock-tracer';
import { generateText } from './generate-text';
import { GenerateTextResult } from './generate-text-result';
import { StepResult } from './step-result';

const dummyResponseValues = {
  rawCall: { rawPrompt: 'prompt', rawSettings: {} },
  finishReason: 'stop' as const,
  usage: { promptTokens: 10, completionTokens: 20 },
};

describe('result.text', () => {
  it('should generate text', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            tools: undefined,
            toolChoice: undefined,
          });

          expect(prompt).toStrictEqual([
            {
              role: 'user',
              content: [{ type: 'text', text: 'prompt' }],
              providerMetadata: undefined,
            },
          ]);

          return {
            ...dummyResponseValues,
            text: `Hello, world!`,
          };
        },
      }),
      prompt: 'prompt',
    });

    assert.deepStrictEqual(result.text, 'Hello, world!');
  });
});

describe('result.toolCalls', () => {
  it('should contain tool calls', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            toolChoice: { type: 'required' },
            tools: [
              {
                type: 'function',
                name: 'tool1',
                description: undefined,
                parameters: {
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
                parameters: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { somethingElse: { type: 'string' } },
                  required: ['somethingElse'],
                  type: 'object',
                },
              },
            ],
          });

          expect(prompt).toStrictEqual([
            {
              role: 'user',
              content: [{ type: 'text', text: 'test-input' }],
              providerMetadata: undefined,
            },
          ]);

          return {
            ...dummyResponseValues,
            toolCalls: [
              {
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
            ],
          };
        },
      }),
      tools: {
        tool1: {
          parameters: z.object({ value: z.string() }),
        },
        // 2nd tool to show typing:
        tool2: {
          parameters: z.object({ somethingElse: z.string() }),
        },
      },
      toolChoice: 'required',
      prompt: 'test-input',
    });

    // test type inference
    if (result.toolCalls[0].toolName === 'tool1') {
      assertType<string>(result.toolCalls[0].args.value);
    }

    assert.deepStrictEqual(result.toolCalls, [
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'tool1',
        args: { value: 'value' },
      },
    ]);
  });
});

describe('result.toolResults', () => {
  it('should contain tool results', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            toolChoice: { type: 'auto' },
            tools: [
              {
                type: 'function',
                name: 'tool1',
                description: undefined,
                parameters: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
              },
            ],
          });

          expect(prompt).toStrictEqual([
            {
              role: 'user',
              content: [{ type: 'text', text: 'test-input' }],
              providerMetadata: undefined,
            },
          ]);

          return {
            ...dummyResponseValues,
            toolCalls: [
              {
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
            ],
          };
        },
      }),
      tools: {
        tool1: {
          parameters: z.object({ value: z.string() }),
          execute: async args => {
            assert.deepStrictEqual(args, { value: 'value' });
            return 'result1';
          },
        },
      },
      prompt: 'test-input',
    });

    // test type inference
    if (result.toolResults[0].toolName === 'tool1') {
      assertType<string>(result.toolResults[0].result);
    }

    assert.deepStrictEqual(result.toolResults, [
      {
        toolCallId: 'call-1',
        toolName: 'tool1',
        args: { value: 'value' },
        result: 'result1',
      },
    ]);
  });
});

describe('result.providerMetadata', () => {
  it('should contain provider metadata', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          ...dummyResponseValues,
          providerMetadata: {
            anthropic: {
              cacheCreationInputTokens: 10,
              cacheReadInputTokens: 20,
            },
          },
        }),
      }),
      prompt: 'test-input',
    });

    assert.deepStrictEqual(result.experimental_providerMetadata, {
      anthropic: {
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 20,
      },
    });
  });
});

describe('result.response.messages', () => {
  it('should contain assistant response message when there are no tool calls', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          ...dummyResponseValues,
          text: 'Hello, world!',
        }),
      }),
      prompt: 'test-input',
    });

    expect(result.response.messages).toMatchSnapshot();
  });

  it('should contain assistant response message and tool message when there are tool calls with results', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          ...dummyResponseValues,
          text: 'Hello, world!',
          toolCalls: [
            {
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
          ],
          toolResults: [
            {
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: { value: 'value' },
              result: 'result1',
            },
          ],
        }),
      }),
      tools: {
        tool1: {
          parameters: z.object({ value: z.string() }),
          execute: async args => {
            assert.deepStrictEqual(args, { value: 'value' });
            return 'result1';
          },
        },
      },
      prompt: 'test-input',
    });

    expect(result.response.messages).toMatchSnapshot();
  });
});

describe('result.request', () => {
  it('should contain request information', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({}) => ({
          ...dummyResponseValues,
          text: `Hello, world!`,
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
  it('should contain response information', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({}) => ({
          ...dummyResponseValues,
          text: `Hello, world!`,
          response: {
            id: 'test-id-from-model',
            timestamp: new Date(10000),
            modelId: 'test-response-model-id',
          },
          rawResponse: {
            headers: {
              'custom-response-header': 'response-header-value',
            },
          },
        }),
      }),
      prompt: 'prompt',
    });

    expect(result.response).toMatchSnapshot();
  });
});

describe('options.maxSteps', () => {
  describe('2 steps: initial, tool-result', () => {
    let result: GenerateTextResult<any>;
    let onStepFinishResults: StepResult<any>[];

    beforeEach(async () => {
      onStepFinishResults = [];

      let responseCount = 0;
      result = await generateText({
        model: new MockLanguageModelV1({
          doGenerate: async ({ prompt, mode }) => {
            switch (responseCount++) {
              case 0:
                expect(mode).toStrictEqual({
                  type: 'regular',
                  toolChoice: { type: 'auto' },
                  tools: [
                    {
                      type: 'function',
                      name: 'tool1',
                      description: undefined,
                      parameters: {
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        additionalProperties: false,
                        properties: { value: { type: 'string' } },
                        required: ['value'],
                        type: 'object',
                      },
                    },
                  ],
                });

                expect(prompt).toStrictEqual([
                  {
                    role: 'user',
                    content: [{ type: 'text', text: 'test-input' }],
                    providerMetadata: undefined,
                  },
                ]);

                return {
                  ...dummyResponseValues,
                  toolCalls: [
                    {
                      toolCallType: 'function',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      args: `{ "value": "value" }`,
                    },
                  ],
                  toolResults: [
                    {
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      args: { value: 'value' },
                      result: 'result1',
                    },
                  ],
                  finishReason: 'tool-calls',
                  usage: { completionTokens: 5, promptTokens: 10 },
                  response: {
                    id: 'test-id-1-from-model',
                    timestamp: new Date(0),
                    modelId: 'test-response-model-id',
                  },
                };
              case 1:
                expect(mode).toStrictEqual({
                  type: 'regular',
                  toolChoice: { type: 'auto' },
                  tools: [
                    {
                      type: 'function',
                      name: 'tool1',
                      description: undefined,
                      parameters: {
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        additionalProperties: false,
                        properties: { value: { type: 'string' } },
                        required: ['value'],
                        type: 'object',
                      },
                    },
                  ],
                });

                expect(prompt).toStrictEqual([
                  {
                    role: 'user',
                    content: [{ type: 'text', text: 'test-input' }],
                    providerMetadata: undefined,
                  },
                  {
                    role: 'assistant',
                    content: [
                      {
                        type: 'tool-call',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        args: { value: 'value' },
                        providerMetadata: undefined,
                      },
                    ],
                    providerMetadata: undefined,
                  },
                  {
                    role: 'tool',
                    content: [
                      {
                        type: 'tool-result',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        result: 'result1',
                        content: undefined,
                        isError: undefined,
                        providerMetadata: undefined,
                      },
                    ],
                    providerMetadata: undefined,
                  },
                ]);
                return {
                  ...dummyResponseValues,
                  text: 'Hello, world!',
                  response: {
                    id: 'test-id-2-from-model',
                    timestamp: new Date(10000),
                    modelId: 'test-response-model-id',
                  },
                  rawResponse: {
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
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async (args: any) => {
              assert.deepStrictEqual(args, { value: 'value' });
              return 'result1';
            },
          },
        },
        prompt: 'test-input',
        maxSteps: 3,
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

    it('result.usage should sum token usage', () => {
      assert.deepStrictEqual(result.usage, {
        completionTokens: 25,
        promptTokens: 20,
        totalTokens: 45,
      });
    });

    it('result.steps should contain all steps', () => {
      expect(result.steps).toMatchSnapshot();
    });

    it('onStepFinish should be called for each step', () => {
      expect(onStepFinishResults).toMatchSnapshot();
    });
  });

  describe('4 steps: initial, continue, continue, continue', () => {
    let result: GenerateTextResult<any>;
    let onStepFinishResults: StepResult<any>[];

    beforeEach(async () => {
      onStepFinishResults = [];

      let responseCount = 0;
      result = await generateText({
        model: new MockLanguageModelV1({
          doGenerate: async ({ prompt, mode }) => {
            switch (responseCount++) {
              case 0: {
                expect(mode).toStrictEqual({
                  type: 'regular',
                  toolChoice: undefined,
                  tools: undefined,
                });

                expect(prompt).toStrictEqual([
                  {
                    role: 'user',
                    content: [{ type: 'text', text: 'test-input' }],
                    providerMetadata: undefined,
                  },
                ]);

                return {
                  ...dummyResponseValues,
                  // trailing text is to be discarded, trailing whitespace is to be kept:
                  text: 'part 1 \n to-be-discarded',
                  finishReason: 'length', // trigger continue
                  usage: { completionTokens: 20, promptTokens: 10 },
                  response: {
                    id: 'test-id-1-from-model',
                    timestamp: new Date(0),
                    modelId: 'test-response-model-id',
                  },
                };
              }
              case 1: {
                expect(mode).toStrictEqual({
                  type: 'regular',
                  toolChoice: undefined,
                  tools: undefined,
                });

                expect(prompt).toStrictEqual([
                  {
                    role: 'user',
                    content: [{ type: 'text', text: 'test-input' }],
                    providerMetadata: undefined,
                  },
                  {
                    role: 'assistant',
                    content: [
                      {
                        type: 'text',
                        text: 'part 1 \n ',
                        providerMetadata: undefined,
                      },
                    ],
                    providerMetadata: undefined,
                  },
                ]);

                return {
                  ...dummyResponseValues,
                  // case where there is no leading nor trailing whitespace:
                  text: 'no-whitespace',
                  finishReason: 'length',
                  response: {
                    id: 'test-id-2-from-model',
                    timestamp: new Date(10000),
                    modelId: 'test-response-model-id',
                  },
                  usage: { completionTokens: 5, promptTokens: 30 },
                  // test handling of custom response headers:
                  rawResponse: {
                    headers: {
                      'custom-response-header': 'response-header-value',
                    },
                  },
                };
              }
              case 2: {
                expect(mode).toStrictEqual({
                  type: 'regular',
                  toolChoice: undefined,
                  tools: undefined,
                });
                expect(prompt).toStrictEqual([
                  {
                    role: 'user',
                    content: [{ type: 'text', text: 'test-input' }],
                    providerMetadata: undefined,
                  },
                  {
                    role: 'assistant',
                    content: [
                      {
                        type: 'text',
                        text: 'part 1 \n ',
                        providerMetadata: undefined,
                      },
                      {
                        type: 'text',
                        text: 'no-whitespace',
                        providerMetadata: undefined,
                      },
                    ],
                    providerMetadata: undefined,
                  },
                ]);

                return {
                  ...dummyResponseValues,
                  // set up trailing whitespace for next step:
                  text: 'immediatefollow  ',
                  finishReason: 'length',
                  response: {
                    id: 'test-id-3-from-model',
                    timestamp: new Date(20000),
                    modelId: 'test-response-model-id',
                  },
                  usage: { completionTokens: 2, promptTokens: 3 },
                };
              }
              case 3: {
                expect(mode).toStrictEqual({
                  type: 'regular',
                  toolChoice: undefined,
                  tools: undefined,
                });
                expect(prompt).toStrictEqual([
                  {
                    role: 'user',
                    content: [{ type: 'text', text: 'test-input' }],
                    providerMetadata: undefined,
                  },
                  {
                    role: 'assistant',
                    content: [
                      {
                        type: 'text',
                        text: 'part 1 \n ',
                        providerMetadata: undefined,
                      },
                      {
                        type: 'text',
                        text: 'no-whitespace',
                        providerMetadata: undefined,
                      },
                      {
                        type: 'text',
                        text: 'immediatefollow  ',
                        providerMetadata: undefined,
                      },
                    ],
                    providerMetadata: undefined,
                  },
                ]);

                return {
                  ...dummyResponseValues,
                  // leading whitespace is to be discarded when there is whitespace from previous step
                  // (for models such as Anthropic that trim trailing whitespace in their inputs):
                  text: '  final value keep all whitespace\n end',
                  finishReason: 'stop',
                  response: {
                    id: 'test-id-4-from-model',
                    timestamp: new Date(20000),
                    modelId: 'test-response-model-id',
                  },
                  usage: { completionTokens: 2, promptTokens: 3 },
                };
              }
              default:
                throw new Error(`Unexpected response count: ${responseCount}`);
            }
          },
        }),
        prompt: 'test-input',
        maxSteps: 5,
        experimental_continueSteps: true,
        onStepFinish: async event => {
          onStepFinishResults.push(event);
        },
      });
    });

    it('result.text should return text from both steps separated by space', async () => {
      expect(result.text).toStrictEqual(
        'part 1 \n no-whitespaceimmediatefollow  final value keep all whitespace\n end',
      );
    });

    it('result.response.messages should contain an assistant message with the combined text', () => {
      expect(result.response.messages).toStrictEqual([
        {
          content: [
            {
              text: 'part 1 \n ',
              type: 'text',
            },
            {
              text: 'no-whitespace',
              type: 'text',
            },
            {
              text: 'immediatefollow  ',
              type: 'text',
            },
            {
              text: 'final value keep all whitespace\n end',
              type: 'text',
            },
          ],
          role: 'assistant',
        },
      ]);
    });

    it('result.usage should sum token usage', () => {
      expect(result.usage).toStrictEqual({
        completionTokens: 29,
        promptTokens: 46,
        totalTokens: 75,
      });
    });

    it('result.steps should contain all steps', () => {
      expect(result.steps).toMatchSnapshot();
    });

    it('onStepFinish should be called for each step', () => {
      expect(onStepFinishResults).toMatchSnapshot();
    });
  });
});

describe('options.headers', () => {
  it('should pass headers to model', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ headers }) => {
          assert.deepStrictEqual(headers, {
            'custom-request-header': 'request-header-value',
          });

          return {
            ...dummyResponseValues,
            text: 'Hello, world!',
          };
        },
      }),
      prompt: 'test-input',
      headers: { 'custom-request-header': 'request-header-value' },
    });

    assert.deepStrictEqual(result.text, 'Hello, world!');
  });
});

describe('options.providerMetadata', () => {
  it('should pass provider metadata to model', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ providerMetadata }) => {
          expect(providerMetadata).toStrictEqual({
            aProvider: { someKey: 'someValue' },
          });

          return { ...dummyResponseValues, text: 'provider metadata test' };
        },
      }),
      prompt: 'test-input',
      experimental_providerMetadata: {
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
      model: new MockLanguageModelV1({
        doGenerate: async () => ({
          ...dummyResponseValues,
          toolCalls: [
            {
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
          ],
        }),
      }),
      tools: {
        tool1: {
          parameters: z.object({ value: z.string() }),
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
      { abortSignal: abortController.signal },
    );
  });
});

describe('telemetry', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
  });

  it('should not record any telemetry data when not explicitly enabled', async () => {
    await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({}) => ({
          ...dummyResponseValues,
          text: `Hello, world!`,
        }),
      }),
      prompt: 'prompt',
      experimental_telemetry: { tracer },
    });

    expect(tracer.jsonSpans).toMatchSnapshot();
  });

  it('should record telemetry data when enabled', async () => {
    await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({}) => ({
          ...dummyResponseValues,
          text: `Hello, world!`,
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
      model: new MockLanguageModelV1({
        doGenerate: async ({}) => ({
          ...dummyResponseValues,
          toolCalls: [
            {
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
          ],
        }),
      }),
      tools: {
        tool1: {
          parameters: z.object({ value: z.string() }),
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
      model: new MockLanguageModelV1({
        doGenerate: async ({}) => ({
          ...dummyResponseValues,
          toolCalls: [
            {
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
          ],
        }),
      }),
      tools: {
        tool1: {
          parameters: z.object({ value: z.string() }),
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

describe('tools with custom schema', () => {
  it('should contain tool calls', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            toolChoice: { type: 'required' },
            tools: [
              {
                type: 'function',
                name: 'tool1',
                description: undefined,
                parameters: {
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
                parameters: {
                  additionalProperties: false,
                  properties: { somethingElse: { type: 'string' } },
                  required: ['somethingElse'],
                  type: 'object',
                },
              },
            ],
          });

          expect(prompt).toStrictEqual([
            {
              role: 'user',
              content: [{ type: 'text', text: 'test-input' }],
              providerMetadata: undefined,
            },
          ]);

          return {
            ...dummyResponseValues,
            toolCalls: [
              {
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
            ],
          };
        },
      }),
      tools: {
        tool1: {
          parameters: jsonSchema<{ value: string }>({
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
          }),
        },
        // 2nd tool to show typing:
        tool2: {
          parameters: jsonSchema<{ somethingElse: string }>({
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
      assertType<string>(result.toolCalls[0].args.value);
    }

    assert.deepStrictEqual(result.toolCalls, [
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'tool1',
        args: { value: 'value' },
      },
    ]);
  });
});

describe('options.messages', () => {
  it('should detect and convert ui messages', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt }) => {
          expect(prompt).toStrictEqual([
            {
              content: [
                {
                  text: 'prompt',
                  type: 'text',
                },
              ],
              providerMetadata: undefined,
              role: 'user',
            },
            {
              content: [
                {
                  args: {
                    value: 'test-value',
                  },
                  providerMetadata: undefined,
                  toolCallId: 'call-1',
                  toolName: 'test-tool',
                  type: 'tool-call',
                },
              ],
              providerMetadata: undefined,
              role: 'assistant',
            },
            {
              content: [
                {
                  content: undefined,
                  isError: undefined,
                  providerMetadata: undefined,
                  result: 'test result',
                  toolCallId: 'call-1',
                  toolName: 'test-tool',
                  type: 'tool-result',
                },
              ],
              providerMetadata: undefined,
              role: 'tool',
            },
          ]);

          return {
            ...dummyResponseValues,
            text: `Hello, world!`,
          };
        },
      }),
      messages: [
        {
          role: 'user',
          content: 'prompt',
        },
        {
          role: 'assistant',
          content: '',
          toolInvocations: [
            {
              state: 'result',
              toolCallId: 'call-1',
              toolName: 'test-tool',
              args: { value: 'test-value' },
              result: 'test result',
            },
          ],
        },
      ],
    });

    expect(result.text).toStrictEqual('Hello, world!');
  });
});
