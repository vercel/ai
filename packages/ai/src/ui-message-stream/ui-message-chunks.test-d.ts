import { describe, expectTypeOf, it } from 'vitest';
import { UIMessageChunk, uiMessageChunkSchema } from './ui-message-chunks';

describe('UI message chunks type', () => {
  it('should work with fixed inputSchema', () => {
    const chunk = uiMessageChunkSchema.parse({
      type: 'text-delta',
      delta: 'Hello, world!',
      id: '123',
    });

    expectTypeOf(chunk).toEqualTypeOf<UIMessageChunk>();
  });
});
