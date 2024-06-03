import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { generateText } from './generate-text';

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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'prompt' }] },
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
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

describe('result.responseMessages', () => {
  it('should contain assistant response message when there are no tool calls', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          return {
            ...dummyResponseValues,
            text: 'Hello, world!',
          };
        },
      }),
      prompt: 'test-input',
    });

    assert.deepStrictEqual(result.responseMessages, [
      { role: 'assistant', content: [{ type: 'text', text: 'Hello, world!' }] },
    ]);
  });

  it('should contain assistant response message and tool message when there are tool calls with results', async () => {
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          return {
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

    assert.deepStrictEqual(result.responseMessages, [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello, world!' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'tool1',
            args: { value: 'value' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'tool1',
            result: 'result1',
          },
        ],
      },
    ]);
  });

  it('should contain assistant response message and tool message from all roundtrips', async () => {
    let responseCount = 0;
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          switch (responseCount++) {
            case 0:
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
              };
            case 1:
              return {
                ...dummyResponseValues,
                text: 'Hello, world!',
              };
            default:
              throw new Error(`Unexpected response count: ${responseCount}`);
          }
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
      maxAutomaticRoundtrips: 2,
    });

    assert.deepStrictEqual(result.responseMessages, [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'tool1',
            args: { value: 'value' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'tool1',
            result: 'result1',
          },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello, world!' }],
      },
    ]);
  });
});

describe('maxAutomaticRoundtrips', () => {
  it('should return text, tool calls and tool results from last roundtrip', async () => {
    let responseCount = 0;
    const result = await generateText({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          switch (responseCount++) {
            case 0:
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
              assert.deepStrictEqual(prompt, [
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'test-input' }],
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
              };
            case 1:
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
              assert.deepStrictEqual(prompt, [
                {
                  role: 'user',
                  content: [{ type: 'text', text: 'test-input' }],
                },
                {
                  role: 'assistant',
                  content: [
                    { type: 'text', text: '' },
                    {
                      type: 'tool-call',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      args: { value: 'value' },
                    },
                  ],
                },
                {
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolCallId: 'call-1',
                      toolName: 'tool1',
                      result: 'result1',
                    },
                  ],
                },
              ]);
              return {
                ...dummyResponseValues,
                text: 'Hello, world!',
              };
            default:
              throw new Error(`Unexpected response count: ${responseCount}`);
          }
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
      maxAutomaticRoundtrips: 2,
    });

    assert.deepStrictEqual(result.text, 'Hello, world!');
    assert.deepStrictEqual(result.toolCalls, []);
    assert.deepStrictEqual(result.toolResults, []);
  });
});
