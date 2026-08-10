import { describe, expect, it } from 'vitest';
import { toUIMessageChunk } from './to-ui-message-chunk.js';

describe('toUIMessageChunk', () => {
  it('preserves the retry invalidation marker as a UI chunk', () => {
    expect(
      toUIMessageChunk({
        type: 'reload',
      } as never),
    ).toEqual({
      type: 'reload',
    });
  });
});
