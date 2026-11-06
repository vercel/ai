import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGoogle } from '../google-provider';

const URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const model = createGoogle({ apiKey: 'test-key' }).interactions(
  'gemini-4-argon',
);
const options: LanguageModelV4CallOptions = {
  prompt: [
    { role: 'user', content: [{ type: 'text', text: 'Write a book.' }] },
  ],
  maxOutputTokens: 100_000,
  providerOptions: { google: { background: false } },
};

type InteractionFixture = {
  id?: string;
  status: string;
  continuation_token?: string;
  usage?: Record<string, unknown>;
  steps: Array<{
    type: string;
    signature?: string;
    content?: Array<{ type: string; text: string }>;
  }>;
};

type EventFixture = {
  event_type: string;
  index?: number;
  status?: string;
  interaction?: InteractionFixture;
  interaction_id?: string;
  continuation_token?: string;
  usage?: Record<string, unknown>;
  delta?: { type: string; text?: string };
};

function loadJsonFixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(`src/interactions/__fixtures__/${name}.json`, 'utf8'),
  );
}

function loadStreamFixture(name: string) {
  const lines = readFileSync(
    `src/interactions/__fixtures__/${name}.chunks.txt`,
    'utf8',
  )
    .trim()
    .split('\n');
  return {
    events: lines.map(line => JSON.parse(line) as EventFixture),
    chunks: lines.map(line => `data: ${line}\n\n`),
  };
}

function textDeltas(events: EventFixture[]) {
  return events.flatMap(event =>
    event.delta?.type === 'text' && event.delta.text != null
      ? [event.delta.text]
      : [],
  );
}

