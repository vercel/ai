import { describe, expect, it } from 'vitest';
import {
  buildOpenAISessionConfig,
  parseOpenAIRealtimeServerEvent,
  serializeOpenAIRealtimeClientEvent,
} from './openai-realtime-event-mapper';

describe('serializeOpenAIRealtimeClientEvent', () => {
  it.each(['client-event', '', undefined])(
    'preserves session-update eventId %j on the wire',
    eventId => {
      expect(
        serializeOpenAIRealtimeClientEvent(
          {
            type: 'session-update',
            config: { instructions: 'Be concise.' },
            eventId,
          },
          'gpt-realtime',
        ),
      ).toStrictEqual({
        type: 'session.update',
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          instructions: 'Be concise.',
        },
        ...(eventId != null ? { event_id: eventId } : {}),
      });
    },
  );

  it.each(['client-event', '', undefined])(
    'preserves input-audio-append eventId %j on the wire',
    eventId => {
      expect(
        serializeOpenAIRealtimeClientEvent(
          { type: 'input-audio-append', audio: 'AA==', eventId },
          'gpt-realtime',
        ),
      ).toStrictEqual({
        type: 'input_audio_buffer.append',
        audio: 'AA==',
        ...(eventId != null ? { event_id: eventId } : {}),
      });
    },
  );
});

describe('parseOpenAIRealtimeServerEvent', () => {
  it.each(['client-event', '', null, undefined])(
    'normalizes nested error.event_id %j as clientEventId',
    eventId => {
      const raw = {
        type: 'error',
        event_id: 'server-event',
        error: {
          message: 'Invalid audio',
          code: 'invalid_audio',
          ...(eventId !== undefined ? { event_id: eventId } : {}),
          client_event_id: 'live-client-event',
        },
      };
      expect(parseOpenAIRealtimeServerEvent(raw)).toStrictEqual({
        type: 'error',
        message: 'Invalid audio',
        code: 'invalid_audio',
        clientEventId: eventId ?? undefined,
        raw,
      });
    },
  );

  it.each([undefined, null, {}, { message: null, code: null, event_id: null }])(
    'handles missing or null optional error fields (%j)',
    error => {
      const raw = {
        type: 'error',
        event_id: 'server-event',
        ...(error !== undefined ? { error } : {}),
      };
      expect(parseOpenAIRealtimeServerEvent(raw)).toStrictEqual({
        type: 'error',
        message: 'Unknown error',
        code: undefined,
        clientEventId: undefined,
        raw,
      });
    },
  );

  it('preserves top-level message and code fallbacks', () => {
    const raw = {
      type: 'error',
      message: 'Invalid request',
      code: 'invalid_request',
      error: { message: null, code: null },
    };
    expect(parseOpenAIRealtimeServerEvent(raw)).toStrictEqual({
      type: 'error',
      message: 'Invalid request',
      code: 'invalid_request',
      clientEventId: undefined,
      raw,
    });
  });
});

describe('buildOpenAISessionConfig', () => {
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
});
