import { describe, expect, it } from 'vitest';
import { parseXaiRealtimeServerEvent } from './xai-realtime-event-mapper';

describe('parseXaiRealtimeServerEvent usage', () => {
  it('reads top-level response.done usage even when nested usage is empty', () => {
    const event = parseXaiRealtimeServerEvent({
      type: 'response.done',
      response: { id: 'response', status: 'completed', usage: {} },
      usage: {
        input_tokens: 4,
        output_tokens: 37,
        input_token_details: { text_tokens: 4, audio_tokens: 0 },
        output_token_details: { text_tokens: 1, audio_tokens: 36 },
      },
    });
    expect(event.type === 'response-done' && event.usage).toEqual({
      inputTokens: 4,
      outputTokens: 37,
      inputTextTokens: 4,
      inputAudioTokens: 0,
      outputTextTokens: 1,
      outputAudioTokens: 36,
    });
  });

  it('retains duration usage on transcription completions', () => {
    const event = parseXaiRealtimeServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item',
      transcript: 'hello',
      usage: { type: 'duration', seconds: 2 },
    });
    expect(
      event.type === 'input-transcription-completed' && event.usage,
    ).toEqual({ seconds: 2 });
  });

  it('retains gross totals without inventing modality splits', () => {
    const event = parseXaiRealtimeServerEvent({
      type: 'response.done',
      response: {
        id: 'response',
        usage: {
          input_tokens: 10,
          output_tokens: 0,
          input_token_details: { cached_tokens: 4, image_tokens: 10 },
        },
      },
    });
    expect(event.type === 'response-done' && event.usage).toEqual({
      inputTokens: 10,
      outputTokens: 0,
      cachedInputTokens: 4,
    });
  });

  it('extracts gross input/output and separate cached tokens from response.done', () => {
    const event = parseXaiRealtimeServerEvent({
      type: 'response.done',
      response: {
        id: 'resp_1',
        status: 'completed',
        usage: {
          input_token_details: {
            audio_tokens: 80,
            text_tokens: 20,
            cached_tokens_details: { audio_tokens: 16, text_tokens: 4 },
          },
          output_token_details: { audio_tokens: 120, text_tokens: 6 },
        },
      },
    });

    expect(event).toMatchObject({
      type: 'response-done',
      responseId: 'resp_1',
    });
    expect(event.type === 'response-done' && event.usage)
      .toMatchInlineSnapshot(`
      {
        "cachedInputAudioTokens": 16,
        "cachedInputTextTokens": 4,
        "inputAudioTokens": 80,
        "inputTextTokens": 20,
        "outputAudioTokens": 120,
        "outputTextTokens": 6,
      }
    `);
  });

  it('omits usage when response.done carries none', () => {
    const event = parseXaiRealtimeServerEvent({
      type: 'response.done',
      response: { id: 'resp_1', status: 'completed' },
    });
    expect(event.type === 'response-done' && event.usage).toBeUndefined();
  });
});
