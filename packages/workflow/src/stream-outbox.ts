import { generateId } from '@ai-sdk/provider-utils';
import type { ToolSet } from 'ai';
import type { ModelCallStreamPart } from './model-call.js';

type StreamPart = ModelCallStreamPart<ToolSet>;

/**
 * Stream parts that the workflow wants on the agent's stream, held until a
 * step writes them.
 *
 * Workflow code cannot write to a stream; only a step can, and a step that
 * writes waits for the stream to acknowledge its parts before it completes.
 * A step for every write therefore adds a step and a stream round trip to the
 * agent loop each time. Parts that nothing is waiting to see are held here
 * instead, and the next step that runs anyway writes them first: usually the
 * next model step, which writes them while the model request is in flight.
 *
 * Runs in workflow context.
 */
export interface StreamOutbox {
  /** Holds parts until a step writes them. */
  push(...parts: StreamPart[]): void;

  /**
   * Names the execution of the last model step that the workflow continued
   * with. It is written on the next part, or on a part of its own if nothing
   * else is written.
   */
  commit(attemptId: string | undefined): void;

  /** Whether parts are held. A commit alone does not count. */
  hasParts(): boolean;

  /**
   * Removes and returns what is held, for a step that writes it before its
   * own output. Returns `undefined` when nothing is held.
   */
  take(): StreamPart[] | undefined;

  /**
   * Writes what is held in a step of its own, and closes the stream when
   * `close` is set. Does nothing when nothing is held and `close` is not set.
   */
  flush(options?: { close?: boolean }): Promise<void>;
}

export function createStreamOutbox(
  writable: WritableStream<StreamPart> | undefined,
): StreamOutbox {
  let held: StreamPart[] = [];
  let committedAttemptId: string | undefined;
  // A step that writes held parts can run more than once. Every held part gets
  // an id that is the same in each of those executions, so a reader can drop
  // the repeats. The prefix tells apart the calls that share one stream.
  let writeIdPrefix: string | undefined;
  let writeCount = 0;

  const take = (): StreamPart[] | undefined => {
    if (writable == null) return undefined;

    const parts = held;
    held = [];
    if (committedAttemptId != null) {
      // On the first part, so that the commit costs no write of its own.
      parts[0] =
        parts.length > 0
          ? { ...parts[0], commitAttemptId: committedAttemptId }
          : { type: 'commit-step', commitAttemptId: committedAttemptId };
      committedAttemptId = undefined;
    }
    if (parts.length === 0) return undefined;

    writeIdPrefix ??= generateId();
    return parts.map(part => ({
      ...part,
      writeId: `${writeIdPrefix}-${writeCount++}`,
    }));
  };

  return {
    push(...parts) {
      if (writable != null) held.push(...parts);
    },
    commit(attemptId) {
      if (writable != null && attemptId != null) committedAttemptId = attemptId;
    },
    hasParts: () => held.length > 0,
    take,
    async flush({ close = false } = {}) {
      if (writable == null) return;
      const parts = take();
      if (parts == null && !close) return;
      await writeStreamParts(writable, parts ?? [], close);
    },
  };
}

/**
 * Writes parts to the stream and optionally closes it. A step, because a
 * writable can only be written to and closed in a step.
 */
export async function writeStreamParts(
  writable: WritableStream<StreamPart>,
  parts: StreamPart[],
  close = false,
): Promise<void> {
  'use step';
  if (parts.length > 0) {
    const writer = writable.getWriter();
    try {
      // Queued together: the parts are written in order, and none waits for
      // the one before it to be acknowledged.
      await Promise.all(parts.map(part => writer.write(part)));
    } finally {
      writer.releaseLock();
    }
  }
  if (close) {
    await writable.close();
  }
}
