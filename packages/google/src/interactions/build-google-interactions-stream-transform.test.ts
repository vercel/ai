import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import {
  isProviderStreamError,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { buildGoogleInteractionsStreamTransform } from './build-google-interactions-stream-transform';
import type { GoogleInteractionsEvent } from './google-interactions-api';

function runTransform(events: Array<GoogleInteractionsEvent>) {
  const transform = buildGoogleInteractionsStreamTransform({
    warnings: [],
    generateId: () => 'test-id',
  });
  const input = convertArrayToReadableStream(
    events.map(value => ({ success: true, value, rawValue: value })),
  ) as ReadableStream<ParseResult<GoogleInteractionsEvent>>;
  return convertReadableStreamToArray(input.pipeThrough(transform));
}

describe('buildGoogleInteractionsStreamTransform — video deltas', () => {
  it('emits a file stream part for a video delta carrying inline data', async () => {
    const parts = await runTransform([
      {
        event_type: 'interaction.created',
        interaction: { id: 'v1_video-stream', status: 'in_progress' },
      },
      {
        event_type: 'step.start',
        index: 0,
        step: { type: 'model_output' },
      },
      {
        event_type: 'step.delta',
        index: 0,
        delta: {
          type: 'video',
          data: 'AAAAIGZ0eXBpc29t',
          mime_type: 'video/mp4',
        },
      },
      {
        event_type: 'step.stop',
        index: 0,
      },
      {
        event_type: 'interaction.completed',
        interaction: { id: 'v1_video-stream', status: 'completed' },
      },
    ] as Array<GoogleInteractionsEvent>);

    const fileParts = parts.filter(p => p.type === 'file');
    expect(fileParts).toEqual([
      expect.objectContaining({
        type: 'file',
        mediaType: 'video/mp4',
        data: { type: 'data', data: 'AAAAIGZ0eXBpc29t' },
      }),
    ]);
  });

  it('emits a file stream part for a video delta carrying a uri', async () => {
    const parts = await runTransform([
      {
        event_type: 'interaction.created',
        interaction: { id: 'v1_video-stream', status: 'in_progress' },
      },
      {
        event_type: 'step.start',
        index: 0,
        step: { type: 'model_output' },
      },
      {
        event_type: 'step.delta',
        index: 0,
        delta: { type: 'video', uri: 'https://example.test/clip.mp4' },
      },
      {
        event_type: 'step.stop',
        index: 0,
      },
      {
        event_type: 'interaction.completed',
        interaction: { id: 'v1_video-stream', status: 'completed' },
      },
    ] as Array<GoogleInteractionsEvent>);

    const fileParts = parts.filter(p => p.type === 'file');
    expect(fileParts).toEqual([
      expect.objectContaining({
        type: 'file',
        mediaType: 'video/mp4',
        data: { type: 'url', url: new URL('https://example.test/clip.mp4') },
      }),
    ]);
  });
});

describe('buildGoogleInteractionsStreamTransform — usage modality', () => {
  it('surfaces output_tokens_by_modality on the finish part providerMetadata', async () => {
    const parts = await runTransform([
      {
        event_type: 'interaction.created',
        interaction: { id: 'v1_usage', status: 'in_progress' },
      },
      {
        event_type: 'interaction.completed',
        interaction: {
          id: 'v1_usage',
          status: 'completed',
          usage: {
            total_output_tokens: 57939,
            output_tokens_by_modality: [
              { modality: 'video', tokens: 57920 },
              { modality: 'text', tokens: 19 },
            ],
          },
        },
      },
    ] as Array<GoogleInteractionsEvent>);

    const finish = parts.find(p => p.type === 'finish');
    expect(finish?.providerMetadata?.google?.outputTokensByModality).toEqual({
      video: 57920,
      text: 19,
    });
  });
});

describe('buildGoogleInteractionsStreamTransform — agentic video', () => {
  it('emits processing steps as custom parts', async () => {
    const parts = await runTransform([
      {
        event_type: 'interaction.created',
        interaction: { id: 'interaction-1', status: 'in_progress' },
      },
      {
        event_type: 'step.start',
        index: 0,
        step: {
          type: 'processing_call',
          id: 'processing-1',
          signature: 'call-signature',
        },
      },
      { event_type: 'step.stop', index: 0 },
      {
        event_type: 'step.start',
        index: 1,
        step: {
          type: 'processing_result',
          call_id: 'processing-1',
          signature: 'result-signature',
        },
      },
      { event_type: 'step.stop', index: 1 },
      {
        event_type: 'interaction.completed',
        interaction: { id: 'interaction-1', status: 'completed' },
      },
    ]);

    expect(parts).toEqual(
      expect.arrayContaining([
        {
          type: 'custom',
          kind: 'google.processing_call',
          providerMetadata: {
            google: {
              signature: 'call-signature',
              interactionId: 'interaction-1',
              processingId: 'processing-1',
            },
          },
        },
        {
          type: 'custom',
          kind: 'google.processing_result',
          providerMetadata: {
            google: {
              signature: 'result-signature',
              interactionId: 'interaction-1',
              processingCallId: 'processing-1',
            },
          },
        },
      ]),
    );
  });
});

describe('buildGoogleInteractionsStreamTransform — tool call IDs', () => {
  it('uses the generated block ID when a function call ID is empty', async () => {
    const parts = await runTransform([
      {
        event_type: 'interaction.created',
        interaction: { id: 'interaction-1', status: 'in_progress' },
      },
      {
        event_type: 'step.start',
        index: 0,
        step: {
          type: 'function_call',
          id: '',
          name: 'get_weather',
          arguments: {},
        },
      },
      {
        event_type: 'step.delta',
        index: 0,
        delta: {
          type: 'arguments_delta',
          id: '',
          arguments: '{}',
        },
      },
      { event_type: 'step.stop', index: 0 },
      {
        event_type: 'interaction.completed',
        interaction: { id: 'interaction-1', status: 'completed' },
      },
    ] as Array<GoogleInteractionsEvent>);

    expect(parts.filter(part => part.type.startsWith('tool-'))).toEqual([
      {
        type: 'tool-input-start',
        id: 'interaction-1:0',
        toolName: 'get_weather',
      },
      {
        type: 'tool-input-delta',
        id: 'interaction-1:0',
        delta: '{}',
      },
      { type: 'tool-input-end', id: 'interaction-1:0' },
      {
        type: 'tool-call',
        toolCallId: 'interaction-1:0',
        toolName: 'get_weather',
        input: '{}',
        providerMetadata: {
          google: { interactionId: 'interaction-1' },
        },
      },
    ]);
  });

  it('preserves generated block IDs when built-in tool deltas contain empty IDs', async () => {
    const parts = await runTransform([
      {
        event_type: 'interaction.created',
        interaction: { id: 'interaction-1', status: 'in_progress' },
      },
      {
        event_type: 'step.start',
        index: 0,
        step: {
          type: 'google_search_call',
          id: '',
          arguments: {},
        },
      },
      {
        event_type: 'step.delta',
        index: 0,
        delta: {
          type: 'google_search_call',
          id: '',
          arguments: { queries: ['weather'] },
        },
      },
      { event_type: 'step.stop', index: 0 },
      {
        event_type: 'step.start',
        index: 1,
        step: {
          type: 'google_search_result',
          call_id: '',
          result: null,
        },
      },
      {
        event_type: 'step.delta',
        index: 1,
        delta: {
          type: 'google_search_result',
          call_id: '',
          result: [],
        },
      },
      { event_type: 'step.stop', index: 1 },
      {
        event_type: 'interaction.completed',
        interaction: { id: 'interaction-1', status: 'completed' },
      },
    ] as Array<GoogleInteractionsEvent>);

    expect(parts.filter(part => part.type.startsWith('tool-'))).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'interaction-1:0',
        toolName: 'google_search',
        input: '{"queries":["weather"]}',
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'interaction-1:1',
        toolName: 'google_search',
        result: [],
      },
    ]);
  });
});

describe('buildGoogleInteractionsStreamTransform — errors', () => {
  it('preserves the event type, code, and raw error event', async () => {
    const error = {
      code: '429',
      message: 'Rate limit reached',
    };
    const event: GoogleInteractionsEvent = {
      event_type: 'error',
      event_id: 'event-error',
      error,
    };

    const parts = await runTransform([event]);
    const errorPart = parts.find(part => part.type === 'error');

    expect(errorPart).toBeDefined();
    expect(isProviderStreamError(errorPart!.error)).toBe(true);
    expect(errorPart!.error).toMatchObject({
      message: error.message,
      type: event.event_type,
      code: error.code,
      data: event,
    });
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'error' },
    });
  });
});
