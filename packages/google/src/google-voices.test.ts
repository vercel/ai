import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createGoogle } from './google-provider';

const baseURL = 'https://example.com/v1beta';
const url = `${baseURL}/voices`;
const server = createTestServer({
  [url]: {},
  [`${url}/voice_test`]: {},
  [`${url}/voice%2Ftest%3Fother%3D1`]: {},
});
const google = createGoogle({
  baseURL,
  apiKey: 'test-key',
  headers: { 'custom-provider-header': 'provider-value' },
});
const voices = google.voices();
const voice = {
  type: 'prompted',
  id: 'voice_test',
  display_name: 'Narrator',
  prompted: { input: 'A warm narrator.' },
  sample_audio: { data: 'AQID', mime_type: 'audio/wav' },
};

describe('GoogleVoices', () => {
  it('creates a prompted voice and returns its sample audio', async () => {
    server.urls[url].response = { type: 'json-value', body: voice };
    const result = await voices.create({
      store: true,
      voice: {
        type: 'prompted',
        displayName: 'Narrator',
        languageCode: 'en-US',
        regionCode: 'US',
        model: 'voice-design-model',
        prompted: { input: 'A warm narrator.' },
        sampleAudio: { data: 'AQID', mimeType: 'audio/wav' },
      },
      headers: { 'custom-request-header': 'request-value' },
    });
    expect(await server.calls[0].requestBodyJson).toEqual({
      store: true,
      voice: {
        type: 'prompted',
        display_name: 'Narrator',
        language_code: 'en-US',
        region_code: 'US',
        model: 'voice-design-model',
        prompted: { input: 'A warm narrator.' },
        sample_audio: { data: 'AQID', mime_type: 'audio/wav' },
      },
    });
    expect(server.calls[0].requestHeaders).toMatchObject({
      'x-goog-api-key': 'test-key',
      'custom-provider-header': 'provider-value',
      'custom-request-header': 'request-value',
    });
    expect(result).toMatchObject({
      id: 'voice_test',
      displayName: 'Narrator',
      sampleAudio: { data: 'AQID', mimeType: 'audio/wav' },
    });
  });

  it('creates a replicated voice with consent and source audio', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: { type: 'replicated', key: 'voicekey_test' },
    };
    const result = await voices.create({
      store: false,
      voice: {
        type: 'replicated',
        replicated: {
          consentAudio: { data: 'AQID', mimeType: 'audio/wav' },
          sourceAudio: { data: 'BAUG', mimeType: 'audio/wav' },
        },
      },
    });
    expect(await server.calls[0].requestBodyJson).toEqual({
      store: false,
      voice: {
        type: 'replicated',
        replicated: {
          consent_audio: { data: 'AQID', mime_type: 'audio/wav' },
          source_audio: { data: 'BAUG', mime_type: 'audio/wav' },
        },
      },
    });
    expect(result.key).toBe('voicekey_test');
  });

  it('rejects prompted creation without persistence', async () => {
    await expect(
      voices.create({
        store: false,
        // @ts-expect-error Prompted voices must be stored.
        voice: { type: 'prompted', prompted: { input: 'A warm narrator.' } },
      }),
    ).rejects.toThrow();
    expect(server.calls).toHaveLength(0);
  });

  it('lists voices with filters and exposes the next page token', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: { voices: [voice], next_page_token: 'next' },
    };
    const result = await voices.list({
      pageSize: 5,
      pageToken: 'previous',
      type: ['prompted', 'prebuilt'],
      languageCode: ['en-US'],
      regionCode: ['US'],
      context: ['Audiobook'],
      search: 'Narrator',
    });
    const params = new URL(server.calls[0].requestUrl).searchParams;
    expect(params.get('page_size')).toBe('5');
    expect(params.get('page_token')).toBe('previous');
    expect(params.getAll('type')).toEqual(['prompted', 'prebuilt']);
    expect(params.get('language_code')).toBe('en-US');
    expect(params.get('region_code')).toBe('US');
    expect(params.get('context')).toBe('Audiobook');
    expect(params.get('search')).toBe('Narrator');
    expect(result.nextPageToken).toBe('next');
    expect(result.voices[0].id).toBe('voice_test');
  });

  it('handles an empty voice list', async () => {
    server.urls[url].response = { type: 'json-value', body: { voices: null } };
    expect(await voices.list()).toEqual({
      voices: [],
      nextPageToken: undefined,
    });
  });

  it('gets a voice', async () => {
    server.urls[`${url}/voice_test`].response = {
      type: 'json-value',
      body: voice,
    };
    expect((await voices.get({ id: 'voice_test' })).id).toBe('voice_test');
  });

  it('encodes voice IDs as a single path segment', async () => {
    server.urls[`${url}/voice%2Ftest%3Fother%3D1`].response = {
      type: 'json-value',
      body: voice,
    };
    await voices.get({ id: 'voice/test?other=1' });
    expect(server.calls[0].requestUrl).toBe(`${url}/voice%2Ftest%3Fother%3D1`);
  });

  it.each(['', '.', '..'])('rejects invalid voice ID %j', async id => {
    await expect(voices.get({ id })).rejects.toThrow();
    await expect(voices.delete({ id })).rejects.toThrow();
    expect(server.calls).toHaveLength(0);
  });

  it('deletes a voice', async () => {
    server.urls[`${url}/voice_test`].response = {
      type: 'json-value',
      body: {},
    };
    await voices.delete({ id: 'voice_test' });
    expect(server.calls[0].requestMethod).toBe('DELETE');
  });

  it('propagates API errors', async () => {
    server.urls[`${url}/voice_test`].response = {
      type: 'error',
      status: 404,
      body: JSON.stringify({
        error: { code: 404, message: 'Voice not found', status: 'NOT_FOUND' },
      }),
    };
    await expect(voices.get({ id: 'voice_test' })).rejects.toThrow(
      'Voice not found',
    );
    await expect(voices.delete({ id: 'voice_test' })).rejects.toThrow(
      'Voice not found',
    );
  });

  it('uses custom fetch and forwards abort signals', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(voice)));
    const abortSignal = new AbortController().signal;
    await createGoogle({ apiKey: 'test-key', fetch })
      .voices()
      .get({ id: 'voice_test', abortSignal });
    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/voices/voice_test',
      expect.objectContaining({ signal: abortSignal }),
    );
  });
});
