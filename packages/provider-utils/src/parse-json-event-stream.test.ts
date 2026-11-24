import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { parseJsonEventStream } from './parse-json-event-stream';

const MiB = 1024 * 1024;
const maxEventSize = 64 * MiB;

const encoder = new TextEncoder();

/**
 * Creates a stream that sends the `first` chunk, then the `repeated` chunk
 * `repeatCount` times, and then the `last` chunk.
 */
function createRepeatingStream({
  first,
  repeated,
  repeatCount,
  last,
}: {
  first: string;
  repeated: string;
  repeatCount: number;
  last?: string;
}) {
  const firstChunk = encoder.encode(first);
  const repeatedChunk = encoder.encode(repeated);
  const state = { sentBytes: 0, cancelled: false };
  let pullCount = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const isFirst = pullCount === 0;
      const isLast = pullCount === repeatCount + 1;
      pullCount++;

      if (isLast) {
        if (last != null) {
          controller.enqueue(encoder.encode(last));
        }
        controller.close();
        return;
      }

      const chunk = isFirst ? firstChunk : repeatedChunk;
      state.sentBytes += chunk.length;
      controller.enqueue(chunk);
    },
    cancel() {
      state.cancelled = true;
    },
  });

  return { stream, state };
}

describe('parseJsonEventStream', () => {
  it('should parse events and ignore the [DONE] event', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"value":"a"}\n\ndata: {"va'));
        controller.enqueue(encoder.encode('lue":"b"}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    });

    const reader = parseJsonEventStream({
      stream,
      schema: z.object({ value: z.string() }),
    }).getReader();

    await expect(reader.read()).resolves.toMatchObject({
      value: { success: true, value: { value: 'a' } },
    });
    await expect(reader.read()).resolves.toMatchObject({
      value: { success: true, value: { value: 'b' } },
    });
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it('should parse an event that is close to the maximum event size', async () => {
    const { stream } = createRepeatingStream({
      first: 'data: "',
      repeated: 'a'.repeat(MiB),
      repeatCount: 63,
      last: '"\n\n',
    });

    const reader = parseJsonEventStream({
      stream,
      schema: z.string(),
    }).getReader();

    const { value } = await reader.read();

    expect(value).toMatchObject({ success: true });
    expect(value?.success && value.value.length).toBe(63 * MiB);
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it.each([
    {
      name: 'a line that never ends',
      first: 'data: ',
      repeated: ' '.repeat(MiB),
    },
    {
      name: 'an event that never ends',
      first: 'data: {\n',
      repeated: `data: ${' '.repeat(MiB)}\n`,
    },
  ])(
    'should fail and cancel the stream when $name exceeds the maximum event size',
    async ({ first, repeated }) => {
      const { stream, state } = createRepeatingStream({
        first,
        repeated,
        repeatCount: 80,
      });

      const reader = parseJsonEventStream({
        stream,
        schema: z.unknown(),
      }).getReader();

      await expect(reader.read()).rejects.toMatchObject({
        name: 'ParseError',
        type: 'max-buffer-size-exceeded',
        message: `Buffered data exceeded max buffer size of ${maxEventSize} characters`,
      });
      expect(state.cancelled).toBe(true);

      // reading stops shortly after the limit is exceeded, before the stream ends:
      expect(state.sentBytes).toBeGreaterThan(maxEventSize);
      expect(state.sentBytes).toBeLessThan(maxEventSize + 8 * MiB);
    },
  );
});
