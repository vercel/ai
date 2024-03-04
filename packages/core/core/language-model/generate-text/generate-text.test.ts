import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModel } from '../test/mock-language-model';
import { generateText } from './generate-text';

describe('result.text', () => {
  it('should generate text', async () => {
    const result = await generateText({
      model: new MockLanguageModel({
        objectMode: 'json',
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, { type: 'regular', tools: undefined });
          assert.deepStrictEqual(prompt, {
            messages: [{ role: 'user', content: 'prompt' }],
          });

          return {
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
      model: new MockLanguageModel({
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            tools: [
              {
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
          assert.deepStrictEqual(prompt, {
            messages: [{ role: 'user', content: 'test-input' }],
          });

          return {
            toolCalls: [
              {
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
      prompt: 'test-input',
    });

    // test type inference
    if (result.toolCalls[0].toolName === 'tool1') {
      assertType<string>(result.toolCalls[0].args.value);
    }

    assert.deepStrictEqual(result.toolCalls, [
      {
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
      model: new MockLanguageModel({
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            tools: [
              {
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
          assert.deepStrictEqual(prompt, {
            messages: [{ role: 'user', content: 'test-input' }],
          });

          return {
            toolCalls: [
              {
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
