import { describe, expect, it } from 'vitest';
import { parseXaiRealtimeServerEvent } from './xai-realtime-event-mapper';

describe('parseXaiRealtimeServerEvent usage', () => {
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
    expect(event.type === 'response-done' && event.usage).toEqual({
      inputAudioTokens: 80,
      inputTextTokens: 20,
      outputAudioTokens: 120,
      outputTextTokens: 6,
      cachedInputAudioTokens: 16,
      cachedInputTextTokens: 4,
    });
  });

  it('omits usage when response.done carries none', () => {
    const event = parseXaiRealtimeServerEvent({
      type: 'response.done',
      response: { id: 'resp_1', status: 'completed' },
    });
    expect(event.type === 'response-done' && event.usage).toBeUndefined();
  });
});
