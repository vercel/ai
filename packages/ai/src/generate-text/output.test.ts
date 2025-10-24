import { fail } from 'assert';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { verifyNoObjectGeneratedError } from '../error/verify-no-object-generated-error';
import { array, choice, object, text } from './output';

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
  const text1 = text();

  describe('responseFormat', () => {
    it('should return the text as is', async () => {
      const result = await text1.responseFormat;
      expect(result).toMatchInlineSnapshot(`
        {
          "type": "text",
        }
      `);
    });
  });

  describe('parseOutput', () => {
    it('should return the text as is', async () => {
      const result = await text1.parseOutput({ text: 'some output' }, context);
      expect(result).toBe('some output');
    });

    it('should handle empty string', async () => {
      const result = await text1.parseOutput({ text: '' }, context);
      expect(result).toBe('');
    });

    it('should handle undefined as string "undefined"', async () => {
      // Output.text() expects a string, so passing undefined would be a type error,
      // but we cast for test purposes to ensure what happens
      const result = await text1.parseOutput(
        { text: undefined as any },
        context,
      );
      expect(result).toBeUndefined();
    });
  });

  describe('parsePartial', () => {
    it('should return the string as partial', async () => {
      const result = await text1.parsePartial({ text: 'partial text' });
      expect(result).toEqual({ partial: 'partial text' });
    });

    it('should handle empty string partial', async () => {
      const result = await text1.parsePartial({ text: '' });
      expect(result).toEqual({ partial: '' });
    });
  });
});

