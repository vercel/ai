import { describe, it, expect, vi } from 'vitest';
import { OpenAIRealtimeModel } from './openai-realtime-model';

describe('OpenAIRealtimeModel', () => {
  describe('doCreateClientSecret', () => {
    const createModel = (fetch: typeof globalThis.fetch) =>
      new OpenAIRealtimeModel('gpt-realtime', {
        provider: 'openai.realtime',
        baseURL: 'https://api.openai.com/v1',
        headers: () => ({ authorization: 'Bearer test-key' }),
        fetch,
      });

    it('omits expires_after when no ttl is requested', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ value: 'secret', expires_at: 123 }),
      });

      await createModel(
        mockFetch as unknown as typeof fetch,
      ).doCreateClientSecret({});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.expires_after).toBeUndefined();
    });

    it('includes the required anchor with expires_after', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ value: 'secret', expires_at: 123 }),
      });

      await createModel(
        mockFetch as unknown as typeof fetch,
      ).doCreateClientSecret({ expiresAfterSeconds: 60 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // The client secrets endpoint 400s without `anchor`.
      expect(body.expires_after).toEqual({
        anchor: 'created_at',
        seconds: 60,
      });
    });
  });

  describe('getServerConnection', () => {
    const model = new OpenAIRealtimeModel('gpt-realtime', {
      provider: 'openai.realtime',
      baseURL: 'https://api.openai.com/v1',
      headers: () => ({
        authorization: 'Bearer test-key',
        'OpenAI-Beta': 'realtime=v1',
        'x-undefined': undefined,
      }),
    });

    it('builds the conversation URL and forwards defined headers', () => {
      // Undefined header values are dropped.
      expect(model.getServerConnection()).toMatchInlineSnapshot(`
        {
          "headers": {
            "OpenAI-Beta": "realtime=v1",
            "authorization": "Bearer test-key",
          },
          "url": "wss://api.openai.com/v1/realtime?model=gpt-realtime",
        }
      `);
    });

    it('builds the transcription URL (model goes in session.update)', () => {
      expect(
        model.getServerConnection({ intent: 'transcription' }).url,
      ).toMatchInlineSnapshot(
        `"wss://api.openai.com/v1/realtime?intent=transcription"`,
      );
    });

    it('rejects translation until the normalized codec supports it', () => {
      expect(() =>
        model.getServerConnection({ intent: 'translation' }),
      ).toThrow(/translation sessions are not supported/);
    });

    it('uses ws:// for an http base URL (local/proxy)', () => {
      const localModel = new OpenAIRealtimeModel('gpt-realtime', {
        provider: 'openai.realtime',
        baseURL: 'http://localhost:8787/v1',
        headers: () => ({ authorization: 'Bearer test-key' }),
      });

      expect(localModel.getServerConnection().url).toMatchInlineSnapshot(
        `"ws://localhost:8787/v1/realtime?model=gpt-realtime"`,
      );
    });
  });
});
