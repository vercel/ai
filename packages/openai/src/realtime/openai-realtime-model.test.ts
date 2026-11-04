import { describe, it, expect, vi } from 'vitest';
import { OpenAIRealtimeModel } from './openai-realtime-model';

describe('OpenAIRealtimeModel', () => {
  it.each([
    {
      name: 'object',
      headers: { authorization: 'Bearer test-key', omitted: undefined },
    },
    {
      name: 'promise',
      headers: Promise.resolve({
        authorization: 'Bearer test-key',
        omitted: undefined,
      }),
    },
    {
      name: 'callback',
      headers: () => ({ authorization: 'Bearer test-key', omitted: undefined }),
    },
    {
      name: 'async callback',
      headers: async () => ({
        authorization: 'Bearer test-key',
        omitted: undefined,
      }),
    },
  ])(
    'resolves $name credentials for server connections',
    async ({ headers }) => {
      const model = new OpenAIRealtimeModel('gpt-realtime', {
        provider: 'openai.realtime',
        baseURL: 'https://api.openai.com/v1',
        headers,
      });
      expect((await model.getServerWebSocketConfig()).headers).toEqual({
        authorization: 'Bearer test-key',
      });
    },
  );

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

  describe('getServerWebSocketConfig', () => {
    const model = new OpenAIRealtimeModel('gpt-realtime', {
      provider: 'openai.realtime',
      baseURL: 'https://api.openai.com/v1',
      headers: () => ({
        authorization: 'Bearer test-key',
        'x-custom': 'custom-header',
        'x-undefined': undefined,
      }),
    });

    it('builds the conversation URL and forwards defined headers', async () => {
      // Undefined header values are dropped.
      expect(await model.getServerWebSocketConfig()).toMatchInlineSnapshot(`
        {
          "headers": {
            "authorization": "Bearer test-key",
            "x-custom": "custom-header",
          },
          "url": "wss://api.openai.com/v1/realtime?model=gpt-realtime",
        }
      `);
    });

    it('builds the transcription URL (model goes in session.update)', async () => {
      expect(
        (await model.getServerWebSocketConfig({ intent: 'transcription' })).url,
      ).toMatchInlineSnapshot(
        `"wss://api.openai.com/v1/realtime?intent=transcription"`,
      );
    });

    it('rejects translation until the normalized codec supports it', async () => {
      expect(() =>
        model.getServerWebSocketConfig({ intent: 'translation' as never }),
      ).toThrow(/is not supported/);
    });

    it('uses ws:// for an http base URL (local/proxy)', async () => {
      const localModel = new OpenAIRealtimeModel('gpt-realtime', {
        provider: 'openai.realtime',
        baseURL: 'http://localhost:8787/v1',
        headers: () => ({ authorization: 'Bearer test-key' }),
      });

      expect(
        (await localModel.getServerWebSocketConfig()).url,
      ).toMatchInlineSnapshot(
        `"ws://localhost:8787/v1/realtime?model=gpt-realtime"`,
      );
    });
  });
});
