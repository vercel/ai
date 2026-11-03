import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import type { ParseResult } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { continueGoogleInteractionsStream } from './continue-google-interactions-stream';
import type { GoogleInteractionsEvent } from './google-interactions-api';
import { GoogleInteractionsContinuationError } from './google-interactions-continuation-error';

function parsed(
  value: Record<string, unknown>,
): ParseResult<GoogleInteractionsEvent> {
  return {
    success: true,
    value: value as GoogleInteractionsEvent,
    rawValue: value,
  };
}

function events(...values: Array<Record<string, unknown>>) {
  return convertArrayToReadableStream(values.map(parsed));
}

const created = (id: string) => ({
  event_type: 'interaction.created',
  interaction: { id, status: 'in_progress' },
});
const checkpoint = {
  event_type: 'interaction.status_update',
  status: 'in_progress',
  continuation_token: 'checkpoint-1',
};
const completed = {
  event_type: 'interaction.completed',
  interaction: { id: 'hop-2', status: 'completed' },
};

describe('continueGoogleInteractionsStream', () => {
  it('resumes a checkpoint when no content was delivered after it', async () => {
    const continueStream = vi.fn(async () =>
      events(created('hop-2'), completed),
    );
    const parts = await convertReadableStreamToArray(
      continueGoogleInteractionsStream({
        stream: events(created('hop-1'), checkpoint),
        continueStream,
      }),
    );
    expect(continueStream).toHaveBeenCalledExactlyOnceWith(
      'checkpoint-1',
      'hop-1',
    );
    expect(parts.filter(part => 'type' in part)).toEqual([
      { type: 'continuation-start' },
    ]);
    expect(parts.at(-1)).toMatchObject({ success: true, value: completed });
  });

  it('does not replay output delivered after a checkpoint', async () => {
    const continueStream = vi.fn();
    const parts = await convertReadableStreamToArray(
      continueGoogleInteractionsStream({
        stream: events(created('hop-1'), checkpoint, {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'text', text: 'Already delivered' },
        }),
        continueStream,
      }),
    );
    expect(continueStream).not.toHaveBeenCalled();
    expect(parts.at(-1)).toMatchObject({
      success: false,
      error: expect.objectContaining({
        continuationToken: 'checkpoint-1',
        interactionId: 'hop-1',
      }),
    });
    const last = parts.at(-1)!;
    expect(
      'success' in last &&
        !last.success &&
        GoogleInteractionsContinuationError.isInstance(last.error),
    ).toBe(true);
  });

  it('recovers a transport error after a checkpoint', async () => {
    let index = 0;
    const source = [created('hop-1'), checkpoint].map(parsed);
    const stream = new ReadableStream<ParseResult<GoogleInteractionsEvent>>({
      pull(controller) {
        if (index < source.length) controller.enqueue(source[index++]);
        else controller.error(new TypeError('Connection reset'));
      },
    });
    const continueStream = vi.fn(async () => events(completed));
    const parts = await convertReadableStreamToArray(
      continueGoogleInteractionsStream({ stream, continueStream }),
    );
    expect(continueStream).toHaveBeenCalledExactlyOnceWith(
      'checkpoint-1',
      'hop-1',
    );
    expect(parts.at(-1)).toMatchObject({ success: true, value: completed });
  });

  it('bounds retries without progress and preserves the seed token owner', async () => {
    const continueStream = vi.fn(async () => events(created('new-hop')));
    const parts = await convertReadableStreamToArray(
      continueGoogleInteractionsStream({
        stream: events(created('hop-1'), checkpoint),
        continueStream,
        maxReconnects: 1,
        retryDelayMs: 0,
      }),
    );
    expect(continueStream.mock.calls).toEqual([
      ['checkpoint-1', 'hop-1'],
      ['checkpoint-1', 'hop-1'],
    ]);
    expect(parts.at(-1)).toMatchObject({
      success: false,
      error: expect.objectContaining({
        continuationToken: 'checkpoint-1',
        interactionId: 'hop-1',
      }),
    });
  });

  it('does not continue a terminal hop with a stale checkpoint token', async () => {
    const continueStream = vi.fn();
    const parts = await convertReadableStreamToArray(
      continueGoogleInteractionsStream({
        stream: events(created('hop-1'), checkpoint, completed),
        continueStream,
      }),
    );
    expect(continueStream).not.toHaveBeenCalled();
    expect(parts.at(-1)).toMatchObject({ success: true, value: completed });
  });

  it('does not retry a terminal hop that returns its starting token', async () => {
    const continueStream = vi.fn();
    const parts = await convertReadableStreamToArray(
      continueGoogleInteractionsStream({
        stream: events({
          event_type: 'interaction.completed',
          interaction: {
            id: 'hop-2',
            status: 'requires_continuation',
            continuation_token: 'seed',
          },
        }),
        continueStream,
        initialContinuationToken: 'seed',
        initialInteractionId: 'hop-1',
      }),
    );
    expect(continueStream).not.toHaveBeenCalled();
    expect(parts.at(-1)).toMatchObject({
      success: false,
      error: expect.objectContaining({
        continuationToken: 'seed',
        interactionId: 'hop-1',
      }),
    });
  });

  it('omits the interaction id when resuming a stateless checkpoint', async () => {
    const continueStream = vi.fn(async () => events(completed));
    await convertReadableStreamToArray(
      continueGoogleInteractionsStream({
        stream: events(created('ignored'), checkpoint),
        continueStream,
        store: false,
      }),
    );
    expect(continueStream).toHaveBeenCalledExactlyOnceWith(
      'checkpoint-1',
      undefined,
    );
  });

  it('propagates aborts without wrapping or sending another request', async () => {
    const abort = new AbortController();
    abort.abort();
    const continueStream = vi.fn();
    await expect(
      convertReadableStreamToArray(
        continueGoogleInteractionsStream({
          stream: events(created('hop-1'), checkpoint),
          continueStream,
          abortSignal: abort.signal,
        }),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(continueStream).not.toHaveBeenCalled();
  });

  it('cancels the current stream without starting a continuation', async () => {
    const cancel = vi.fn();
    const continueStream = vi.fn();
    const stream = new ReadableStream<ParseResult<GoogleInteractionsEvent>>({
      cancel,
    });
    const reader = continueGoogleInteractionsStream({
      stream,
      continueStream,
    }).getReader();
    await reader.cancel('Stopped');
    expect(cancel).toHaveBeenCalledWith('Stopped');
    expect(continueStream).not.toHaveBeenCalled();
  });
});
