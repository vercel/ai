import { validateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { uiMessageChunkSchema, type UIMessageChunk } from './ui-message-chunks';

describe('uiMessageChunkSchema', () => {
  it('returns UI message chunks', async () => {
    const chunk = await validateTypes({
      schema: uiMessageChunkSchema,
      value: {
        type: 'text-delta',
        delta: 'Hello, world!',
        id: '123',
      },
    });

    expectTypeOf(chunk).toEqualTypeOf<UIMessageChunk>();
  });

  it('accepts chunks with fields added by newer servers', async () => {
    const chunk = {
      type: 'tool-output-available',
      toolCallId: 'call-123',
      output: { ok: true },
      optionalFieldFromNewerServer: {
        addedIn: 'future-ai-sdk-version',
      },
    };

    await expect(
      validateTypes({
        schema: uiMessageChunkSchema,
        value: chunk,
      }),
    ).resolves.toEqual(chunk);
  });
});
