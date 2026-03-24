import { describe, expectTypeOf, it } from 'vitest';
import { UIMessageChunk, uiMessageChunkSchema } from './ui-message-chunks';
import { validateTypes } from '@ai-sdk/provider-utils';

describe('UI message chunks type', () => {
  it('parsed UI message chunk should have UIMessageChunk type', async () => {
    const chunk = await validateTypes({
      schema: uiMessageChunkSchema,
      value: {
        type: 'text-delta',
        delta: 'Hello, world!',
        id: '123',
      },
    });

    // toMatchTypeOf (not toEqualTypeOf) because passthrough() adds an index
    // signature to the inferred type, making it wider than the UIMessageChunk union.
    expectTypeOf(chunk).toMatchTypeOf<UIMessageChunk>();
  });
});
