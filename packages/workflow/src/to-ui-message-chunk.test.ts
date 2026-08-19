import { describe, expect, it } from 'vitest';
import { normalizeUIMessageStreamParts } from './normalize-ui-message-stream.js';
import { toUIMessageChunk } from './to-ui-message-chunk.js';

describe('workflow UI stream reset-step', () => {
  it('converts reset-step model-call parts to UI message chunks', () => {
    expect(toUIMessageChunk({ type: 'reset-step' })).toEqual({
      type: 'reset-step',
    });
  });

  it('starts a new normalization frame after reset-step', async () => {
    const source = (async function* () {
      yield { type: 'text-start' as const, id: 'text-1' };
      yield { type: 'reset-step' as const };
      yield { type: 'text-start' as const, id: 'text-1' };
      yield { type: 'text-delta' as const, id: 'text-1', delta: 'retry' };
      yield { type: 'text-end' as const, id: 'text-1' };
    })();

    const chunks = [];
    for await (const chunk of normalizeUIMessageStreamParts(source)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'text-start', id: 'text-1' },
      { type: 'reset-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'retry' },
      { type: 'text-end', id: 'text-1' },
    ]);
  });
});
