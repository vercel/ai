import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';
import { getOutputStrategy } from './output-strategy';

describe('recordOutputStrategy unit tests', () => {
  describe('getOutputStrategy with record type', () => {
    it('should return recordOutputStrategy for z.record schema', () => {
      const schema = z.record(
        z.string(),
        z.object({
          name: z.string(),
          value: z.number(),
        }),
      );

      const strategy = getOutputStrategy({
        output: 'record' as any,
        schema,
      });

      expect(strategy.type).toBe('record');
      expect(strategy.jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          items: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                value: { type: 'number' },
              },
              required: ['name', 'value'],
              additionalProperties: false,
            },
          },
        },
        required: ['items'],
        additionalProperties: false,
      });
    });

    it('should handle validateFinalResult for valid record', async () => {
      const schema = z.record(
        z.string(),
        z.object({
          name: z.string(),
          value: z.number(),
        }),
      );

      const strategy = getOutputStrategy({
        output: 'record' as any,
        schema,
      });

      const validRecord = {
        items: {
          key1: { name: 'test1', value: 1 },
          key2: { name: 'test2', value: 2 },
        },
      };

      const result = await strategy.validateFinalResult(validRecord, {
        text: JSON.stringify(validRecord),
        response: { id: 'test', timestamp: new Date(), modelId: 'test' },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      } as any);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({
          key1: { name: 'test1', value: 1 },
          key2: { name: 'test2', value: 2 },
        });
      }
    });

    it('should handle validateFinalResult for invalid record structure', async () => {
      const schema = z.record(
        z.string(),
        z.object({
          name: z.string(),
          value: z.number(),
        }),
      );

      const strategy = getOutputStrategy({
        output: 'record' as any,
        schema,
      });

      const invalidRecord = {
        items: [{ name: 'test1', value: 1 }],
      };

      const result = await strategy.validateFinalResult(invalidRecord, {
        text: JSON.stringify(invalidRecord),
        response: { id: 'test', timestamp: new Date(), modelId: 'test' },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      } as any);

      expect(result.success).toBe(false);
    });

    it('should handle validateFinalResult for record with invalid values', async () => {
      const schema = z.record(
        z.string(),
        z.object({
          name: z.string(),
          value: z.number(),
        }),
      );

      const strategy = getOutputStrategy({
        output: 'record' as any,
        schema,
      });

      const invalidRecord = {
        items: {
          key1: { name: 'test1', value: 'not-a-number' },
        },
      };

      const result = await strategy.validateFinalResult(invalidRecord, {
        text: JSON.stringify(invalidRecord),
        response: { id: 'test', timestamp: new Date(), modelId: 'test' },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      } as any);

      expect(result.success).toBe(false);
    });

    it('should handle validatePartialResult for partial record', async () => {
      const schema = z.record(
        z.string(),
        z.object({
          name: z.string(),
          value: z.number(),
        }),
      );

      const strategy = getOutputStrategy({
        output: 'record' as any,
        schema,
      });

      const partialRecord = {
        items: {
          key1: { name: 'test1', value: 1 },
        },
      };

      const result = await strategy.validatePartialResult({
        value: partialRecord,
        textDelta: '{"items":{"key1":{"name":"test1","value":1}}}',
        isFirstDelta: true,
        isFinalDelta: false,
        latestObject: undefined,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.partial).toEqual({
          key1: { name: 'test1', value: 1 },
        });
      }
    });
  });

  describe('edge cases', () => {
    it('should handle record with primitive values', () => {
      const schema = z.record(z.string(), z.string());

      const strategy = getOutputStrategy({
        output: 'record' as any,
        schema,
      });

      expect(strategy.jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          items: {
            type: 'object',
            additionalProperties: {
              type: 'string',
            },
          },
        },
        required: ['items'],
        additionalProperties: false,
      });
    });

    it('should handle record with union values', () => {
      const schema = z.record(z.string(), z.union([z.string(), z.number()]));

      const strategy = getOutputStrategy({
        output: 'record' as any,
        schema,
      });

      expect(strategy.jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          items: {
            type: 'object',
            additionalProperties: {
              anyOf: [{ type: 'string' }, { type: 'number' }],
            },
          },
        },
      });
    });

    it('should handle empty record validation', async () => {
      const schema = z.record(z.string(), z.string());

      const strategy = getOutputStrategy({
        output: 'record' as any,
        schema,
      });

      const emptyRecord = { items: {} };

      const result = await strategy.validateFinalResult(emptyRecord, {
        text: JSON.stringify(emptyRecord),
        response: { id: 'test', timestamp: new Date(), modelId: 'test' },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      } as any);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({});
      }
    });
  });
});
