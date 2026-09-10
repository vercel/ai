import { describe, it, expect, vi } from 'vitest';
import { ElevenLabsRealtimeModel } from './elevenlabs-realtime-model';

describe('ElevenLabsRealtimeModel', () => {
  describe('doCreateClientSecret', () => {
    it('calls signed URL endpoint with correct agent_id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          signed_url:
            'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_123&token=abc',
        }),
      });

      const model = new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        headers: () => ({ 'xi-api-key': 'test-key' }),
        fetch: mockFetch,
      });

      const result = await model.doCreateClientSecret({});

      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        'https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=agent_123',
      );
      expect(options.method).toBe('GET');
      expect(options.headers['xi-api-key']).toBe('test-key');

      expect(result.token).toBe(
        'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_123&token=abc',
      );
      expect(result.url).toBe(
        'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_123&token=abc',
      );
    });

    it('throws on missing API key', async () => {
      const model = new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        headers: () => ({}),
      });

      await expect(model.doCreateClientSecret({})).rejects.toThrow(
        'API key is required',
      );
    });

    it('throws on failed request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      const model = new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        headers: () => ({ 'xi-api-key': 'test-key' }),
        fetch: mockFetch,
      });

      await expect(model.doCreateClientSecret({})).rejects.toThrow(
        '403 Forbidden',
      );
    });
  });

  describe('getWebSocketConfig', () => {
    it('returns signed URL directly when it starts with wss://', () => {
      const model = new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        headers: () => ({ 'xi-api-key': 'test-key' }),
      });

      const config = model.getWebSocketConfig({
        token:
          'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_123&token=abc',
        url: 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_123&token=abc',
      });

      expect(config.url).toBe(
        'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_123&token=abc',
      );
      expect(config.protocols).toBeUndefined();
    });

    it('falls back to base URL with agent_id when url is not a wss:// URL', () => {
      const model = new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        headers: () => ({ 'xi-api-key': 'test-key' }),
      });

      const config = model.getWebSocketConfig({
        token: 'some-token',
        url: 'some-non-wss-url',
      });

      expect(config.url).toBe(
        'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_123',
      );
    });
  });

  describe('parseServerEvent', () => {
    it('delegates to mapper', () => {
      const model = new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        headers: () => ({ 'xi-api-key': 'test-key' }),
      });

      const raw = {
        type: 'conversation_initiation_metadata',
        conversation_initiation_metadata_event: {
          conversation_id: 'conv_456',
        },
      };
      const result = model.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'session-created',
        sessionId: 'conv_456',
        raw,
      });
    });
  });

  describe('getHealthCheckResponse', () => {
    it('returns pong for ping events', () => {
      const model = new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        headers: () => ({ 'xi-api-key': 'test-key' }),
      });

      const result = model.getHealthCheckResponse({
        type: 'ping',
        ping_event: { event_id: 42, ping_ms: 100 },
      });

      expect(result).toEqual({ type: 'pong', event_id: 42 });
    });

    it('returns null for non-ping events', () => {
      const model = new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        headers: () => ({ 'xi-api-key': 'test-key' }),
      });

      expect(model.getHealthCheckResponse({ type: 'audio' })).toBeNull();
    });
  });

  describe('serializeClientEvent', () => {
    it('delegates to mapper', () => {
      const model = new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        headers: () => ({ 'xi-api-key': 'test-key' }),
      });

      const result = model.serializeClientEvent({
        type: 'input-audio-append',
        audio: 'base64data',
      });

      expect(result).toEqual({ user_audio_chunk: 'base64data' });
    });
  });

  describe('buildSessionConfig', () => {
    it('delegates to buildElevenLabsSessionConfig', () => {
      const model = new ElevenLabsRealtimeModel('agent_123', {
        provider: 'elevenlabs.realtime',
        headers: () => ({ 'xi-api-key': 'test-key' }),
      });

      const result = model.buildSessionConfig({
        instructions: 'Be helpful',
        voice: 'voice_abc',
      });

      expect(result).toEqual({
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: { prompt: { prompt: 'Be helpful' } },
          tts: { voice_id: 'voice_abc' },
        },
      });
    });
  });
});
