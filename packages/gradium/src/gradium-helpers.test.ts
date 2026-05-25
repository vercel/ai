import { describe, expect, it, vi } from 'vitest';
import { createGradium } from './index';

type Captured = { url?: string; init?: RequestInit };

const voice = {
  uid: 'voice_123',
  name: 'Demo Voice',
  is_catalog: false,
  is_pro_clone: false,
  tags: [],
};

const dictionary = {
  uid: 'dict_123',
  org_uid: 'org_123',
  name: 'Brand names',
  language: 'en',
  rules: [{ original: 'Gradium', rewrite: 'Grad-ium' }],
  created_at: '2026-01-01T00:00:00Z',
};

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function fakeFetch(captured: Captured, response: Response) {
  return vi.fn(async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return response;
  }) as unknown as typeof fetch;
}

describe('Gradium helper APIs', () => {
  it('lists voices with catalog and pagination query parameters', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured, jsonResponse([voice])),
    });

    const result = await gradium.voices.list({
      skip: 10,
      limit: 20,
      includeCatalog: true,
    });

    expect(result).toEqual([voice]);
    expect(captured.url).toBe(
      'https://api.gradium.ai/api/voices/?skip=10&limit=20&include_catalog=true',
    );
    expect(
      (captured.init!.headers as Record<string, string>)['x-api-key'],
    ).toBe('test-key');
  });

  it('creates voices with multipart form data', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured, jsonResponse(voice)),
    });

    await gradium.voices.create({
      name: 'Demo Voice',
      audioFile: new Uint8Array([1, 2, 3]),
      audioFileName: 'sample.wav',
      audioContentType: 'audio/wav',
      inputFormat: 'wav',
      language: 'en',
      description: 'Friendly demo voice',
      startSeconds: 1,
      timeoutSeconds: 8,
    });

    const body = captured.init!.body as FormData;
    expect(captured.url).toBe('https://api.gradium.ai/api/voices/');
    expect(captured.init!.method).toBe('POST');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('name')).toBe('Demo Voice');
    expect(body.get('input_format')).toBe('wav');
    expect(body.get('language')).toBe('en');
    expect(body.get('description')).toBe('Friendly demo voice');
    expect(body.get('start_s')).toBe('1');
    expect(body.get('timeout_s')).toBe('8');
    expect(
      (captured.init!.headers as Record<string, string>)['content-type'],
    ).toBe(undefined);
  });

  it('updates and deletes voices against encoded IDs', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(voice))
      .mockResolvedValueOnce(
        new Response(null, { status: 204 }),
      ) as unknown as typeof fetch;
    const gradium = createGradium({ apiKey: 'test-key', fetch: fetchSpy });

    await gradium.voices.update('voice/123', { name: 'Updated' });
    await gradium.voices.delete('voice/123');

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://api.gradium.ai/api/voices/voice%2F123',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://api.gradium.ai/api/voices/voice%2F123',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('manages pronunciation dictionaries', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ dictionaries: [dictionary], total: 1 }),
      )
      .mockResolvedValueOnce(jsonResponse(dictionary))
      .mockResolvedValueOnce(jsonResponse(dictionary))
      .mockResolvedValueOnce(jsonResponse(dictionary))
      .mockResolvedValueOnce(
        new Response(null, { status: 204 }),
      ) as unknown as typeof fetch;
    const gradium = createGradium({ apiKey: 'test-key', fetch: fetchSpy });

    const list = await gradium.pronunciations.list({
      limit: 5,
      offset: 10,
      language: 'en',
    });
    await gradium.pronunciations.get('dict/123');
    await gradium.pronunciations.create({
      name: 'Brand names',
      language: 'en',
      rules: [{ original: 'Gradium', rewrite: 'Grad-ium' }],
    });
    await gradium.pronunciations.update('dict/123', { description: 'Updated' });
    await gradium.pronunciations.delete('dict/123');

    expect(list.total).toBe(1);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://api.gradium.ai/api/pronunciations/?limit=5&offset=10&language=en',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://api.gradium.ai/api/pronunciations/dict%2F123',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      'https://api.gradium.ai/api/pronunciations/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Brand names',
          language: 'en',
          rules: [{ original: 'Gradium', rewrite: 'Grad-ium' }],
        }),
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      4,
      'https://api.gradium.ai/api/pronunciations/dict%2F123',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      5,
      'https://api.gradium.ai/api/pronunciations/dict%2F123',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('gets credits and surfaces helper API errors', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          remaining_credits: 42,
          allocated_credits: 100,
          billing_period: 'monthly',
          plan_name: 'Team',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'forbidden' } }, { status: 403 }),
      ) as unknown as typeof fetch;
    const gradium = createGradium({ apiKey: 'test-key', fetch: fetchSpy });

    await expect(gradium.credits.get()).resolves.toMatchObject({
      remaining_credits: 42,
    });
    await expect(gradium.voices.list()).rejects.toThrow(/forbidden/);
  });
});
