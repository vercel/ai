import { describe, expect, it } from 'vitest';
import {
  parseSpeechStreamClientFrame,
  parseSpeechStreamPart,
  serializeSpeechStreamPart,
  SPEECH_STREAM_START_FRAME_TYPE,
  SPEECH_STREAM_TEXT_DELTA_FRAME_TYPE,
  SPEECH_STREAM_TEXT_DONE_FRAME_TYPE,
} from './speech-stream-envelope';

describe('frame type constants', () => {
  it('should use the speech-stream namespace', () => {
    expect(SPEECH_STREAM_START_FRAME_TYPE).toBe('speech-stream.start');
    expect(SPEECH_STREAM_TEXT_DELTA_FRAME_TYPE).toBe(
      'speech-stream.text-delta',
    );
    expect(SPEECH_STREAM_TEXT_DONE_FRAME_TYPE).toBe('speech-stream.text-done');
  });
});

describe('parseSpeechStreamClientFrame', () => {
  it('should parse a minimal start frame', () => {
    expect(
      parseSpeechStreamClientFrame(
        JSON.stringify({ type: 'speech-stream.start' }),
      ),
    ).toEqual({ type: 'start', frame: { type: 'speech-stream.start' } });
  });

  it('should parse a full start frame', () => {
    const frame = {
      type: 'speech-stream.start',
      voice: 'v1',
      outputFormat: { type: 'audio/pcm', rate: 24000 },
      instructions: 'calm',
      speed: 1.1,
      language: 'en',
      providerOptions: { elevenlabs: { seed: 1 } },
      includeRawChunks: true,
    };
    expect(parseSpeechStreamClientFrame(JSON.stringify(frame))).toEqual({
      type: 'start',
      frame,
    });
  });

  it('should drop unknown start frame keys', () => {
    expect(
      parseSpeechStreamClientFrame(
        JSON.stringify({
          type: 'speech-stream.start',
          voice: 'v1',
          headers: { authorization: 'x' },
          outputFormat: { type: 'audio/pcm', rate: 16000, extra: true },
        }),
      ),
    ).toEqual({
      type: 'start',
      frame: {
        type: 'speech-stream.start',
        voice: 'v1',
        outputFormat: { type: 'audio/pcm', rate: 16000 },
      },
    });
  });

  it.each([
    [{ voice: 1 }, 'voice must be a string when present'],
    [{ speed: '1' }, 'speed must be a number when present'],
    [
      { includeRawChunks: 'yes' },
      'includeRawChunks must be a boolean when present',
    ],
    [
      { providerOptions: [] },
      'providerOptions must be an object of provider objects when present',
    ],
    [
      { providerOptions: { openai: null } },
      'providerOptions must be an object of provider objects when present',
    ],
    [
      { providerOptions: { openai: 'x' } },
      'providerOptions must be an object of provider objects when present',
    ],
    [
      { outputFormat: { type: '' } },
      'outputFormat must be an audio format object ({ type, rate? }) when present',
    ],
    [
      { outputFormat: { type: 'audio/pcm', rate: -1 } },
      'outputFormat must be an audio format object ({ type, rate? }) when present',
    ],
    [
      { outputFormat: 'pcm_24000' },
      'outputFormat must be an audio format object ({ type, rate? }) when present',
    ],
  ])('should reject invalid start frame %j', (fields, message) => {
    expect(
      parseSpeechStreamClientFrame(
        JSON.stringify({ type: 'speech-stream.start', ...fields }),
      ),
    ).toEqual({ type: 'invalid', message });
  });

  it('should parse text-delta and text-done frames', () => {
    expect(
      parseSpeechStreamClientFrame(
        JSON.stringify({ type: 'speech-stream.text-delta', delta: 'Hi 👋' }),
      ),
    ).toEqual({ type: 'text-delta', delta: 'Hi 👋' });
    expect(
      parseSpeechStreamClientFrame(
        JSON.stringify({ type: 'speech-stream.text-done' }),
      ),
    ).toEqual({ type: 'text-done' });
  });

  it('should parse a text-delta frame with a voice and provider options', () => {
    expect(
      parseSpeechStreamClientFrame(
        JSON.stringify({
          type: 'speech-stream.text-delta',
          delta: 'Hi ',
          voice: 'v2',
          providerOptions: { elevenlabs: { newTurn: true } },
        }),
      ),
    ).toEqual({
      type: 'text-delta',
      delta: 'Hi ',
      voice: 'v2',
      providerOptions: { elevenlabs: { newTurn: true } },
    });
  });

  it.each([
    [{ voice: 2 }, 'text-delta voice must be a string when present'],
    [
      { providerOptions: 'x' },
      'text-delta providerOptions must be an object of provider objects when present',
    ],
    [
      { providerOptions: { elevenlabs: [] } },
      'text-delta providerOptions must be an object of provider objects when present',
    ],
  ])('should reject invalid text-delta frame %j', (fields, message) => {
    expect(
      parseSpeechStreamClientFrame(
        JSON.stringify({
          type: 'speech-stream.text-delta',
          delta: 'Hi',
          ...fields,
        }),
      ),
    ).toEqual({ type: 'invalid', message });
  });

  it('should reject a text-delta frame without a string delta', () => {
    expect(
      parseSpeechStreamClientFrame(
        JSON.stringify({ type: 'speech-stream.text-delta', delta: 3 }),
      ),
    ).toEqual({
      type: 'invalid',
      message: 'text-delta frame must have a string delta',
    });
  });

  it('should classify malformed, non-object, and unknown frames', () => {
    expect(parseSpeechStreamClientFrame('{')).toEqual({
      type: 'invalid',
      message: 'malformed JSON',
    });
    expect(parseSpeechStreamClientFrame('[]')).toEqual({
      type: 'invalid',
      message: 'frame must be a JSON object',
    });
    expect(parseSpeechStreamClientFrame('{"type":1}')).toEqual({
      type: 'invalid',
      message: 'frame type must be a string',
    });
    expect(
      parseSpeechStreamClientFrame(JSON.stringify({ type: 'speech-stream.x' })),
    ).toEqual({ type: 'unknown' });
  });

  it('should reject prototype-pollution payloads', () => {
    expect(
      parseSpeechStreamClientFrame(
        '{"type":"speech-stream.start","__proto__":{"polluted":true}}',
      ),
    ).toEqual({ type: 'invalid', message: 'malformed JSON' });
  });
});

