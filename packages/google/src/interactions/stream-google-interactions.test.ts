import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { streamGoogleInteractionEvents } from './stream-google-interactions';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const INTERACTION_ID = 'v1_test-stream-id';
const STREAM_URL = `${BASE_URL}/interactions/${INTERACTION_ID}`;

function sse(events: Array<Record<string, unknown>>) {
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`);
}

describe('streamGoogleInteractionEvents', () => {
  const server = createTestServer({ [STREAM_URL]: {} });

  it('reads the SSE feed and exits when interaction.complete arrives', async () => {
    server.urls[STREAM_URL].response = {
      type: 'stream-chunks',
      chunks: sse([
        {
          event_type: 'interaction.start',
          event_id: 'evt-1',
          interaction: { id: INTERACTION_ID, status: 'in_progress' },
        },
        {
          event_type: 'content.start',
          event_id: 'evt-2',
          index: 0,
          content: { type: 'text' },
        },
        {
          event_type: 'content.delta',
          event_id: 'evt-3',
          index: 0,
          delta: { type: 'text', text: 'hello' },
        },
        {
          event_type: 'content.stop',
          event_id: 'evt-4',
          index: 0,
        },
        {
          event_type: 'interaction.complete',
          event_id: 'evt-5',
          interaction: { id: INTERACTION_ID, status: 'completed' },
        },
      ]),
    };

    const stream = streamGoogleInteractionEvents({
      baseURL: BASE_URL,
      interactionId: INTERACTION_ID,
      headers: {},
      retryDelayMs: 1,
    });

    const parsed = await convertReadableStreamToArray(stream);
    const eventTypes = parsed
      .filter(r => r.success)
      .map(r => (r.value as { event_type: string }).event_type);

    expect(eventTypes).toEqual([
      'interaction.start',
      'content.start',
      'content.delta',
      'content.stop',
      'interaction.complete',
    ]);
    expect(server.calls.length).toBe(1);
    expect(server.calls[0].requestUrlSearchParams.get('stream')).toBe('true');
    expect(
      server.calls[0].requestUrlSearchParams.get('last_event_id'),
    ).toBeNull();
  });

  it('reconnects with last_event_id when the stream ends without completion', async () => {
    let callIdx = 0;
    server.urls[STREAM_URL].response = () => {
      const idx = callIdx++;
      if (idx === 0) {
        return {
          type: 'stream-chunks',
          chunks: sse([
            {
              event_type: 'interaction.start',
              event_id: 'evt-1',
              interaction: { id: INTERACTION_ID, status: 'in_progress' },
            },
            {
              event_type: 'content.start',
              event_id: 'evt-2',
              index: 0,
              content: { type: 'text' },
            },
            {
              event_type: 'content.delta',
              event_id: 'evt-3',
              index: 0,
              delta: { type: 'text', text: 'first' },
            },
          ]),
        };
      }
      return {
        type: 'stream-chunks',
        chunks: sse([
          {
            event_type: 'content.delta',
            event_id: 'evt-4',
            index: 0,
            delta: { type: 'text', text: 'second' },
          },
          {
            event_type: 'content.stop',
            event_id: 'evt-5',
            index: 0,
          },
          {
            event_type: 'interaction.complete',
            event_id: 'evt-6',
            interaction: { id: INTERACTION_ID, status: 'completed' },
          },
        ]),
      };
    };

    const stream = streamGoogleInteractionEvents({
      baseURL: BASE_URL,
      interactionId: INTERACTION_ID,
      headers: {},
      retryDelayMs: 1,
    });

    const parsed = await convertReadableStreamToArray(stream);
    const eventTypes = parsed
      .filter(r => r.success)
      .map(r => (r.value as { event_type: string }).event_type);

    expect(eventTypes).toEqual([
      'interaction.start',
      'content.start',
      'content.delta',
      'content.delta',
      'content.stop',
      'interaction.complete',
    ]);
    expect(server.calls.length).toBe(2);
    expect(server.calls[1].requestUrlSearchParams.get('last_event_id')).toBe(
      'evt-3',
    );
  });

  it('errors out after maxRetries empty connections', async () => {
    server.urls[STREAM_URL].response = {
      type: 'stream-chunks',
      chunks: [],
    };

    const stream = streamGoogleInteractionEvents({
      baseURL: BASE_URL,
      interactionId: INTERACTION_ID,
      headers: {},
      maxRetries: 2,
      retryDelayMs: 1,
    });

    await expect(convertReadableStreamToArray(stream)).rejects.toThrow(
      /closed without producing any events/i,
    );
    expect(server.calls.length).toBe(2);
  });
});
