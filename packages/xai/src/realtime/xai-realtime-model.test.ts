import { describe, it, expect, vi } from 'vitest';
import { XaiRealtimeModel } from './xai-realtime-model';

describe('XaiRealtimeModel', () => {
  it('rejects unsupported intents during serialization as well as connection setup', () => {
    const target = createModel();
    const options = { intent: 'transcription' } as const;
    expect(() =>
      target.serializeClientEvent({ type: 'response-create' }, options),
    ).toThrow(/does not support/);
    expect(() => target.buildSessionConfig({}, options)).toThrow(
      /does not support/,
    );
  });

  const createModel = (fetch?: typeof globalThis.fetch) =>
    new XaiRealtimeModel('grok-voice-latest', {
      provider: 'xai.realtime',
      baseURL: 'https://api.x.ai/v1',
      headers: () => ({ authorization: 'Bearer test-key' }),
      fetch,
    });

  describe('doCreateClientSecret', () => {
    it('includes the model as a query param on the WebSocket URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ value: 'secret', expires_at: 123 }),
      });

      const result = await createModel(
        mockFetch as unknown as typeof fetch,
      ).doCreateClientSecret({});

      // xAI selects the voice model from the `model` query param; without it
      // the model choice is silently ignored.
      expect(result.url).toBe(
        'wss://api.x.ai/v1/realtime?model=grok-voice-latest',
      );
    });
  });

  describe('getServerWebSocketConfig', () => {
    it('builds the voice URL with the model query param and forwards headers', () => {
      expect(createModel().getServerWebSocketConfig()).toMatchInlineSnapshot(`
        {
          "headers": {
            "authorization": "Bearer test-key",
          },
          "url": "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
        }
      `);
    });

    it('uses ws:// for an http base URL (local/proxy)', () => {
      const localModel = new XaiRealtimeModel('grok-voice-latest', {
        provider: 'xai.realtime',
        baseURL: 'http://localhost:8787/v1',
        headers: () => ({ authorization: 'Bearer test-key' }),
      });

      expect(localModel.getServerWebSocketConfig().url).toMatchInlineSnapshot(
        `"ws://localhost:8787/v1/realtime?model=grok-voice-latest"`,
      );
    });

    it('rejects unsupported endpoint intents', () => {
      expect(() =>
        createModel().getServerWebSocketConfig({ intent: 'transcription' }),
      ).toThrow("does not support the 'transcription' session intent");
    });
  });

  describe('serializeClientEvent', () => {
    it('drops conversation-item-truncate (unsupported over WebSocket)', () => {
      const result = createModel().serializeClientEvent({
        type: 'conversation-item-truncate',
        itemId: 'item-1',
        contentIndex: 0,
        audioEndMs: 100,
      });

      expect(result).toBeUndefined();
    });
  });
});
