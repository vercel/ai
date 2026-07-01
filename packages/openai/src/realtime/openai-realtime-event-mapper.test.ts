import { describe, expect, it } from 'vitest';
import {
  buildOpenAISessionConfig,
  parseOpenAIRealtimeServerEvent,
  serializeOpenAIRealtimeClientEvent,
} from './openai-realtime-event-mapper';

describe('parseOpenAIRealtimeServerEvent usage', () => {
  it('extracts gross input/output and separate cached tokens from response.done', () => {
    const event = parseOpenAIRealtimeServerEvent({
      type: 'response.done',
      response: {
        id: 'resp_1',
        status: 'completed',
        usage: {
          input_token_details: {
            audio_tokens: 100,
            text_tokens: 40,
            cached_tokens_details: { audio_tokens: 30, text_tokens: 10 },
          },
          output_token_details: { audio_tokens: 200, text_tokens: 12 },
        },
      },
    });

    expect(event).toMatchObject({
      type: 'response-done',
      responseId: 'resp_1',
    });
    // Input buckets are gross (cache-inclusive); cached surfaced separately.
    expect(event.type === 'response-done' && event.usage)
      .toMatchInlineSnapshot(`
      {
        "cachedInputAudioTokens": 30,
        "cachedInputTextTokens": 10,
        "inputAudioTokens": 100,
        "inputTextTokens": 40,
        "outputAudioTokens": 200,
        "outputTextTokens": 12,
      }
    `);
  });

  it('omits usage when response.done carries none', () => {
    const event = parseOpenAIRealtimeServerEvent({
      type: 'response.done',
      response: { id: 'resp_1', status: 'completed' },
    });
    expect(event.type === 'response-done' && event.usage).toBeUndefined();
  });

  it('extracts duration usage from a transcription completion', () => {
    const event = parseOpenAIRealtimeServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item_1',
      transcript: 'hello',
      usage: { type: 'duration', seconds: 3.5 },
    });

    expect(event.type === 'input-transcription-completed' && event.usage)
      .toMatchInlineSnapshot(`
      {
        "audioSeconds": 3.5,
      }
    `);
  });

  it('extracts token usage from a transcription completion', () => {
    const event = parseOpenAIRealtimeServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item_1',
      transcript: 'hello',
      usage: {
        type: 'tokens',
        input_token_details: { audio_tokens: 50, text_tokens: 4 },
        output_tokens: 8,
      },
    });

    expect(event.type === 'input-transcription-completed' && event.usage)
      .toMatchInlineSnapshot(`
      {
        "inputAudioTokens": 50,
        "inputTextTokens": 4,
        "outputTextTokens": 8,
      }
    `);
  });
});

describe('buildOpenAISessionConfig', () => {
  it('builds a dedicated transcription session with the selected model id', () => {
    const result = buildOpenAISessionConfig(
      {
        inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
        inputAudioTranscription: {
          model: 'ignored-override',
          language: 'en',
          prompt: 'Medical vocabulary.',
        },
      },
      'gpt-realtime-whisper',
      { intent: 'transcription' },
    );

    expect(result).toEqual({
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: 24000 },
          transcription: {
            model: 'gpt-realtime-whisper',
            language: 'en',
            prompt: 'Medical vocabulary.',
          },
        },
      },
    });
  });

  it('enables input audio transcription with a default model', () => {
    const result = buildOpenAISessionConfig(
      { inputAudioTranscription: {} },
      'gpt-realtime',
    );

    expect(result.audio).toEqual({
      input: {
        transcription: {
          model: 'gpt-realtime-whisper',
        },
      },
    });
  });

  it('maps input audio transcription options', () => {
    const result = buildOpenAISessionConfig(
      {
        inputAudioTranscription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'en',
          prompt: 'Transcribe short voice chat messages.',
        },
      },
      'gpt-realtime',
    );

    expect(result.audio).toEqual({
      input: {
        transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'en',
          prompt: 'Transcribe short voice chat messages.',
        },
      },
    });
  });

  it('does not build translation sessions until the normalized codec supports them', () => {
    expect(() =>
      buildOpenAISessionConfig({}, 'gpt-realtime-translate', {
        intent: 'translation',
      }),
    ).toThrow(/translation sessions are not supported/);
  });
});

describe('serializeOpenAIRealtimeClientEvent', () => {
  it('passes the session intent through to session-update serialization', () => {
    const result = serializeOpenAIRealtimeClientEvent(
      { type: 'session-update', config: {} },
      'gpt-realtime-whisper',
      { intent: 'transcription' },
    );

    expect(result).toEqual({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            transcription: { model: 'gpt-realtime-whisper' },
          },
        },
      },
    });
  });
});
