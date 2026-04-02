import { describe, it, expect, vi } from 'vitest';
import { GoogleRealtimeModel } from './google-realtime-model';

describe('GoogleRealtimeModel', () => {
  describe('doCreateClientSecret', () => {
    it('calls auth_tokens endpoint with correct payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'projects/123/locations/us/accessTokens/abc',
          expireTime: '2026-01-01T00:05:00.000Z',
        }),
      });

      const model = new GoogleRealtimeModel('gemini-2.0-flash-live-001', {
        provider: 'google.realtime',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: () => ({ 'x-goog-api-key': 'test-key' }),
        fetch: mockFetch,
      });

      const result = await model.doCreateClientSecret({
        sessionConfig: {
          instructions: 'Be helpful',
          voice: 'Puck',
        },
      });

      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=test-key',
      );
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.uses).toBe(0);
      expect(body.expireTime).toBeDefined();
      expect(body.bidiGenerateContentSetup.model).toBe(
        'models/gemini-2.0-flash-live-001',
      );
      expect(body.bidiGenerateContentSetup.systemInstruction).toEqual({
        parts: [{ text: 'Be helpful' }],
      });
      expect(
        body.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig
          .prebuiltVoiceConfig.voiceName,
      ).toBe('Puck');

      expect(result.token).toBe('projects/123/locations/us/accessTokens/abc');
      expect(result.url).toContain('generativelanguage.googleapis.com');
    });

    it('throws on missing API key', async () => {
      const model = new GoogleRealtimeModel('gemini-2.0-flash-live-001', {
        provider: 'google.realtime',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
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

      const model = new GoogleRealtimeModel('gemini-2.0-flash-live-001', {
        provider: 'google.realtime',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: () => ({ 'x-goog-api-key': 'test-key' }),
        fetch: mockFetch,
      });

      await expect(model.doCreateClientSecret({})).rejects.toThrow(
        '403 Forbidden',
      );
    });
  });

  describe('getWebSocketConfig', () => {
    it('returns URL with access_token query param', () => {
      const model = new GoogleRealtimeModel('gemini-2.0-flash-live-001', {
        provider: 'google.realtime',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: () => ({ 'x-goog-api-key': 'test-key' }),
      });

      const config = model.getWebSocketConfig({
        token: 'my-token',
        url: 'wss://example.com/ws',
      });

      expect(config.url).toBe('wss://example.com/ws?access_token=my-token');
      expect(config.protocols).toBeUndefined();
    });
  });

  describe('parseServerEvent', () => {
    it('delegates to mapper', () => {
      const model = new GoogleRealtimeModel('gemini-2.0-flash-live-001', {
        provider: 'google.realtime',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: () => ({ 'x-goog-api-key': 'test-key' }),
      });

      const result = model.parseServerEvent({ setupComplete: true });
      expect(result).toEqual({
        type: 'session-created',
        raw: { setupComplete: true },
      });
    });
  });

  describe('serializeClientEvent', () => {
    it('delegates to mapper', () => {
      const model = new GoogleRealtimeModel('gemini-2.0-flash-live-001', {
        provider: 'google.realtime',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: () => ({ 'x-goog-api-key': 'test-key' }),
      });

      const result = model.serializeClientEvent({
        type: 'input-audio-append',
        audio: 'base64',
      });
      expect(result).toEqual({
        realtimeInput: {
          audio: { data: 'base64', mimeType: 'audio/pcm;rate=16000' },
        },
      });
    });
  });
});