describe('Output.object', () => {
  const object1 = object({ schema: z.object({ content: z.string() }) });

  describe('responseFormat', () => {
    it('should return the JSON schema for the object', async () => {
      const result = await object1.responseFormat;
      expect(result).toMatchInlineSnapshot(`
        {
          "schema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
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
          "type": "json",
        }
      `);
    });
  });

  describe('parseOutput', () => {
    it('should parse the output of the model', async () => {
      const result = await object1.parseOutput(
        { text: `{ "content": "test" }` },
        context,
      );

      expect(result).toStrictEqual({ content: 'test' });
    });

    it('should throw NoObjectGeneratedError when parsing fails', async () => {
      try {
        await object1.parseOutput({ text: '{ broken json' }, context);
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
        await object1.parseOutput({ text: `{ "content": 123 }` }, context);
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
      const result = await object1.parsePartial({ text: undefined as any });
      expect(result).toBeUndefined();
    });

    it('should return partial object for valid JSON', async () => {
      const result = await object1.parsePartial({
        text: '{ "content": "test" }',
      });
      expect(result).toEqual({ partial: { content: 'test' } });
    });

    it('should return partial object for repairable JSON', async () => {
      const result = await object1.parsePartial({
        text: '{ "content": "test"',
      });
      expect(result).toEqual({ partial: { content: 'test' } });
    });

    it('should handle partial object with missing closing brace', async () => {
      const result = await object1.parsePartial({
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
      const result = await object1.parsePartial({ text: '' });
      expect(result).toBeUndefined();
    });

    it('should handle partial string value', async () => {
      const result = await object1.parsePartial({
        text: '{ "content": "partial str',
      });
      expect(result).toEqual({ partial: { content: 'partial str' } });
    });
  });
});

describe('Output.array', () => {
  const array1 = array({ element: z.object({ content: z.string() }) });

  describe('responseFormat', () => {
    it('should return the JSON schema for the array', async () => {
      const result = await array1.responseFormat;
      expect(result).toMatchInlineSnapshot(`
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

  describe('parseOutput', () => {
    it('should parse the output of the model', async () => {
      const result = await array1.parseOutput(
        { text: `{ "elements": [{ "content": "test" }] }` },
        context,
      );

      expect(result).toStrictEqual([{ content: 'test' }]);
    });

    it('should throw NoObjectGeneratedError when parsing fails', async () => {
      try {
        await array1.parseOutput({ text: '{ broken json' }, context);
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
        await array1.parseOutput(
          { text: `{ "elements": [{ "content": 123 }] }` },
          context,
        );
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

  describe('array.parsePartial', () => {
    it('should parse partial output successfully for successful-parse', async () => {
      const partial = await array1.parsePartial({
        text: `{ "elements": [{ "content": "a" }, { "content": "b" }] }`,
      });
      expect(partial).toEqual({
        partial: [{ content: 'a' }, { content: 'b' }],
      });
    });

    it('should parse partial output successfully for repaired-parse (returns all but last element)', async () => {
      // Simulate an incomplete last element (at the end, missing " }")
      const partial = await array1.parsePartial({
        text: `{ "elements": [{ "content": "a" }, { "content": "b" }`,
      });
      // Should only return [{ content: "a" }]
      expect(partial).toEqual({
        partial: [{ content: 'a' }],
      });
    });

    it('should return undefined for failed-parse', async () => {
      const partial = await array1.parsePartial({
        text: '{ not valid json',
      });
      expect(partial).toBeUndefined();
    });

    it('should return undefined when input is undefined', async () => {
      const partial = await array1.parsePartial({
        text: undefined as any,
      });
      expect(partial).toBeUndefined();
    });

    it('should return undefined if elements is missing', async () => {
      // "elements" property is missing
      const partial = await array1.parsePartial({
        text: `{ "foo": [1,2,3] }`,
      });
      expect(partial).toBeUndefined();
    });

    it('should return undefined if elements is not an array', async () => {
      // "elements" property exists but is not an array
      const partial = await array1.parsePartial({
        text: `{ "elements": "not-an-array" }`,
      });
      expect(partial).toBeUndefined();
    });

    it('should handle an empty array of elements', async () => {
      const partial = await array1.parsePartial({
        text: `{ "elements": [] }`,
      });
      expect(partial).toEqual({ partial: [] });
    });
  });
});

describe('Output.choice', () => {
  const choice1 = choice({
    options: ['aaa', 'aab', 'ccc'],
  });

  describe('responseFormat', () => {
    it('should return the JSON schema for the choice', async () => {
      const result = await choice1.responseFormat;
      expect(result).toMatchInlineSnapshot(`
        {
          "schema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "result": {
                "enum": [
                  "aaa",
                  "aab",
                  "ccc",
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

  describe('parseOutput', () => {
    it('should parse a valid choice output', async () => {
      const result = await choice1.parseOutput(
        { text: `{ "result": "aaa" }` },
        context,
      );
      expect(result).toBe('aaa');
    });

    it('should throw NoObjectGeneratedError if JSON is invalid', async () => {
      await expect(
        choice1.parseOutput({ text: '{ broken json' }, context),
      ).rejects.toThrowError(
        'No object generated: could not parse the response.',
      );
    });

    it('should throw NoObjectGeneratedError if result is missing', async () => {
      await expect(
        choice1.parseOutput({ text: `{}` }, context),
      ).rejects.toThrowError(
        'No object generated: response did not match schema.',
      );
    });

    it('should throw NoObjectGeneratedError if result value is not a valid choice', async () => {
      await expect(
        choice1.parseOutput({ text: `{ "result": "d" }` }, context),
      ).rejects.toThrowError(
        'No object generated: response did not match schema.',
      );
    });

    it('should throw NoObjectGeneratedError if result is not a string', async () => {
      await expect(
        choice1.parseOutput({ text: `{ "result": 5 }` }, context),
      ).rejects.toThrowError(
        'No object generated: response did not match schema.',
      );
    });

    it('should throw NoObjectGeneratedError if top-level is not an object', async () => {
      await expect(
        choice1.parseOutput({ text: `"a"` }, context),
      ).rejects.toThrowError(
        'No object generated: response did not match schema.',
      );
    });
  });

  describe('parsePartial', () => {
    it('should parse a valid exact partial choice output', async () => {
      const result = await choice1.parsePartial({
        text: `{ "result": "aaa" }`,
      });
      expect(result).toEqual({ partial: 'aaa' });
    });

    it('should return undefined if JSON is invalid', async () => {
      const result = await choice1.parsePartial({ text: '{ broken json' });
      expect(result).toBeUndefined();
    });

    it('should return undefined if result is missing', async () => {
      const result = await choice1.parsePartial({ text: `{}` });
      expect(result).toBeUndefined();
    });

    it('should return ambiguous if result is a prefix matching multiple options (repaired-parse)', async () => {
      const result = await choice1.parsePartial({ text: `{ "result": "` });
      expect(result).toBeUndefined();
    });

    it('should return the single matching partial if only one option matches (repaired-parse)', async () => {
      const result = await choice1.parsePartial({ text: `{ "result": "c` });
      expect(result).toEqual({ partial: 'ccc' });
    });

    it('should return undefined if result does not match any choice', async () => {
      const result = await choice1.parsePartial({ text: `{ "result": "z" }` });
      expect(result).toBeUndefined();
    });

    it('should return undefined if result is not a string', async () => {
      const result = await choice1.parsePartial({ text: `{ "result": 5 }` });
      expect(result).toBeUndefined();
    });

    it('should return undefined if top-level is not an object', async () => {
      const result = await choice1.parsePartial({ text: `"a"` });
      expect(result).toBeUndefined();
    });

    it('should return full match as partial for "successful-parse" and valid choice', async () => {
      const result = await choice1.parsePartial({
        text: `{ "result": "aab" }`,
      });
      expect(result).toEqual({ partial: 'aab' });
    });

    it("should return undefined for an incomplete prefix that doesn't match any choice", async () => {
      const result = await choice1.parsePartial({ text: `{ "result": "x" }` });
      expect(result).toBeUndefined();
    });

    it('should return undefined for a prefix matching multiple options', async () => {
      const result = await choice1.parsePartial({ text: `{ "result": "a` });
      expect(result).toBeUndefined();
    });

    it('should return undefined if partial result is null', async () => {
      const result = await choice1.parsePartial({ text: `null` });
      expect(result).toBeUndefined();
    });
  });
});
