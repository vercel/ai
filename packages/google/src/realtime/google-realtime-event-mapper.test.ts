import { describe, it, expect } from 'vitest';
import {
  GoogleRealtimeEventMapper,
  buildGoogleSessionConfig,
} from './google-realtime-event-mapper';

describe('GoogleRealtimeEventMapper', () => {
  describe('parseServerEvent', () => {
    it('maps setupComplete to session-created', () => {
      const mapper = new GoogleRealtimeEventMapper();
      const raw = { setupComplete: true };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'session-created',
        raw,
      });
    });

    it('maps serverContent with audio to audio-delta', () => {
      const mapper = new GoogleRealtimeEventMapper();
      const raw = {
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { data: 'base64audio' } }],
          },
        },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'audio-delta',
        responseId: 'google-resp-0',
        itemId: 'google-item-0',
        delta: 'base64audio',
        raw,
      });
    });

    it('maps serverContent with text to text-delta', () => {
      const mapper = new GoogleRealtimeEventMapper();
      const raw = {
        serverContent: {
          modelTurn: {
            parts: [{ text: 'hello world' }],
          },
        },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'text-delta',
        responseId: 'google-resp-0',
        itemId: 'google-item-0',
        delta: 'hello world',
        raw,
      });
    });

    it('maps serverContent with outputTranscription to audio-transcript-delta', () => {
      const mapper = new GoogleRealtimeEventMapper();
      const raw = {
        serverContent: {
          outputTranscription: { text: 'transcribed text' },
        },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'audio-transcript-delta',
        responseId: 'google-resp-0',
        itemId: 'google-item-0',
        delta: 'transcribed text',
        raw,
      });
    });

    it('maps serverContent with interrupted to speech-started', () => {
      const mapper = new GoogleRealtimeEventMapper();
      const raw = {
        serverContent: { interrupted: true },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'speech-started',
        raw,
      });
    });

    it('maps serverContent with turnComplete after audio to done events + response-done', () => {
      const mapper = new GoogleRealtimeEventMapper();

      mapper.parseServerEvent({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { data: 'audio' } }],
          },
        },
      });

      const raw = { serverContent: { turnComplete: true } };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual([
        {
          type: 'audio-done',
          responseId: 'google-resp-0',
          itemId: 'google-item-0',
          raw,
        },
        {
          type: 'response-done',
          responseId: 'google-resp-0',
          status: 'completed',
          raw,
        },
      ]);
    });

    it('maps serverContent with turnComplete after text to done events + response-done', () => {
      const mapper = new GoogleRealtimeEventMapper();

      mapper.parseServerEvent({
        serverContent: {
          modelTurn: {
            parts: [{ text: 'hello' }],
          },
        },
      });

      const raw = { serverContent: { turnComplete: true } };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual([
        {
          type: 'text-done',
          responseId: 'google-resp-0',
          itemId: 'google-item-0',
          raw,
        },
        {
          type: 'response-done',
          responseId: 'google-resp-0',
          status: 'completed',
          raw,
        },
      ]);
    });

    it('increments IDs after turnComplete', () => {
      const mapper = new GoogleRealtimeEventMapper();

      mapper.parseServerEvent({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { data: 'audio1' } }],
          },
        },
      });

      mapper.parseServerEvent({
        serverContent: { turnComplete: true },
      });

      const raw = {
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { data: 'audio2' } }],
          },
        },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'audio-delta',
        responseId: 'google-resp-1',
        itemId: 'google-item-1',
        delta: 'audio2',
        raw,
      });
    });

    it('maps multi-part serverContent to multiple events', () => {
      const mapper = new GoogleRealtimeEventMapper();
      const raw = {
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { data: 'audio' } }, { text: 'text' }],
          },
        },
      };
      const result = mapper.parseServerEvent(raw);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([
        {
          type: 'audio-delta',
          responseId: 'google-resp-0',
          itemId: 'google-item-0',
          delta: 'audio',
          raw,
        },
        {
          type: 'text-delta',
          responseId: 'google-resp-0',
          itemId: 'google-item-0',
          delta: 'text',
          raw,
        },
      ]);
    });

    it('maps toolCall to function-call-arguments-delta and done events', () => {
      const mapper = new GoogleRealtimeEventMapper();
      const raw = {
        toolCall: {
          functionCalls: [
            { id: 'call_1', name: 'getWeather', args: { city: 'NYC' } },
            { id: 'call_2', name: 'rollDice', args: {} },
          ],
        },
      };
      const result = mapper.parseServerEvent(raw);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([
        {
          type: 'function-call-arguments-delta',
          responseId: 'google-resp-0',
          itemId: 'google-item-0',
          callId: 'call_1',
          delta: '{"city":"NYC"}',
          raw,
        },
        {
          type: 'function-call-arguments-done',
          responseId: 'google-resp-0',
          itemId: 'google-item-0',
          callId: 'call_1',
          name: 'getWeather',
          arguments: '{"city":"NYC"}',
          raw,
        },
        {
          type: 'function-call-arguments-delta',
          responseId: 'google-resp-0',
          itemId: 'google-item-0',
          callId: 'call_2',
          delta: '{}',
          raw,
        },
        {
          type: 'function-call-arguments-done',
          responseId: 'google-resp-0',
          itemId: 'google-item-0',
          callId: 'call_2',
          name: 'rollDice',
          arguments: '{}',
          raw,
        },
      ]);
    });

    it('maps toolCallCancellation to custom event', () => {
      const mapper = new GoogleRealtimeEventMapper();
      const raw = { toolCallCancellation: { ids: ['call_1'] } };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'custom',
        rawType: 'toolCallCancellation',
        raw,
      });
    });

    it('maps unrecognized top-level key to custom event', () => {
      const mapper = new GoogleRealtimeEventMapper();
      const raw = { somethingNew: { data: 123 } };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'custom',
        rawType: 'somethingNew',
        raw,
      });
    });
  });

  describe('serializeClientEvent', () => {
    const mapper = new GoogleRealtimeEventMapper();

    it('serializes session-update as setup message', () => {
      const result = mapper.serializeClientEvent(
        { type: 'session-update', config: {} },
        'gemini-2.0-flash-live-001',
      );

      expect(result).toEqual({
        setup: { model: 'models/gemini-2.0-flash-live-001' },
      });
    });

    it('serializes input-audio-append as realtimeInput', () => {
      const result = mapper.serializeClientEvent(
        { type: 'input-audio-append', audio: 'base64data' },
        'model',
      );

      expect(result).toEqual({
        realtimeInput: {
          audio: {
            data: 'base64data',
            mimeType: 'audio/pcm;rate=16000',
          },
        },
      });
    });

    it('returns null for input-audio-commit', () => {
      expect(
        mapper.serializeClientEvent({ type: 'input-audio-commit' }, 'model'),
      ).toBeNull();
    });

    it('returns null for input-audio-clear', () => {
      expect(
        mapper.serializeClientEvent({ type: 'input-audio-clear' }, 'model'),
      ).toBeNull();
    });

    it('returns null for response-create', () => {
      expect(
        mapper.serializeClientEvent({ type: 'response-create' }, 'model'),
      ).toBeNull();
    });

    it('returns null for response-cancel', () => {
      expect(
        mapper.serializeClientEvent({ type: 'response-cancel' }, 'model'),
      ).toBeNull();
    });

    it('serializes text message as realtimeInput', () => {
      const result = mapper.serializeClientEvent(
        {
          type: 'conversation-item-create',
          item: { type: 'text-message', role: 'user', text: 'hello' },
        },
        'model',
      );

      expect(result).toEqual({
        realtimeInput: {
          text: 'hello',
        },
      });
    });

    it('serializes function-call-output as toolResponse', () => {
      const result = mapper.serializeClientEvent(
        {
          type: 'conversation-item-create',
          item: {
            type: 'function-call-output',
            callId: 'call_1',
            name: 'getWeather',
            output: '{"temp":72}',
          },
        },
        'model',
      );

      expect(result).toEqual({
        toolResponse: {
          functionResponses: [
            {
              id: 'call_1',
              name: 'getWeather',
              response: { temp: 72 },
            },
          ],
        },
      });
    });

    it('returns null for conversation-item-truncate', () => {
      expect(
        mapper.serializeClientEvent(
          {
            type: 'conversation-item-truncate',
            itemId: 'item_1',
            contentIndex: 0,
            audioEndMs: 1000,
          },
          'model',
        ),
      ).toBeNull();
    });
  });
});