describe('serializeSpeechStreamPart / parseSpeechStreamPart', () => {
  it('should round-trip binary audio as base64', () => {
    const text = serializeSpeechStreamPart({
      type: 'audio',
      audio: new Uint8Array([1, 2, 3]),
      audioFormat: { type: 'audio/pcm', rate: 24000 },
    });
    expect(text).toBe(
      '{"type":"audio","audio":"AQID","audioFormat":{"type":"audio/pcm","rate":24000}}',
    );
    expect(parseSpeechStreamPart(text ?? '')).toEqual({
      type: 'audio',
      audio: 'AQID',
      audioFormat: { type: 'audio/pcm', rate: 24000 },
    });
  });

  it('should round-trip finish usage', () => {
    const part = {
      type: 'finish' as const,
      usage: { inputCharacters: 12 },
      providerMetadata: { gateway: { cost: '0.0005' } },
    };
    expect(
      parseSpeechStreamPart(serializeSpeechStreamPart(part) ?? ''),
    ).toEqual(part);
  });

  it('should serialize Error payloads with their message', () => {
    expect(
      serializeSpeechStreamPart({ type: 'error', error: new Error('boom') }),
    ).toBe('{"type":"error","error":{"name":"Error","message":"boom"}}');
  });

  it('should revive response-metadata timestamps', () => {
    expect(
      parseSpeechStreamPart(
        JSON.stringify({
          type: 'response-metadata',
          timestamp: '2024-01-01T00:00:00.000Z',
          modelId: 'm',
        }),
      ),
    ).toEqual({
      type: 'response-metadata',
      timestamp: new Date('2024-01-01T00:00:00.000Z'),
      modelId: 'm',
    });
  });

  it.each([
    { type: 'audio', audio: 'AQ==' },
    { type: 'audio', audio: 1, audioFormat: { type: 'audio/mpeg' } },
    { type: 'finish', usage: { inputCharacters: '1' } },
    { type: 'stream-start', warnings: [{}] },
    { type: 'stream-start', warnings: [{ type: 'unsupported' }] },
    { type: 'stream-start', warnings: [{ type: 'other', message: 1 }] },
    { type: 'stream-start', warnings: [{ type: 'deprecated', setting: 'x' }] },
    { type: 'response-metadata', timestamp: 'not a date' },
    { type: 'unknown-part' },
  ])('should drop invalid part %j', part => {
    expect(parseSpeechStreamPart(JSON.stringify(part))).toBeUndefined();
  });

  it('should keep known warnings and drop unknown warning types', () => {
    expect(
      parseSpeechStreamPart(
        JSON.stringify({
          type: 'stream-start',
          warnings: [
            { type: 'unsupported', feature: 'speed', details: 'ignored' },
            { type: 'compatibility', feature: 'format' },
            { type: 'deprecated', setting: 'old', message: 'use new' },
            { type: 'other', message: 'note' },
            { type: 'future-warning', anything: true },
          ],
        }),
      ),
    ).toEqual({
      type: 'stream-start',
      warnings: [
        { type: 'unsupported', feature: 'speed', details: 'ignored' },
        { type: 'compatibility', feature: 'format' },
        { type: 'deprecated', setting: 'old', message: 'use new' },
        { type: 'other', message: 'note' },
      ],
    });
  });

  it('should drop non-serializable payloads', () => {
    expect(
      serializeSpeechStreamPart({ type: 'raw', rawValue: BigInt(1) }),
    ).toBeUndefined();
  });
});
