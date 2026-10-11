import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { parseJsonEventStream } from './parse-json-event-stream';

const encoder = new TextEncoder();
const schema = z.object({ value: z.string() });

describe('parseJsonEventStream', () => {
  it('terminates and cancels the source at the DONE marker when enabled', async () => {
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"value":"before"}\n\n' +
              'data: [DONE]\n\n' +
              'data: {"value":"after"}\n\n',
          ),
        );
      },
      cancel,
    });

    const reader = parseJsonEventStream({
      stream: source,
      schema,
      terminateOnDone: true,
    }).getReader();

    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: {
        success: true,
        value: { value: 'before' },
      },
    });
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it('continues after the DONE marker by default', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"value":"before"}\n\n' +
              'data: [DONE]\n\n' +
              'data: {"value":"after"}\n\n',
          ),
        );
        controller.close();
      },
    });

    const reader = parseJsonEventStream({
      stream: source,
      schema,
    }).getReader();

    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: {
        success: true,
        value: { value: 'before' },
      },
    });
    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: {
        success: true,
        value: { value: 'after' },
      },
    });
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });
});