describe('buildGoogleSessionConfig', () => {
  it('builds config with model path', () => {
    const result = buildGoogleSessionConfig(undefined, 'gemini-2.0-flash');

    expect(result).toMatchInlineSnapshot(`
      {
        "generationConfig": {
          "responseModalities": [
            "AUDIO",
          ],
        },
        "model": "models/gemini-2.0-flash",
      }
    `);
  });

  it('builds config with instructions and voice', () => {
    const result = buildGoogleSessionConfig(
      {
        instructions: 'Be helpful',
        voice: 'Puck',
      },
      'gemini-2.0-flash',
    );

    expect(result).toMatchInlineSnapshot(`
      {
        "generationConfig": {
          "responseModalities": [
            "AUDIO",
          ],
          "speechConfig": {
            "voiceConfig": {
              "prebuiltVoiceConfig": {
                "voiceName": "Puck",
              },
            },
          },
        },
        "model": "models/gemini-2.0-flash",
        "systemInstruction": {
          "parts": [
            {
              "text": "Be helpful",
            },
          ],
        },
      }
    `);
  });

  it('builds config with tools', () => {
    const result = buildGoogleSessionConfig(
      {
        tools: [
          {
            type: 'function',
            name: 'getWeather',
            description: 'Get weather',
            parameters: {
              type: 'object',
              properties: {
                city: { type: 'string' },
              },
              required: ['city'],
            },
          },
        ],
      },
      'gemini-2.0-flash',
    );

    expect(result.tools).toMatchInlineSnapshot(`
      [
        {
          "functionDeclarations": [
            {
              "description": "Get weather",
              "name": "getWeather",
              "parameters": {
                "properties": {
                  "city": {
                    "type": "string",
                  },
                },
                "required": [
                  "city",
                ],
                "type": "object",
              },
            },
          ],
        },
      ]
    `);
  });

  it('maps output modalities to uppercase', () => {
    const result = buildGoogleSessionConfig(
      { outputModalities: ['audio', 'text'] },
      'model',
    );

    expect(
      (result.generationConfig as Record<string, unknown>).responseModalities,
    ).toEqual(['AUDIO', 'TEXT']);
  });

  it('preserves model path that already includes slash', () => {
    const result = buildGoogleSessionConfig(
      undefined,
      'models/gemini-2.0-flash',
    );
    expect(result.model).toBe('models/gemini-2.0-flash');
  });
});
