import { describe, expect, it, vi } from 'vitest';
import { createElevenLabs } from '../elevenlabs-provider';
import { ElevenLabsRealtimeModel } from './elevenlabs-realtime-model';

describe('ElevenLabsRealtimeModel', () => {
  describe('doCreateClientSecret', () => {
    const createModel = (fetch: typeof globalThis.fetch) =>
      new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        baseURL: 'https://api.elevenlabs.io',
        headers: () => ({ 'xi-api-key': 'test-key' }),
        fetch,
      });

    it('requests a signed URL for the agent', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          signed_url:
            'wss://api.elevenlabs.io/v1/convai/conversation?token=test',
        }),
      });

      const result = await createModel(
        mockFetch as unknown as typeof fetch,
      ).doCreateClientSecret({});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_123',
        {
          method: 'GET',
          headers: { 'xi-api-key': 'test-key' },
        },
      );
      expect(result).toEqual({
        token: 'wss://api.elevenlabs.io/v1/convai/conversation?token=test',
        url: 'wss://api.elevenlabs.io/v1/convai/conversation?token=test',
      });
    });

    it('throws when the signed URL request fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'unauthorized',
      });

      await expect(
        createModel(mockFetch as unknown as typeof fetch).doCreateClientSecret(
          {},
        ),
      ).rejects.toThrow(
        'ElevenLabs realtime signed URL request failed: 401 unauthorized',
      );
    });

    it('throws when the response does not include a signed URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(
        createModel(mockFetch as unknown as typeof fetch).doCreateClientSecret(
          {},
        ),
      ).rejects.toThrow(
        'ElevenLabs realtime signed URL request returned no signed_url.',
      );
    });
  });

  it('uses the signed URL directly for WebSocket connections', () => {
    const model = new ElevenLabsRealtimeModel('agent_123', {
      provider: 'elevenlabs.realtime',
      baseURL: 'https://api.elevenlabs.io',
      headers: () => ({}),
    });

    expect(
      model.getWebSocketConfig({
        token: 'ignored',
        url: 'wss://api.elevenlabs.io/v1/convai/conversation?token=test',
      }),
    ).toEqual({
      url: 'wss://api.elevenlabs.io/v1/convai/conversation?token=test',
    });
  });

  it('exposes the realtime factory from the provider', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        signed_url: 'wss://api.elevenlabs.io/v1/convai/conversation?token=test',
      }),
    });
    const provider = createElevenLabs({
      apiKey: 'test-key',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const model = provider.experimental_realtime('agent_123');
    expect(model.provider).toBe('elevenlabs.realtime');
    expect(model.modelId).toBe('agent_123');

    await expect(
      provider.experimental_realtime.getToken({
        model: 'agent_123',
        sessionConfig: {
          instructions: 'Be helpful.',
        },
      }),
    ).resolves.toEqual({
      token: 'wss://api.elevenlabs.io/v1/convai/conversation?token=test',
      url: 'wss://api.elevenlabs.io/v1/convai/conversation?token=test',
    });
  });
});