function toChunks(events: EventFixture[]) {
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`);
}

function withCompletion(
  events: EventFixture[],
  overrides: Partial<InteractionFixture>,
) {
  return events.map(event =>
    event.event_type === 'interaction.completed'
      ? { ...event, interaction: { ...event.interaction!, ...overrides } }
      : event,
  );
}

const first = loadJsonFixture<InteractionFixture>('long-decode.1');
const last = loadJsonFixture<InteractionFixture>('long-decode.2');
const firstStream = loadStreamFixture('long-decode.1');
const lastStream = loadStreamFixture('long-decode.2');
const firstCheckpointIndex = firstStream.events.findIndex(
  event => event.continuation_token != null,
);
const firstCheckpoint = firstStream.events[firstCheckpointIndex];
const lastCheckpoint = firstStream.events.at(-1)!;
const finalInteraction = lastStream.events.at(-1)!.interaction!;

// Simulate a clean completion at the captured checkpoint. The live first
// stream disconnected here without emitting interaction.completed.
const continuationEvents = [
  ...firstStream.events,
  lastStream.events.find(
    event => event.event_type === 'step.stop' && event.index === 1,
  )!,
  {
    ...lastStream.events.at(-1)!,
    interaction: {
      ...finalInteraction,
      id: lastCheckpoint.interaction_id,
      status: 'requires_continuation',
      continuation_token: lastCheckpoint.continuation_token,
      usage: lastCheckpoint.usage,
    },
  },
];
const continuationChunks = toChunks(continuationEvents);

const server = createTestServer({ [URL]: {} });

describe('foreground Interactions continuation', () => {
  describe('doGenerate', () => {
    it('merges captured hops and usage while returning the final interaction id', async () => {
      server.urls[URL].response = [
        { type: 'json-value', body: first },
        { type: 'json-value', body: last },
      ];
      const result = await model.doGenerate(options);
      expect(
        result.content
          .filter(part => part.type === 'text')
          .map(part => part.text),
      ).toEqual(
        [first, last].flatMap(hop =>
          hop.steps.flatMap(
            step =>
              step.content
                ?.filter(part => part.type === 'text')
                .map(part => part.text) ?? [],
          ),
        ),
      );
      expect(
        result.content
          .filter(part => part.type === 'reasoning')
          .map(part => part.providerMetadata?.google?.signature),
      ).toEqual(
        [first, last].flatMap(hop =>
          hop.steps
            .filter(step => step.type === 'thought')
            .map(step => step.signature),
        ),
      );
      expect(
        result.content.every(
          part => part.providerMetadata?.google?.interactionId === last.id,
        ),
      ).toBe(true);
      expect(result.finishReason).toEqual({
        unified: 'length',
        raw: 'incomplete',
      });
      expect(result.providerMetadata?.google?.interactionId).toBe(last.id);
      expect(result.response?.id).toBe(last.id);
      expect(result.usage.inputTokens.total).toBe(33_164);
      expect(result.usage.outputTokens).toMatchObject({
        total: 40_000,
        text: 40_000,
        reasoning: 0,
      });
      expect(result.usage.raw).toMatchObject({
        total_cached_tokens: 0,
        initial_input_tokens: 198,
        input_tokens_by_modality: [{ modality: 'text', tokens: 33_164 }],
        output_tokens_by_modality: [{ modality: 'text', tokens: 40_000 }],
      });
      expect(result.response?.body).toMatchObject({
        id: last.id,
        status: 'incomplete',
        usage: { total_output_tokens: 40_000 },
      });
      expect(
        (result.response?.body as { steps: unknown[] } | undefined)?.steps,
      ).toHaveLength(4);
      const originalBody = await server.calls[0].requestBodyJson;
      const continuationBody = await server.calls[1].requestBodyJson;
      expect(continuationBody).toEqual({
        ...originalBody,
        input: undefined,
        previous_interaction_id: first.id,
        continuation_token: first.continuation_token,
      });
      expect(continuationBody).not.toHaveProperty('input');
      expect(result.request?.body).toEqual(originalBody);
    });

    it('keeps earlier usage when a later response omits or nulls counters', async () => {
      server.urls[URL].response = [
        { type: 'json-value', body: first },
        {
          type: 'json-value',
          body: {
            ...last,
            status: 'completed',
            continuation_token: undefined,
            usage: { total_output_tokens: null, total_input_tokens: 5 },
          },
        },
      ];
      const result = await model.doGenerate(options);
      expect(result.usage.inputTokens.total).toBe(203);
      expect(result.usage.outputTokens).toMatchObject({
        total: 32_768,
        text: 32_768,
        reasoning: 0,
      });
      expect(result.response?.body).not.toHaveProperty('continuation_token');
    });

    it('resends the original input with store: false', async () => {
      server.urls[URL].response = [
        { type: 'json-value', body: { ...first, id: undefined } },
        { type: 'json-value', body: { ...last, id: undefined } },
      ];
      const result = await model.doGenerate({
        ...options,
        providerOptions: { google: { store: false } },
      });
      expect(await server.calls[1].requestBodyJson).toEqual({
        ...(await server.calls[0].requestBodyJson),
        continuation_token: first.continuation_token,
      });
      expect(result.providerMetadata?.google?.interactionId).toBeUndefined();
    });

    it.each(['completed', 'incomplete', 'requires_action', 'failed'])(
      'stops at %s even if a token is present',
      async status => {
        server.urls[URL].response = {
          type: 'json-value',
          body: { ...last, status },
        };
        await model.doGenerate(options);
        expect(server.calls).toHaveLength(1);
      },
    );

    it('preserves captured progress when a continuation request fails', async () => {
      server.urls[URL].response = [
        { type: 'json-value', body: first },
        { type: 'error', status: 503, body: 'unavailable' },
      ];
      await expect(model.doGenerate(options)).rejects.toMatchObject({
        name: 'AI_GoogleInteractionsContinuationError',
        continuationToken: first.continuation_token,
        interactionId: first.id,
        partialInteraction: {
          id: first.id,
          status: first.status,
          steps: first.steps,
        },
        cause: expect.any(Error),
      });
    });

    it('rejects a continuation without a token instead of returning success', async () => {
      server.urls[URL].response = {
        type: 'json-value',
        body: { ...first, continuation_token: undefined },
      };
      await expect(model.doGenerate(options)).rejects.toThrow(/continuation/i);
      expect(server.calls).toHaveLength(1);
    });

    it('rejects repeated tokens instead of looping forever', async () => {
      server.urls[URL].response = [
        { type: 'json-value', body: first },
        {
          type: 'json-value',
          body: {
            ...last,
            status: 'requires_continuation',
            continuation_token: first.continuation_token,
          },
        },
      ];
      await expect(model.doGenerate(options)).rejects.toThrow(/continuation/i);
      expect(server.calls).toHaveLength(2);
    });
  });

  describe('doStream', () => {
    it('merges the captured checkpoint disconnect and resumed stream without losing or duplicating output', async () => {
      server.urls[URL].response = [
        { type: 'stream-chunks', chunks: firstStream.chunks },
        { type: 'stream-chunks', chunks: lastStream.chunks },
      ];
      const result = await model.doStream(options);
      const parts = await convertReadableStreamToArray(result.stream);
      expect(
        parts
          .filter(part => part.type === 'text-delta')
          .map(part => part.delta),
      ).toEqual(textDeltas([...firstStream.events, ...lastStream.events]));
      expect(parts.filter(part => part.type === 'stream-start')).toHaveLength(
        1,
      );
      expect(parts.filter(part => part.type === 'finish')).toEqual([
        expect.objectContaining({
          finishReason: { unified: 'stop', raw: 'completed' },
          usage: expect.objectContaining({
            inputTokens: expect.objectContaining({ total: 58_165 }),
            outputTokens: expect.objectContaining({
              total: 74_181,
              reasoning: 0,
            }),
            raw: expect.objectContaining({ initial_input_tokens: 167 }),
          }),
          providerMetadata: {
            google: {
              interactionId: finalInteraction.id,
              serviceTier: 'standard',
              outputTokensByModality: { text: 74_181 },
            },
          },
        }),
      ]);
      expect(await server.calls[1].requestBodyJson).toEqual({
        ...(await server.calls[0].requestBodyJson),
        input: undefined,
        continuation_token: lastCheckpoint.continuation_token,
        previous_interaction_id: lastCheckpoint.interaction_id,
      });
    });

    it('continues an intermediate requires_continuation completion', async () => {
      server.urls[URL].response = [
        { type: 'stream-chunks', chunks: continuationChunks },
        { type: 'stream-chunks', chunks: lastStream.chunks },
      ];
      const result = await model.doStream(options);
      const parts = await convertReadableStreamToArray(result.stream);
      expect(parts.filter(part => part.type === 'finish')).toHaveLength(1);
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'stop' },
      });
      expect(await server.calls[1].requestBodyJson).toMatchObject({
        continuation_token: lastCheckpoint.continuation_token,
        previous_interaction_id: lastCheckpoint.interaction_id,
      });
    });

    it('uses distinct block ids across stateless hops', async () => {
      const statelessChunks = (events: EventFixture[]) =>
        toChunks(
          events.map(event => ({
            ...event,
            ...(event.interaction != null
              ? { interaction: { ...event.interaction, id: '' } }
              : {}),
            ...(event.interaction_id != null ? { interaction_id: '' } : {}),
          })),
        );
      server.urls[URL].response = [
        {
          type: 'stream-chunks',
          chunks: statelessChunks(continuationEvents),
        },
        {
          type: 'stream-chunks',
          chunks: statelessChunks(lastStream.events),
        },
      ];
      const result = await model.doStream({
        ...options,
        providerOptions: { google: { store: false } },
      });
      const parts = await convertReadableStreamToArray(result.stream);
      const starts = parts.filter(part => part.type === 'text-start');
      expect(starts).toHaveLength(2);
      expect(new Set(starts.map(part => part.id)).size).toBe(2);
      expect(await server.calls[1].requestBodyJson).toEqual({
        ...(await server.calls[0].requestBodyJson),
        continuation_token: lastCheckpoint.continuation_token,
      });
    });

    it('resumes from a captured status checkpoint when no output followed it', async () => {
      const chunks = firstStream.chunks.slice(0, firstCheckpointIndex + 1);
      server.urls[URL].response = [
        { type: 'stream-chunks', chunks },
        { type: 'stream-chunks', chunks: lastStream.chunks },
      ];
      const result = await model.doStream(options);
      const parts = await convertReadableStreamToArray(result.stream);
      expect(
        parts
          .filter(part => part.type === 'text-delta')
          .map(part => part.delta),
      ).toEqual(
        textDeltas([
          ...firstStream.events.slice(0, firstCheckpointIndex + 1),
          ...lastStream.events,
        ]),
      );
      expect(await server.calls[1].requestBodyJson).toMatchObject({
        continuation_token: firstCheckpoint.continuation_token,
        previous_interaction_id: firstCheckpoint.interaction_id,
      });
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'stop' },
      });
    });

    it.each([false, true])(
      'handles a transport error with post-checkpoint output=%s',
      async outputAfterCheckpoint => {
        const end = firstCheckpointIndex + (outputAfterCheckpoint ? 2 : 1);
        const chunks = firstStream.chunks.slice(0, end);
        let index = 0;
        const fetch = vi.fn(async () => {
          const body =
            fetch.mock.calls.length === 1
              ? new ReadableStream<Uint8Array>({
                  pull(controller) {
                    if (index < chunks.length)
                      controller.enqueue(
                        new TextEncoder().encode(chunks[index++]),
                      );
                    else controller.error(new Error('connection dropped'));
                  },
                })
              : lastStream.chunks.join('');
          return new Response(body, {
            headers: { 'content-type': 'text/event-stream' },
          });
        });
        const localModel = createGoogle({
          apiKey: 'test-key',
          fetch,
        }).interactions('gemini-4-argon');
        const result = await localModel.doStream(options);
        const parts = await convertReadableStreamToArray(result.stream);
        expect(fetch).toHaveBeenCalledTimes(outputAfterCheckpoint ? 1 : 2);
        expect(parts.at(-1)).toMatchObject({
          type: 'finish',
          finishReason: { unified: outputAfterCheckpoint ? 'error' : 'stop' },
        });
        if (outputAfterCheckpoint) {
          expect(parts.find(part => part.type === 'error')).toMatchObject({
            error: {
              continuationToken: firstCheckpoint.continuation_token,
              cause: expect.any(Error),
            },
          });
        } else {
          expect(
            parts
              .filter(part => part.type === 'text-delta')
              .map(part => part.delta),
          ).toEqual(
            textDeltas([
              ...firstStream.events.slice(0, end),
              ...lastStream.events,
            ]),
          );
        }
      },
    );

    it('keeps the token owner when a resumed hop disconnects before a new checkpoint', async () => {
      server.urls[URL].response = [
        { type: 'stream-chunks', chunks: continuationChunks },
        {
          type: 'stream-chunks',
          chunks: lastStream.chunks.slice(0, 1),
        },
        { type: 'stream-chunks', chunks: lastStream.chunks },
      ];
      const result = await model.doStream(options);
      await convertReadableStreamToArray(result.stream);
      expect(await server.calls[2].requestBodyJson).toMatchObject({
        continuation_token: lastCheckpoint.continuation_token,
        previous_interaction_id: lastCheckpoint.interaction_id,
      });
    });

    it('surfaces an interruption instead of replaying captured output after a checkpoint', async () => {
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: firstStream.chunks.slice(0, firstCheckpointIndex + 2),
      };
      const result = await model.doStream(options);
      const parts = await convertReadableStreamToArray(result.stream);
      expect(server.calls).toHaveLength(1);
      expect(parts.find(part => part.type === 'error')).toMatchObject({
        error: {
          name: 'AI_GoogleInteractionsContinuationError',
          continuationToken: firstCheckpoint.continuation_token,
          interactionId: firstCheckpoint.interaction_id,
        },
      });
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'error' },
      });
    });

    it('preserves the checkpoint when opening the next stream fails', async () => {
      server.urls[URL].response = [
        { type: 'stream-chunks', chunks: continuationChunks },
        { type: 'error', status: 503, body: 'unavailable' },
      ];
      const result = await model.doStream(options);
      const parts = await convertReadableStreamToArray(result.stream);
      expect(parts.find(part => part.type === 'error')).toMatchObject({
        error: {
          name: 'AI_GoogleInteractionsContinuationError',
          continuationToken: lastCheckpoint.continuation_token,
          interactionId: lastCheckpoint.interaction_id,
          cause: expect.any(Error),
        },
      });
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'error' },
        usage: { outputTokens: { total: 57_796 } },
      });
    });

    it('reports a continuation that is missing its token', async () => {
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: toChunks(
          withCompletion(continuationEvents, { continuation_token: undefined }),
        ),
      };
      const result = await model.doStream(options);
      const parts = await convertReadableStreamToArray(result.stream);
      expect(server.calls).toHaveLength(1);
      expect(parts.find(part => part.type === 'error')).toBeDefined();
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'error' },
      });
    });

    it('rejects a repeated completed-hop token', async () => {
      server.urls[URL].response = [
        { type: 'stream-chunks', chunks: continuationChunks },
        {
          type: 'stream-chunks',
          chunks: toChunks(
            withCompletion(lastStream.events, {
              status: 'requires_continuation',
              continuation_token: lastCheckpoint.continuation_token,
            }),
          ),
        },
      ];
      const result = await model.doStream(options);
      const parts = await convertReadableStreamToArray(result.stream);
      expect(server.calls).toHaveLength(2);
      expect(parts.find(part => part.type === 'error')).toBeDefined();
    });

    it.each(['incomplete', 'requires_action', 'failed'])(
      'stops a stream with status %s',
      async status => {
        server.urls[URL].response = {
          type: 'stream-chunks',
          chunks: toChunks(
            withCompletion(lastStream.events, {
              status,
              continuation_token: lastCheckpoint.continuation_token,
            }),
          ),
        };
        const result = await model.doStream(options);
        const parts = await convertReadableStreamToArray(result.stream);
        expect(server.calls).toHaveLength(1);
        expect(parts.at(-1)).toMatchObject({
          type: 'finish',
          finishReason: { raw: status },
        });
      },
    );

    it.each(['abort', 'cancel'])(
      'propagates %s to an in-flight continuation POST',
      async action => {
        const ac = new AbortController();
        let nextSignal: AbortSignal | undefined;
        const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
          if (fetch.mock.calls.length === 1)
            return new Response(firstStream.chunks.join(''), {
              headers: { 'content-type': 'text/event-stream' },
            });
          nextSignal = init?.signal ?? undefined;
          return new Promise<Response>((_resolve, reject) => {
            nextSignal!.addEventListener(
              'abort',
              () => reject(nextSignal!.reason),
              { once: true },
            );
          });
        });
        const localModel = createGoogle({
          apiKey: 'test-key',
          fetch,
        }).interactions('gemini-4-argon');
        const result = await localModel.doStream({
          ...options,
          abortSignal: ac.signal,
        });
        const reader = result.stream.getReader();
        const consumed = (async () => {
          while (!(await reader.read()).done) {
            /* Drain the stream. */
          }
        })();
        await vi.waitFor(() => expect(nextSignal).toBeDefined());
        if (action === 'abort') ac.abort();
        else await reader.cancel();
        await consumed;
        expect(nextSignal?.aborted).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(2);
      },
    );

    it('does not continue a requires_action event without a status field', async () => {
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: toChunks([
          firstStream.events[0],
          lastCheckpoint,
          {
            ...firstStream.events[1],
            event_type: 'interaction.requires_action',
            status: undefined,
          },
        ]),
      };
      const result = await model.doStream(options);
      const parts = await convertReadableStreamToArray(result.stream);
      expect(server.calls).toHaveLength(1);
      expect(parts.find(part => part.type === 'error')).toBeUndefined();
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'tool-calls' },
      });
    });

    it('does not use a checkpoint token after terminal completion', async () => {
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: lastStream.chunks,
      };
      const result = await model.doStream(options);
      const parts = await convertReadableStreamToArray(result.stream);
      expect(server.calls).toHaveLength(1);
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'stop' },
      });
    });

    it('bounds reconnects without checkpoint progress', async () => {
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: toChunks([firstStream.events[0], lastCheckpoint]),
      };
      const result = await model.doStream(options);
      const parts = await convertReadableStreamToArray(result.stream);
      expect(server.calls.length).toBeLessThanOrEqual(5);
      expect(parts.find(part => part.type === 'error')).toBeDefined();
    });
  });
});
