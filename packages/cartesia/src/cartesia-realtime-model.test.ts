import { describe, expect, it, vi } from 'vitest';
import { CartesiaRealtimeModel } from './cartesia-realtime-model';

const createModel = (fetch: typeof globalThis.fetch = vi.fn()) =>
  new CartesiaRealtimeModel('ink-2', {
    provider: 'cartesia.realtime',
    baseURL: 'https://api.cartesia.ai',
    version: '2026-03-01',
    headers: () => ({
      Authorization: 'Bearer test-key',
      'Cartesia-Version': '2026-03-01',
    }),
    fetch,
    _internal: {
      currentDate: () => new Date('2026-07-08T12:00:00.000Z'),
    },
  });

describe('CartesiaRealtimeModel', () => {
  describe('doCreateClientSecret', () => {
    it('creates an Ink 2 auto-finalize client secret', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: 'access-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const model = createModel(mockFetch as unknown as typeof fetch);

      const result = await model.doCreateClientSecret({
        expiresAfterSeconds: 60,
        sessionConfig: {
          inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
          inputAudioTranscription: { language: 'en' },
          turnDetection: { type: 'server-vad' },
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cartesia.ai/access-token',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-key',
            'Cartesia-Version': '2026-03-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grants: { stt: true },
            expires_in: 60,
          }),
        },
      );
      expect(result).toEqual({
        token: 'access-token',
        url: 'wss://api.cartesia.ai/stt/turns/websocket?model=ink-2&encoding=pcm_s16le&sample_rate=16000&cartesia_version=2026-03-01',
        expiresAt: 1783512060,
      });
    });

    it('uses the manual-finalize endpoint when turn detection is disabled', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: 'access-token' }), {
          status: 200,
        }),
      );
      const model = createModel(mockFetch as unknown as typeof fetch);

      const result = await model.doCreateClientSecret({
        sessionConfig: {
          inputAudioFormat: { type: 'audio/pcmu', rate: 8000 },
          inputAudioTranscription: { language: 'en' },
          turnDetection: null,
        },
      });

      expect(result.url).toBe(
        'wss://api.cartesia.ai/stt/websocket?model=ink-2&encoding=pcm_mulaw&sample_rate=8000&cartesia_version=2026-03-01&language=en',
      );
    });

    it('rejects unsupported languages and token lifetimes', async () => {
      const model = createModel();

      await expect(
        model.doCreateClientSecret({
          sessionConfig: {
            inputAudioTranscription: { language: 'es' },
          },
        }),
      ).rejects.toThrow('currently supports English only');
      await expect(
        model.doCreateClientSecret({ expiresAfterSeconds: 3601 }),
      ).rejects.toThrow('between 1 and 3600 seconds');
    });
  });

  it('adds the access token to the WebSocket URL', () => {
    const model = createModel();

    expect(
      model.getWebSocketConfig({
        token: 'access-token',
        url: 'wss://api.cartesia.ai/stt/turns/websocket?model=ink-2',
      }),
    ).toEqual({
      url: 'wss://api.cartesia.ai/stt/turns/websocket?model=ink-2&access_token=access-token',
    });
  });

  describe('serializeClientEvent', () => {
    it('sends audio as binary and lets auto-finalize detect turns', () => {
      const model = createModel();
      model.getWebSocketConfig({
        token: 'token',
        url: 'wss://api.cartesia.ai/stt/turns/websocket?model=ink-2',
      });

      expect(
        model.serializeClientEvent({
          type: 'input-audio-append',
          audio: 'AQID',
        }),
      ).toEqual(new Uint8Array([1, 2, 3]));
      expect(
        model.serializeClientEvent({ type: 'input-audio-commit' }),
      ).toBeNull();
      expect(
        model.serializeClientEvent({
          type: 'session-update',
          config: {},
        }),
      ).toBeNull();
    });

    it('sends finalize for manual turn detection', () => {
      const model = createModel();
      model.getWebSocketConfig({
        token: 'token',
        url: 'wss://api.cartesia.ai/stt/websocket?model=ink-2',
      });

      expect(model.serializeClientEvent({ type: 'input-audio-commit' })).toBe(
        'finalize',
      );
    });
  });

  describe('parseServerEvent', () => {
    it('maps Ink 2 turn events to normalized realtime events', () => {
      const model = createModel();
      const connected = { type: 'connected', request_id: 'request-1' };
      const turnStart = { type: 'turn.start', request_id: 'request-1' };
      const turnEnd = {
        type: 'turn.end',
        request_id: 'request-1',
        transcript: 'Hello world',
      };

      expect(model.parseServerEvent(connected)).toEqual({
        type: 'session-created',
        sessionId: 'request-1',
        raw: connected,
      });
      expect(model.parseServerEvent(turnStart)).toEqual({
        type: 'speech-started',
        itemId: 'request-1:1',
        raw: turnStart,
      });
      expect(model.parseServerEvent(turnEnd)).toEqual([
        {
          type: 'speech-stopped',
          itemId: 'request-1:1',
          raw: turnEnd,
        },
        {
          type: 'input-transcription-completed',
          itemId: 'request-1:1',
          transcript: 'Hello world',
          raw: turnEnd,
        },
      ]);
    });

    it('gives each Ink 2 turn its own item id', () => {
      const model = createModel();
      const itemIds = (events: unknown[]) =>
        events.map(event =>
          [model.parseServerEvent(event)]
            .flat()
            .map(mapped => ('itemId' in mapped ? mapped.itemId : undefined)),
        );

      expect(
        itemIds([
          { type: 'connected', request_id: 'request-1' },
          { type: 'turn.start', request_id: 'request-1' },
          { type: 'turn.end', request_id: 'request-1', transcript: 'One' },
          { type: 'turn.start', request_id: 'request-1' },
          { type: 'turn.end', request_id: 'request-1', transcript: 'Two' },
        ]),
      ).toEqual([
        [undefined],
        ['request-1:1'],
        ['request-1:1', 'request-1:1'],
        ['request-1:2'],
        ['request-1:2', 'request-1:2'],
      ]);
    });

    it('keeps one item id when a turn resumes', () => {
      const model = createModel();
      const itemIds = [
        { type: 'turn.start', request_id: 'request-1' },
        { type: 'turn.eager_end', request_id: 'request-1', transcript: 'Hi' },
        { type: 'turn.resume', request_id: 'request-1' },
        { type: 'turn.end', request_id: 'request-1', transcript: 'Hi there' },
      ].flatMap(event =>
        [model.parseServerEvent(event)]
          .flat()
          .flatMap(mapped => ('itemId' in mapped ? [mapped.itemId] : [])),
      );

      expect(new Set(itemIds)).toEqual(new Set(['request-1:1']));
    });

    it('does not reuse item ids after a reconnect', () => {
      const model = createModel();
      const speechStartedId = (requestId: string) => {
        const mapped = model.parseServerEvent({
          type: 'turn.start',
          request_id: requestId,
        });
        const events = Array.isArray(mapped) ? mapped : [mapped];
        return events.find(event => event.type === 'speech-started');
      };

      model.parseServerEvent({ type: 'connected', request_id: 'request-1' });
      const first = speechStartedId('request-1');
      model.parseServerEvent({ type: 'connected', request_id: 'request-2' });
      const second = speechStartedId('request-2');

      expect(first).toMatchObject({ itemId: 'request-1:1' });
      expect(second).toMatchObject({ itemId: 'request-2:1' });
    });

    it('assembles manual transcript chunks when a flush completes', () => {
      const model = createModel();
      const first = {
        type: 'transcript',
        request_id: 'request-1',
        text: 'Hello ',
        is_final: true,
        duration: 0.5,
      };
      const second = {
        type: 'transcript',
        request_id: 'request-1',
        text: 'world',
        is_final: true,
        duration: 0.4,
      };
      const flush = { type: 'flush_done', request_id: 'request-1' };

      expect(model.parseServerEvent(first)).toEqual([
        {
          type: 'session-created',
          sessionId: 'request-1',
          raw: first,
        },
        { type: 'custom', rawType: 'transcript', raw: first },
      ]);
      model.parseServerEvent(second);
      expect(model.parseServerEvent(flush)).toEqual([
        {
          type: 'audio-committed',
          itemId: 'request-1',
          raw: flush,
        },
        {
          type: 'input-transcription-completed',
          itemId: 'request-1',
          transcript: 'Hello world',
          raw: {
            event: flush,
            transcriptEvents: [first, second],
            duration: 0.9,
          },
        },
      ]);
    });

    it('emits one custom event when a manual stream closes without text', () => {
      const model = createModel();
      const done = { type: 'done', request_id: 'request-1' };

      expect(model.parseServerEvent(done)).toEqual([
        {
          type: 'session-created',
          sessionId: 'request-1',
          raw: done,
        },
        { type: 'custom', rawType: 'done', raw: done },
      ]);
    });

    it('maps structured Cartesia errors', () => {
      const model = createModel();
      const error = {
        type: 'error',
        message: 'Invalid model',
        error_code: 'model_not_found',
        request_id: 'request-1',
      };

      expect(model.parseServerEvent(error)).toEqual([
        {
          type: 'session-created',
          sessionId: 'request-1',
          raw: error,
        },
        {
          type: 'error',
          message: 'Invalid model',
          code: 'model_not_found',
          raw: error,
        },
      ]);
    });
  });
});
