import { describe, expect, it } from 'vitest';
import { toUIMessageChunk } from './to-ui-message-chunk.js';

describe('toUIMessageChunk', () => {
  it('preserves the retry invalidation marker as a transient data chunk', () => {
    expect(
      toUIMessageChunk({
        type: 'data-reload',
        data: {},
      } as never),
    ).toEqual({
      type: 'data-reload',
      data: {},
      transient: true,
    });
  });
});
