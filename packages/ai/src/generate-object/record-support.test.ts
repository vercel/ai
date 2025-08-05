import { TypeValidationError } from '@ai-sdk/provider';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { generateObject } from './generate-object';

const dummyResponseValues = {
  finishReason: 'stop' as const,
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  },
  response: { id: 'id-1', timestamp: new Date(123), modelId: 'm-1' },
  warnings: [],
};

describe('z.record support - TDD Tests', () => {
  describe('z.record behavior tests', () => {
    it('should handle z.record schema properly', async () => {
      const model = new MockLanguageModelV2({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                items: {
                  key1: { name: 'item1', value: 10 },
                  key2: { name: 'item2', value: 20 },
                },
              }),
            },
          ],
        },
      });

      const schema = z.object({
        items: z.record(
          z.string(),
          z.object({
            name: z.string(),
            value: z.number(),
          }),
        ),
      });

      const result = await generateObject({
        model,
        schema,
        prompt: 'Generate some items as a record',
      });

      // Expected result should be a record/object
      expect(result.object.items).toEqual({
        key1: { name: 'item1', value: 10 },
        key2: { name: 'item2', value: 20 },
      });
    });

    it('should handle z.record with string keys explicitly defined', async () => {
      const model = new MockLanguageModelV2({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                items: {
                  'user-1': { name: 'Alice', age: 30 },
                  'user-2': { name: 'Bob', age: 25 },
                },
              }),
            },
          ],
        },
      });

      const schema = z.object({
        items: z.record(
          z.string(),
          z.object({
            name: z.string(),
            age: z.number(),
          }),
        ),
      });

      const result = await generateObject({
        model,
        schema,
        prompt: 'Generate user records',
      });

      expect(result.object.items).toEqual({
        'user-1': { name: 'Alice', age: 30 },
        'user-2': { name: 'Bob', age: 25 },
      });
    });

    it('should handle empty record', async () => {
      const model = new MockLanguageModelV2({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                items: {},
              }),
            },
          ],
        },
      });

      const schema = z.object({
        items: z.record(
          z.string(),
          z.object({
            name: z.string(),
            value: z.number(),
          }),
        ),
      });

      const result = await generateObject({
        model,
        schema,
        prompt: 'Generate empty record',
      });

      expect(result.object.items).toEqual({});
    });

    it('should handle nested records', async () => {
      const model = new MockLanguageModelV2({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                categories: {
                  electronics: {
                    items: {
                      laptop: { price: 1000, stock: 5 },
                      phone: { price: 500, stock: 10 },
                    },
                  },
                  books: {
                    items: {
                      novel: { price: 20, stock: 15 },
                      textbook: { price: 100, stock: 3 },
                    },
                  },
                },
              }),
            },
          ],
        },
      });

      const schema = z.object({
        categories: z.record(
          z.string(),
          z.object({
            items: z.record(
              z.string(),
              z.object({
                price: z.number(),
                stock: z.number(),
              }),
            ),
          }),
        ),
      });

      const result = await generateObject({
        model,
        schema,
        prompt: 'Generate nested category records',
      });

      expect(result.object).toBeDefined();
    });

    it('should use name and description for record schemas', async () => {
      const model = new MockLanguageModelV2({
        doGenerate: async ({ prompt, responseFormat }) => {
          expect(responseFormat).toBeDefined();
          if (responseFormat && responseFormat.type === 'json') {
            expect(responseFormat.name).toBe('item-records');
            expect(responseFormat.description).toBe(
              'A collection of items as records',
            );
          }

          return {
            ...dummyResponseValues,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  items: {
                    key1: { name: 'test', value: 1 },
                  },
                }),
              },
            ],
          };
        },
      });

      await generateObject({
        model,
        schema: z.object({
          items: z.record(
            z.string(),
            z.object({
              name: z.string(),
              value: z.number(),
            }),
          ),
        }),
        schemaName: 'item-records',
        schemaDescription: 'A collection of items as records',
        prompt: 'prompt',
      });
    });

    it('should handle z.record without explicit string key (Issue #7674 case 1)', async () => {
      const model = new MockLanguageModelV2({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                items: {
                  key1: { name: 'item1', value: 10 },
                  key2: { name: 'item2', value: 20 },
                },
              }),
            },
          ],
        },
      });

      const schema = z.object({
        items: z.record(z.object({
          name: z.string(),
          value: z.number(),
        })),
      });

      const result = await generateObject({
        model,
        schema,
        prompt: 'Generate some items as a record without explicit string key',
      });

      expect(result.object.items).toEqual({
        key1: { name: 'item1', value: 10 },
        key2: { name: 'item2', value: 20 },
      });
    });
  });

  describe('error handling for z.record', () => {
    it('should throw TypeValidationError when record value does not match schema', async () => {
      const model = new MockLanguageModelV2({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                items: {
                  key1: { name: 'test' }, // missing 'value' field
                },
              }),
            },
          ],
        },
      });

      const schema = z.object({
        items: z.record(
          z.string(),
          z.object({
            name: z.string(),
            value: z.number(),
          }),
        ),
      });

      await expect(
        generateObject({
          model,
          schema,
          prompt: 'Generate invalid record',
        }),
      ).rejects.toThrow(TypeValidationError);
    });

    it('should throw TypeValidationError when LLM returns array instead of record', async () => {
      const model = new MockLanguageModelV2({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                items: [{ name: 'test', value: 1 }], // array instead of record
              }),
            },
          ],
        },
      });

      const schema = z.object({
        items: z.record(
          z.string(),
          z.object({
            name: z.string(),
            value: z.number(),
          }),
        ),
      });

      await expect(
        generateObject({
          model,
          schema,
          prompt: 'Generate array instead of record',
        }),
      ).rejects.toThrow(TypeValidationError);
    });
  });

  describe('comparison with current behavior (should fail before fix)', () => {
    it('should now work correctly with z.record after implementing support', async () => {
      const model = new MockLanguageModelV2({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                items: {
                  key1: { name: 'test', value: 1 },
                },
              }),
            },
          ],
        },
      });

      const schema = z.object({
        items: z.record(
          z.string(),
          z.object({
            name: z.string(),
            value: z.number(),
          }),
        ),
      });

      const result = await generateObject({
        model,
        schema,
        prompt: 'Generate some items',
      });

      expect(result.object.items).toEqual({
        key1: { name: 'test', value: 1 },
      });
    });

    it('should work fine with z.array (current working behavior)', async () => {
      const model = new MockLanguageModelV2({
        doGenerate: {
          ...dummyResponseValues,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                elements: [
                  { name: 'item1', value: 10 },
                  { name: 'item2', value: 20 },
                ],
              }),
            },
          ],
        },
      });

      const schema = z.object({
        name: z.string(),
        value: z.number(),
      });

      const result = await generateObject({
        model,
        schema,
        output: 'array',
        prompt: 'Generate some items as array',
      });

      expect(result.object).toEqual([
        { name: 'item1', value: 10 },
        { name: 'item2', value: 20 },
      ]);
    });
  });
});
