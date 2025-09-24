import { describe, expectTypeOf, it } from 'vitest';
import { UIMessageChunk, uiMessageChunkSchema } from './ui-message-chunks';

describe('UI message chunks type', () => {
  it('parsed UI message chunk should have UIMessageChunk type', () => {
    const chunk = uiMessageChunkSchema.parse({
      type: 'text-delta',
      delta: 'Hello, world!',
      id: '123',
    });

    expectTypeOf(chunk).toEqualTypeOf<UIMessageChunk>();
  });
});
