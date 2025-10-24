import { fail } from 'assert';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { verifyNoObjectGeneratedError } from '../error/verify-no-object-generated-error';
import { object, text } from './output';

const context = {
  response: {
    id: '123',
    timestamp: new Date(),
    modelId: '456',
  },
  usage: {
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  },
  finishReason: 'length',
} as const;

describe('Output.text', () => {
  const outputText = text();

  describe('parseOutput', () => {
    it('should return the text as is', async () => {
      const result = await outputText.parseOutput(
        { text: 'some output' },
        context,
      );
      expect(result).toBe('some output');
    });

    it('should handle empty string', async () => {
      const result = await outputText.parseOutput({ text: '' }, context);
      expect(result).toBe('');
    });

    it('should handle undefined as string "undefined"', async () => {
      // Output.text() expects a string, so passing undefined would be a type error,
      // but we cast for test purposes to ensure what happens
      const result = await outputText.parseOutput(
        { text: undefined as any },
        context,
      );
      expect(result).toBeUndefined();
    });
  });

  describe('parsePartial', () => {
    it('should return the string as partial', async () => {
      const result = await outputText.parsePartial({ text: 'partial text' });
      expect(result).toEqual({ partial: 'partial text' });
    });

    it('should handle empty string partial', async () => {
      const result = await outputText.parsePartial({ text: '' });
      expect(result).toEqual({ partial: '' });
    });
  });
});

describe('Output.object', () => {
  const output1 = object({ schema: z.object({ content: z.string() }) });

  describe('parseOutput', () => {
    it('should parse the output of the model', async () => {
      const result = await output1.parseOutput(
        { text: `{ "content": "test" }` },
        context,
      );

      expect(result).toStrictEqual({ content: 'test' });
    });

    it('should throw NoObjectGeneratedError when parsing fails', async () => {
      try {
        await output1.parseOutput({ text: '{ broken json' }, context);
        fail('must throw error');
      } catch (error) {
        verifyNoObjectGeneratedError(error, {
          message: 'No object generated: could not parse the response.',
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason,
        });
      }
    });

    it('should throw NoObjectGeneratedError when schema validation fails', async () => {
      try {
        await output1.parseOutput({ text: `{ "content": 123 }` }, context);
        fail('must throw error');
      } catch (error) {
        verifyNoObjectGeneratedError(error, {
          message: 'No object generated: response did not match schema.',
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason,
        });
      }
    });
  });

  describe('parsePartial', () => {
    it('should return undefined for undefined input', async () => {
      const result = await output1.parsePartial({ text: undefined as any });
      expect(result).toBeUndefined();
    });

    it('should return partial object for valid JSON', async () => {
      const result = await output1.parsePartial({
        text: '{ "content": "test" }',
      });
      expect(result).toEqual({ partial: { content: 'test' } });
    });

    it('should return partial object for repairable JSON', async () => {
      const result = await output1.parsePartial({
        text: '{ "content": "test"',
      });
      expect(result).toEqual({ partial: { content: 'test' } });
    });

    it('should handle partial object with missing closing brace', async () => {
      const result = await output1.parsePartial({
        text: '{ "content": "partial", "count": 42',
      });
      expect(result).toEqual({ partial: { content: 'partial', count: 42 } });
    });

    it('should handle partial array', async () => {
      const arrayOutput = object({
        schema: z.object({ items: z.array(z.string()) }),
      });
      const result = await arrayOutput.parsePartial({
        text: '{ "items": ["a", "b"',
      });
      expect(result).toEqual({ partial: { items: ['a', 'b'] } });
    });

    it('should handle empty string input', async () => {
      const result = await output1.parsePartial({ text: '' });
      expect(result).toBeUndefined();
    });

    it('should handle partial string value', async () => {
      const result = await output1.parsePartial({
        text: '{ "content": "partial str',
      });
      expect(result).toEqual({ partial: { content: 'partial str' } });
    });
  });
});
