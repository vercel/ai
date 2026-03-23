import { describe, it, expect } from 'vitest';
import { uiMessageChunkSchema } from './ui-message-chunks';
import { validateTypes } from '@ai-sdk/provider-utils';

describe('uiMessageChunkSchema', () => {
  it('should validate a chunk with recognized fields', async () => {
    const chunk = await validateTypes({
      schema: uiMessageChunkSchema,
      value: {
        type: 'text-delta',
        id: '1',
        delta: 'hello',
      },
    });

    expect(chunk).toEqual({
      type: 'text-delta',
      id: '1',
      delta: 'hello',
    });
  });

  it('should pass through unknown fields without error', async () => {
    const chunk = await validateTypes({
      schema: uiMessageChunkSchema,
      value: {
        type: 'text-delta',
        id: '1',
        delta: 'hello',
        unknownField: 'value',
      },
    });

    expect(chunk).toEqual({
      type: 'text-delta',
      id: '1',
      delta: 'hello',
      unknownField: 'value',
    });
  });

  it('should reject a chunk with an invalid type', async () => {
    await expect(
      validateTypes({
        schema: uiMessageChunkSchema,
        value: {
          type: 'invalid-type',
        },
      }),
    ).rejects.toThrow();
  });
});
