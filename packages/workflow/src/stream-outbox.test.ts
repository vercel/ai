import { describe, expect, it } from 'vitest';
import type { ModelCallStreamPart } from './model-call.js';
import { createStreamOutbox, writeStreamParts } from './stream-outbox.js';
import { withoutDeliveryFields } from './test/stream-delivery-fields.js';

function recordingWritable() {
  const written: ModelCallStreamPart[] = [];
  let closed = false;
  const writable = new WritableStream<ModelCallStreamPart>({
    write(part) {
      written.push(part);
    },
    close() {
      closed = true;
    },
  });
  return { writable, written, isClosed: () => closed };
}

const boundary = [
  { type: 'finish-step' },
  { type: 'start-step' },
] satisfies ModelCallStreamPart[];

describe('createStreamOutbox', () => {
  it('holds parts until they are taken', () => {
    const { writable, written } = recordingWritable();
    const outbox = createStreamOutbox(writable);

    outbox.push(...boundary);

    expect(written).toEqual([]);
    expect(outbox.hasParts()).toBe(true);
    expect(outbox.take()?.map(withoutDeliveryFields)).toEqual(boundary);
    expect(outbox.hasParts()).toBe(false);
    expect(outbox.take()).toBeUndefined();
  });

  it('writes the held parts in order when flushed', async () => {
    const { writable, written, isClosed } = recordingWritable();
    const outbox = createStreamOutbox(writable);

    outbox.push(...boundary);
    await outbox.flush();

    expect(written.map(withoutDeliveryFields)).toEqual(boundary);
    expect(isClosed()).toBe(false);
    expect(writable.locked).toBe(false);
  });

  it('writes nothing when nothing is held', async () => {
    const { writable, written } = recordingWritable();

    await createStreamOutbox(writable).flush();

    expect(written).toEqual([]);
  });

  it('closes the stream after the held parts when asked to', async () => {
    const { writable, written, isClosed } = recordingWritable();
    const outbox = createStreamOutbox(writable);

    outbox.push({ type: 'finish' });
    await outbox.flush({ close: true });

    expect(written.map(withoutDeliveryFields)).toEqual([{ type: 'finish' }]);
    expect(isClosed()).toBe(true);
  });

  it('closes the stream when nothing is held', async () => {
    const { writable, isClosed } = recordingWritable();

    await createStreamOutbox(writable).flush({ close: true });

    expect(isClosed()).toBe(true);
  });

  it('names the committed execution on the first part it writes', () => {
    const { writable } = recordingWritable();
    const outbox = createStreamOutbox(writable);

    outbox.commit('attempt-1');
    outbox.push(...boundary);

    expect(outbox.take()).toEqual([
      expect.objectContaining({
        type: 'finish-step',
        commitAttemptId: 'attempt-1',
      }),
      expect.not.objectContaining({ commitAttemptId: expect.anything() }),
    ]);
  });

  it('writes a commit of its own when no part is held', () => {
    const { writable } = recordingWritable();
    const outbox = createStreamOutbox(writable);

    outbox.commit('attempt-1');

    expect(outbox.hasParts()).toBe(false);
    expect(outbox.take()?.map(withoutDeliveryFields)).toEqual([
      { type: 'commit-step' },
    ]);
    expect(outbox.take()).toBeUndefined();
  });

  it('ignores a commit without an execution', () => {
    const { writable } = recordingWritable();
    const outbox = createStreamOutbox(writable);

    outbox.commit(undefined);

    expect(outbox.take()).toBeUndefined();
  });

  it('gives every part a write id that no other part has', () => {
    const { writable } = recordingWritable();
    const first = createStreamOutbox(writable);
    const second = createStreamOutbox(writable);

    first.push(...boundary);
    const firstBatch = first.take() ?? [];
    first.push(...boundary);
    second.push(...boundary);
    const ids = [
      ...firstBatch,
      ...(first.take() ?? []),
      ...(second.take() ?? []),
    ].map(part => part.writeId);

    expect(ids.every(id => typeof id === 'string')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('holds and writes nothing without a writable', async () => {
    const outbox = createStreamOutbox(undefined);

    outbox.push(...boundary);
    outbox.commit('attempt-1');

    expect(outbox.hasParts()).toBe(false);
    expect(outbox.take()).toBeUndefined();
    await expect(outbox.flush({ close: true })).resolves.toBeUndefined();
  });
});

describe('writeStreamParts', () => {
  it('releases the writable when a write fails', async () => {
    const writable = new WritableStream<ModelCallStreamPart>({
      write() {
        throw new Error('stream failed');
      },
    });

    await expect(writeStreamParts(writable, boundary)).rejects.toThrow(
      'stream failed',
    );
    expect(writable.locked).toBe(false);
  });
});
