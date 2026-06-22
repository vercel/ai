import { describe, expect, it } from 'vitest';
import {
  ElevenLabsRealtimeEventMapper,
  buildElevenLabsSessionConfig,
} from './elevenlabs-realtime-event-mapper';

describe('ElevenLabsRealtimeEventMapper', () => {
  describe('parseServerEvent', () => {
    it('maps conversation metadata to session-created', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'conversation_initiation_metadata',
        conversation_initiation_metadata_event: {
          conversation_id: 'conv_123',
        },
      };

      expect(mapper.parseServerEvent(raw)).toEqual({
        type: 'session-created',
        sessionId: 'conv_123',
        raw,
      });
    });

    it('maps user transcript to input-transcription-completed', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'user_transcript',
        user_transcription_event: {
          user_transcript: 'hello there',
        },
      };

      expect(mapper.parseServerEvent(raw)).toEqual({
        type: 'input-transcription-completed',
        itemId: 'elevenlabs-input-0',
        transcript: 'hello there',
        raw,
      });
    });

    it('maps agent text to response-created + text-delta', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'agent_response',
        agent_response_event: {
          agent_response: 'Hello there.',
        },
      };

      expect(mapper.parseServerEvent(raw)).toEqual([
        {
          type: 'response-created',
          responseId: 'elevenlabs-resp-0',
          raw,
        },
        {
          type: 'text-delta',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          delta: 'Hello there.',
          raw,
        },
      ]);
    });

    it('keeps audio on the same synthetic turn as text', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      mapper.parseServerEvent({
        type: 'agent_response',
        agent_response_event: {
          agent_response: 'Hello there.',
        },
      });
      const raw = {
        type: 'audio',
        audio_event: {
          audio_base_64: 'base64audio',
        },
      };

      expect(mapper.parseServerEvent(raw)).toEqual({
        type: 'audio-delta',
        responseId: 'elevenlabs-resp-0',
        itemId: 'elevenlabs-item-0',
        delta: 'base64audio',
        raw,
      });
    });

    it('maps tool calls to function argument events', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'client_tool_call',
        client_tool_call: {
          tool_name: 'check_account_status',
          tool_call_id: 'tool_123',
          parameters: { user_id: 'user_123' },
        },
      };

      expect(mapper.parseServerEvent(raw)).toEqual([
        {
          type: 'response-created',
          responseId: 'elevenlabs-resp-0',
          raw,
        },
        {
          type: 'function-call-arguments-delta',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          callId: 'tool_123',
          delta: '{"user_id":"user_123"}',
          raw,
        },
        {
          type: 'function-call-arguments-done',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          callId: 'tool_123',
          name: 'check_account_status',
          arguments: '{"user_id":"user_123"}',
          raw,
        },
      ]);
    });

    it('maps response completion to done events', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      mapper.parseServerEvent({
        type: 'agent_response',
        agent_response_event: {
          agent_response: 'Hello',
        },
      });
      mapper.parseServerEvent({
        type: 'audio',
        audio_event: {
          audio_base_64: 'base64audio',
        },
      });
      const raw = { type: 'agent_response_complete' };

      expect(mapper.parseServerEvent(raw)).toEqual([
        {
          type: 'audio-done',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          raw,
        },
        {
          type: 'text-done',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          text: 'Hello',
          raw,
        },
        {
          type: 'response-done',
          responseId: 'elevenlabs-resp-0',
          status: 'completed',
          raw,
        },
      ]);
    });

    it('maps interruption to speech-started and cancels the active turn', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      mapper.parseServerEvent({
        type: 'agent_response',
        agent_response_event: {
          agent_response: 'Hello',
        },
      });
      const raw = { type: 'interruption' };

      expect(mapper.parseServerEvent(raw)).toEqual([
        {
          type: 'speech-started',
          raw,
        },
        {
          type: 'text-done',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          text: 'Hello',
          raw,
        },
        {
          type: 'response-done',
          responseId: 'elevenlabs-resp-0',
          status: 'cancelled',
          raw,
        },
      ]);
    });

    it('rolls over synthetic IDs after completion', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      mapper.parseServerEvent({
        type: 'agent_response',
        agent_response_event: { agent_response: 'First' },
      });
      mapper.parseServerEvent({ type: 'agent_response_complete' });
      const raw = {
        type: 'agent_response',
        agent_response_event: { agent_response: 'Second' },
      };

      expect(mapper.parseServerEvent(raw)).toEqual([
        {
          type: 'response-created',
          responseId: 'elevenlabs-resp-1',
          raw,
        },
        {
          type: 'text-delta',
          responseId: 'elevenlabs-resp-1',
          itemId: 'elevenlabs-item-1',
          delta: 'Second',
          raw,
        },
      ]);
    });

    it('returns custom events for unsupported provider messages', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'vad_score',
        vad_score_event: { vad_score: 0.95 },
      };

      expect(mapper.parseServerEvent(raw)).toEqual({
        type: 'custom',
        rawType: 'vad_score',
        raw,
      });
    });
  });

  describe('getHealthCheckResponse', () => {
    it('responds to provider ping events', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();

      expect(
        mapper.getHealthCheckResponse({
          type: 'ping',
          ping_event: { event_id: 12345 },
        }),
      ).toEqual({
        type: 'pong',
        event_id: 12345,
      });
    });
  });

  describe('serializeClientEvent', () => {
    it('serializes text messages', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();

      expect(
        mapper.serializeClientEvent({
          type: 'conversation-item-create',
          item: {
            type: 'text-message',
            role: 'user',
            text: 'Hello',
          },
        }),
      ).toEqual({
        type: 'user_message',
        text: 'Hello',
      });
    });

    it('serializes audio chunks', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();

      expect(
        mapper.serializeClientEvent({
          type: 'input-audio-append',
          audio: 'base64audio',
        }),
      ).toEqual({
        user_audio_chunk: 'base64audio',
      });
    });

    it('drops explicit response control events', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();

      expect(
        mapper.serializeClientEvent({
          type: 'response-create',
        }),
      ).toBeNull();
    });

    it('serializes tool outputs as strings', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();

      expect(
        mapper.serializeClientEvent({
          type: 'conversation-item-create',
          item: {
            type: 'function-call-output',
            callId: 'tool_123',
            name: 'check_account_status',
            output: '{"active":true}',
          },
        }),
      ).toEqual({
        type: 'client_tool_result',
        tool_call_id: 'tool_123',
        result: '{"active":true}',
        is_error: false,
      });
    });
  });

  describe('buildElevenLabsSessionConfig', () => {
    it('maps instructions and voice to conversation overrides', () => {
      expect(
        buildElevenLabsSessionConfig({
          instructions: 'Be helpful.',
          voice: 'voice_123',
        }),
      ).toEqual({
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: {
            prompt: {
              prompt: 'Be helpful.',
            },
          },
          tts: {
            voice_id: 'voice_123',
          },
        },
      });
    });

    it('maps ElevenLabs provider options', () => {
      expect(
        buildElevenLabsSessionConfig({
          providerOptions: {
            elevenlabs: {
              conversationConfigOverride: {
                agent: {
                  language: 'en',
                },
              },
              customLlmExtraBody: {
                temperature: 0.7,
              },
              dynamicVariables: {
                user_name: 'John',
              },
            },
          },
        }),
      ).toEqual({
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: {
            language: 'en',
          },
        },
        custom_llm_extra_body: {
          temperature: 0.7,
        },
        dynamic_variables: {
          user_name: 'John',
        },
      });
    });

    it('merges provider overrides with normalized instructions and voice', () => {
      expect(
        buildElevenLabsSessionConfig({
          instructions: 'Be helpful.',
          voice: 'voice_123',
          providerOptions: {
            elevenlabs: {
              conversationConfigOverride: {
                agent: {
                  language: 'en',
                },
                tts: {
                  speed: 1.2,
                },
              },
            },
          },
        }),
      ).toEqual({
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: {
            prompt: {
              prompt: 'Be helpful.',
            },
            language: 'en',
          },
          tts: {
            voice_id: 'voice_123',
            speed: 1.2,
          },
        },
      });
    });

    it('returns null when no supported session config is supplied', () => {
      expect(buildElevenLabsSessionConfig({})).toBeNull();
    });
  });
});
