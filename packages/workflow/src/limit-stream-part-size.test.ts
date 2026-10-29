import { describe, expect, it, vi } from 'vitest';
import {
  limitStreamPartSize,
  OMITTED_STREAM_PAYLOAD,
} from './limit-stream-part-size.js';
import type { ModelCallStreamPart } from './model-call.js';

describe('limitStreamPartSize', () => {
  const maxBytes = 1024;
  const large = 'x'.repeat(2048);

  it('returns parts under the limit unchanged', () => {
    const part: ModelCallStreamPart = {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'search',
      input: {},
      output: 'ok',
    };

    expect(limitStreamPartSize(part, maxBytes)).toBe(part);
  });

  it('does not check deltas', () => {
    const part: ModelCallStreamPart = {
      type: 'text-delta',
      id: 'text-1',
      text: large,
    };

    expect(limitStreamPartSize(part, maxBytes)).toBe(part);
  });

  it('omits an oversized tool result output without changing the original', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const part: ModelCallStreamPart = {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'search',
      input: {},
      output: large,
    };

    expect(limitStreamPartSize(part, maxBytes)).toEqual({
      ...part,
      output: OMITTED_STREAM_PAYLOAD,
    });
    expect(part.output).toBe(large);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('also omits the tool result input when the output alone is not enough', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const part: ModelCallStreamPart = {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'search',
      input: { query: large },
      output: large,
    };

    expect(limitStreamPartSize(part, maxBytes)).toEqual({
      ...part,
      input: OMITTED_STREAM_PAYLOAD,
      output: OMITTED_STREAM_PAYLOAD,
    });
    warn.mockRestore();
  });

  it('omits oversized tool call inputs and tool errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(
      limitStreamPartSize(
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'search',
          input: { query: large },
        },
        maxBytes,
      ),
    ).toMatchObject({ input: OMITTED_STREAM_PAYLOAD });
    expect(
      limitStreamPartSize(
        {
          type: 'tool-error',
          toolCallId: 'call-1',
          toolName: 'search',
          input: {},
          error: large,
        },
        maxBytes,
      ),
    ).toMatchObject({ error: OMITTED_STREAM_PAYLOAD });
    warn.mockRestore();
  });

  it('drops other oversized parts', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(
      limitStreamPartSize(
        { type: 'raw', rawValue: large } as ModelCallStreamPart,
        maxBytes,
      ),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('counts binary data at its base64 size', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const file = {
      mediaType: 'image/png',
      uint8ArrayData: new Uint8Array(900),
    };

    expect(
      limitStreamPartSize(
        { type: 'file', file } as unknown as ModelCallStreamPart,
        maxBytes,
      ),
    ).toBeUndefined();
    warn.mockRestore();
  });

  it('counts multi-byte characters by their UTF-8 size', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const part: ModelCallStreamPart = {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'search',
      input: {},
      output: '€'.repeat(400),
    };

    expect(limitStreamPartSize(part, maxBytes)).toMatchObject({
      output: OMITTED_STREAM_PAYLOAD,
    });
    warn.mockRestore();
  });
});
