import { describe, expect, it } from 'vitest';
import { CallToolResultSchema } from './types';

describe('CallToolResultSchema', () => {
  it.each([
    ['object', { value: 42 }],
    ['array', [1, 'two', false]],
    ['string', 'result'],
    ['number', 42],
    ['boolean', true],
    ['null', null],
  ])('normalizes structured-only results with %s content', (_, value) => {
    expect(CallToolResultSchema.parse({ structuredContent: value })).toEqual({
      content: [{ type: 'text', text: JSON.stringify(value) }],
      structuredContent: value,
      isError: false,
    });
  });

  it('preserves structured-only error results', () => {
    expect(
      CallToolResultSchema.parse({
        structuredContent: { code: 'NOT_FOUND' },
        isError: true,
      }),
    ).toEqual({
      content: [{ type: 'text', text: '{"code":"NOT_FOUND"}' }],
      structuredContent: { code: 'NOT_FOUND' },
      isError: true,
    });
  });

  it('preserves results that already contain content', () => {
    const result = {
      content: [{ type: 'text' as const, text: 'Existing content' }],
      structuredContent: { value: 42 },
    };

    expect(CallToolResultSchema.parse(result)).toEqual({
      ...result,
      isError: false,
    });
  });

  it.each([{}, { _meta: {} }, { value: 42 }, { toolResult: undefined }])(
    'rejects results without content, structuredContent, or toolResult',
    result => {
      expect(CallToolResultSchema.safeParse(result).success).toBe(false);
    },
  );

  it('accepts legacy toolResult responses', () => {
    expect(CallToolResultSchema.parse({ toolResult: { value: 42 } })).toEqual({
      toolResult: { value: 42 },
    });
  });

  it.each([
    { content: [{ type: 'text' }] },
    {
      content: [{ type: 'image', data: 'not-base64', mimeType: 'image/png' }],
    },
  ])('rejects malformed known content types', result => {
    expect(CallToolResultSchema.safeParse(result).success).toBe(false);
  });

  it.each([undefined, BigInt(1), Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects non-JSON structured content',
    structuredContent => {
      expect(
        CallToolResultSchema.safeParse({ structuredContent }).success,
      ).toBe(false);
    },
  );

  it('rejects cyclic structured content', () => {
    const structuredContent: Record<string, unknown> = {};
    structuredContent.self = structuredContent;

    expect(() => CallToolResultSchema.parse({ structuredContent })).toThrow();
  });
});
