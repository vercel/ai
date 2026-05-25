import { describe, expect, it, vi } from 'vitest';
import type { TranscriptionModelV4 } from '@ai-sdk/provider';
import { createGradium } from './index';

const SAMPLE_AUDIO = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
]); // tiny WAV-ish header

type Captured = { url?: string; init?: RequestInit };

type TranscribeOptions = Parameters<TranscriptionModelV4['doGenerate']>[0] & {
  model: TranscriptionModelV4;
};

async function transcribe({ model, ...options }: TranscribeOptions) {
  return model.doGenerate(options);
}

function ndjson(...messages: unknown[]): string {
  return messages.map(m => JSON.stringify(m)).join('\n') + '\n';
}

function fakeFetch(captured: Captured, response?: Response) {
  return vi.fn(async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return (
      response ??
      new Response(
        ndjson(
          { type: 'text', text: 'Hello', start_s: 0.5, stream_id: 0 },
          { type: 'end_text', stop_s: 0.9, stream_id: 0 },
          { type: 'text', text: 'world', start_s: 1.0, stream_id: 0 },
          { type: 'end_text', stop_s: 1.4, stream_id: 0 },
        ),
        {
          status: 200,
          headers: { 'content-type': 'application/x-ndjson' },
        },
      )
    );
  }) as unknown as typeof fetch;
}

describe('GradiumTranscriptionModel', () => {
  it('POSTs audio bytes to /post/speech/asr with the right Content-Type', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await transcribe({
      model: gradium.transcription('default'),
      audio: SAMPLE_AUDIO,
      mediaType: 'audio/wav',
    });

    expect(captured.url).toBe('https://api.gradium.ai/api/post/speech/asr');
    const headers = captured.init!.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['content-type']).toBe('audio/wav');
    expect(captured.init!.method).toBe('POST');
    expect(captured.init!.body).toBeInstanceOf(Uint8Array);
  });

  it('also exposes transcriptionModel(modelId) per ProviderV4', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    const model = gradium.transcriptionModel!('default');
    expect(model.specificationVersion).toBe('v4');

    await transcribe({
      model,
      audio: SAMPLE_AUDIO,
      mediaType: 'audio/wav',
    });
    expect(captured.url).toContain('/post/speech/asr');
  });

  it('joins NDJSON text segments and exposes per-segment timing', async () => {
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch({}),
    });

    const result = await transcribe({
      model: gradium.transcription('default'),
      audio: SAMPLE_AUDIO,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Hello world');
    expect(result.segments).toEqual([
      { text: 'Hello', startSecond: 0.5, endSecond: 0.9 },
      { text: 'world', startSecond: 1.0, endSecond: 1.4 },
    ]);
    expect(result.durationInSeconds).toBe(1.4);
  });

  it('passes ?model= query parameter when modelId is not "default"', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await transcribe({
      model: gradium.transcription('experimental-v2'),
      audio: SAMPLE_AUDIO,
      mediaType: 'audio/wav',
    });

    expect(captured.url).toContain('model=experimental-v2');
  });

  it('passes language hint via json_config when no raw jsonConfig is supplied', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await transcribe({
      model: gradium.transcription(),
      audio: SAMPLE_AUDIO,
      mediaType: 'audio/wav',
      providerOptions: { gradium: { language: 'en' } },
    });

    const u = new URL(captured.url!);
    expect(u.searchParams.get('json_config')).toBe('{"language":"en"}');
  });

  it('honours providerOptions.gradium.inputFormat override', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await transcribe({
      model: gradium.transcription(),
      audio: SAMPLE_AUDIO,
      mediaType: 'audio/wav',
      providerOptions: { gradium: { inputFormat: 'pcm_16000' } },
    });

    const u = new URL(captured.url!);
    expect(u.searchParams.get('input_format')).toBe('pcm_16000');
  });

  it('warns when an mp3 mediaType is provided (Gradium does not accept it)', async () => {
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch({}),
    });

    const { warnings } = await transcribe({
      model: gradium.transcription(),
      audio: SAMPLE_AUDIO,
      mediaType: 'audio/mpeg',
    });

    expect(
      warnings.some(w => w.type === 'unsupported' && w.feature === 'mediaType'),
    ).toBe(true);
  });

  it('surfaces a plain-text error from a non-2xx response', async () => {
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(
        {},
        new Response(
          'error from server Some(1008): API key is revoked or expired',
          { status: 500, headers: { 'content-type': 'text/plain' } },
        ),
      ),
    });

    await expect(
      transcribe({
        model: gradium.transcription(),
        audio: SAMPLE_AUDIO,
        mediaType: 'audio/wav',
      }),
    ).rejects.toThrow(/API key is revoked/);
  });

  it('surfaces an in-stream error message as a warning', async () => {
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(
        {},
        new Response(
          ndjson(
            { type: 'text', text: 'Partial', start_s: 0.0 },
            { type: 'end_text', stop_s: 0.4 },
            { type: 'error', message: 'pipeline crashed at frame 12' },
          ),
          {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
          },
        ),
      ),
    });

    const { text, warnings } = await transcribe({
      model: gradium.transcription(),
      audio: SAMPLE_AUDIO,
      mediaType: 'audio/wav',
    });

    expect(text).toBe('Partial');
    expect(
      warnings.some(
        w => w.type === 'other' && /pipeline crashed/.test(w.message),
      ),
    ).toBe(true);
  });

  it('accepts base64 string input and decodes to bytes', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    const base64 = Buffer.from(SAMPLE_AUDIO).toString('base64');

    await transcribe({
      model: gradium.transcription(),
      audio: base64,
      mediaType: 'audio/wav',
    });

    expect(captured.init!.body).toBeInstanceOf(Uint8Array);
    expect((captured.init!.body as Uint8Array).slice(0, 4)).toEqual(
      SAMPLE_AUDIO.slice(0, 4),
    );
  });
});
