import { describe, it, expect } from 'vitest';
import {
  ElevenLabsRealtimeEventMapper,
  buildElevenLabsSessionConfig,
} from './elevenlabs-realtime-event-mapper';

describe('ElevenLabsRealtimeEventMapper', () => {
  describe('parseServerEvent', () => {
    it('maps conversation_initiation_metadata to session-created', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'conversation_initiation_metadata',
        conversation_initiation_metadata_event: {
          conversation_id: 'conv_123',
          agent_output_audio_format: 'pcm_16000',
          user_input_audio_format: 'pcm_16000',
        },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'session-created',
        sessionId: 'conv_123',
        raw,
      });
    });

    it('maps agent_response to response-created + text-delta on first message', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'agent_response',
        agent_response_event: { agent_response: 'Hello!' },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual([
        {
          type: 'response-created',
          responseId: 'elevenlabs-resp-0',
          raw,
        },
        {
          type: 'text-delta',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          delta: 'Hello!',
          raw,
        },
      ]);
    });

    it('maps audio event to response-created + audio-delta on first audio', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'audio',
        audio_event: {
          audio_base_64: 'base64audio',
          event_id: 1,
        },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual([
        {
          type: 'response-created',
          responseId: 'elevenlabs-resp-0',
          raw,
        },
        {
          type: 'audio-delta',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          delta: 'base64audio',
          raw,
        },
      ]);
    });

    it('maps subsequent audio events without response-created', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();

      mapper.parseServerEvent({
        type: 'audio',
        audio_event: { audio_base_64: 'first', event_id: 1 },
      });

      const raw = {
        type: 'audio',
        audio_event: { audio_base_64: 'second', event_id: 2 },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'audio-delta',
        responseId: 'elevenlabs-resp-0',
        itemId: 'elevenlabs-item-0',
        delta: 'second',
        raw,
      });
    });

    it('maps user_transcript to input-transcription-completed', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'user_transcript',
        user_transcription_event: { user_transcript: 'What is the weather?' },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'input-transcription-completed',
        itemId: 'elevenlabs-user-0',
        transcript: 'What is the weather?',
        raw,
      });
    });

    it('maps agent_response_correction to text-done with corrected text', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'agent_response_correction',
        agent_response_correction_event: {
          original_agent_response: 'The weather in New York is sunny and',
          corrected_agent_response: 'The weather in New York is',
        },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'text-done',
        responseId: 'elevenlabs-resp-0',
        itemId: 'elevenlabs-item-0',
        text: 'The weather in New York is',
        raw,
      });
    });

    it('maps interruption to speech-started + turn finish events', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();

      mapper.parseServerEvent({
        type: 'audio',
        audio_event: { audio_base_64: 'audio', event_id: 1 },
      });

      const raw = {
        type: 'interruption',
        interruption_event: { event_id: 1 },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual([
        { type: 'speech-started', raw },
        {
          type: 'audio-done',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          raw,
        },
        {
          type: 'response-done',
          responseId: 'elevenlabs-resp-0',
          status: 'interrupted',
          raw,
        },
      ]);
    });

    it('maps interruption without active turn to just speech-started', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'interruption',
        interruption_event: { event_id: 1 },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({ type: 'speech-started', raw });
    });

    it('maps client_tool_call to function-call events', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'client_tool_call',
        client_tool_call: {
          tool_name: 'getWeather',
          tool_call_id: 'call_abc',
          parameters: { city: 'NYC' },
        },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual([
        {
          type: 'response-created',
          responseId: 'elevenlabs-resp-0',
          raw,
        },
        {
          type: 'function-call-arguments-delta',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          callId: 'call_abc',
          delta: '{"city":"NYC"}',
          raw,
        },
        {
          type: 'function-call-arguments-done',
          responseId: 'elevenlabs-resp-0',
          itemId: 'elevenlabs-item-0',
          callId: 'call_abc',
          name: 'getWeather',
          arguments: '{"city":"NYC"}',
          raw,
        },
      ]);
    });

    it('increments turn counter after interruption', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();

      mapper.parseServerEvent({
        type: 'audio',
        audio_event: { audio_base_64: 'audio1', event_id: 1 },
      });

      mapper.parseServerEvent({
        type: 'interruption',
        interruption_event: { event_id: 1 },
      });

      const raw = {
        type: 'audio',
        audio_event: { audio_base_64: 'audio2', event_id: 2 },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual([
        {
          type: 'response-created',
          responseId: 'elevenlabs-resp-1',
          raw,
        },
        {
          type: 'audio-delta',
          responseId: 'elevenlabs-resp-1',
          itemId: 'elevenlabs-item-1',
          delta: 'audio2',
          raw,
        },
      ]);
    });

    it('maps ping to custom event', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'ping',
        ping_event: { event_id: 42, ping_ms: 120 },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'custom',
        rawType: 'ping',
        raw,
      });
    });

    it('maps vad_score to custom event', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'vad_score',
        vad_score_event: { vad_score: 0.85 },
      };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'custom',
        rawType: 'vad_score',
        raw,
      });
    });

    it('maps unrecognized event type to custom', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = { type: 'some_new_event', data: {} };
      const result = mapper.parseServerEvent(raw);

      expect(result).toEqual({
        type: 'custom',
        rawType: 'some_new_event',
        raw,
      });
    });
  });

  describe('getHealthCheckResponse', () => {
    it('returns pong for ping events', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();
      const raw = {
        type: 'ping',
        ping_event: { event_id: 42, ping_ms: 120 },
      };

      expect(mapper.getHealthCheckResponse(raw)).toEqual({
        type: 'pong',
        event_id: 42,
      });
    });

    it('returns null for non-ping events', () => {
      const mapper = new ElevenLabsRealtimeEventMapper();

      expect(
        mapper.getHealthCheckResponse({
          type: 'audio',
          audio_event: { audio_base_64: 'data' },
        }),
      ).toBeNull();
    });
  });

  describe('serializeClientEvent', () => {
    const mapper = new ElevenLabsRealtimeEventMapper();

    it('serializes session-update as conversation_initiation_client_data', () => {
      const result = mapper.serializeClientEvent({
        type: 'session-update',
        config: {
          instructions: 'Be helpful',
          voice: 'voice_123',
        },
      });

      expect(result).toEqual({
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: { prompt: { prompt: 'Be helpful' } },
          tts: { voice_id: 'voice_123' },
        },
      });
    });

    it('serializes input-audio-append as user_audio_chunk', () => {
      const result = mapper.serializeClientEvent({
        type: 'input-audio-append',
        audio: 'base64data',
      });

      expect(result).toEqual({ user_audio_chunk: 'base64data' });
    });

    it('serializes text message as user_message', () => {
      const result = mapper.serializeClientEvent({
        type: 'conversation-item-create',
        item: { type: 'text-message', role: 'user', text: 'hello' },
      });

      expect(result).toEqual({ type: 'user_message', text: 'hello' });
    });

    it('serializes function-call-output as client_tool_result', () => {
      const result = mapper.serializeClientEvent({
        type: 'conversation-item-create',
        item: {
          type: 'function-call-output',
          callId: 'call_1',
          output: '{"temp":72}',
        },
      });

      expect(result).toEqual({
        type: 'client_tool_result',
        tool_call_id: 'call_1',
        result: '{"temp":72}',
        is_error: false,
      });
    });

    it('returns null for audio-message', () => {
      expect(
        mapper.serializeClientEvent({
          type: 'conversation-item-create',
          item: { type: 'audio-message', role: 'user', audio: 'data' },
        }),
      ).toBeNull();
    });

    it('returns null for input-audio-commit', () => {
      expect(
        mapper.serializeClientEvent({ type: 'input-audio-commit' }),
      ).toBeNull();
    });

    it('returns null for input-audio-clear', () => {
      expect(
        mapper.serializeClientEvent({ type: 'input-audio-clear' }),
      ).toBeNull();
    });

    it('returns null for response-create', () => {
      expect(
        mapper.serializeClientEvent({ type: 'response-create' }),
      ).toBeNull();
    });

    it('returns null for response-cancel', () => {
      expect(
        mapper.serializeClientEvent({ type: 'response-cancel' }),
      ).toBeNull();
    });

    it('returns null for conversation-item-truncate', () => {
      expect(
        mapper.serializeClientEvent({
          type: 'conversation-item-truncate',
          itemId: 'item_1',
          contentIndex: 0,
          audioEndMs: 1000,
        }),
      ).toBeNull();
    });
  });
});

describe('buildElevenLabsSessionConfig', () => {
  it('builds minimal config with just type', () => {
    const result = buildElevenLabsSessionConfig(undefined);

    expect(result).toEqual({
      type: 'conversation_initiation_client_data',
    });
  });

  it('builds config with instructions', () => {
    const result = buildElevenLabsSessionConfig({
      instructions: 'Be a helpful assistant',
    });

    expect(result).toEqual({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: { prompt: { prompt: 'Be a helpful assistant' } },
      },
    });
  });

  it('builds config with voice', () => {
    const result = buildElevenLabsSessionConfig({
      voice: 'voice_abc',
    });

    expect(result).toEqual({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        tts: { voice_id: 'voice_abc' },
      },
    });
  });

  it('builds config with instructions and voice', () => {
    const result = buildElevenLabsSessionConfig({
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

  it('passes through providerOptions', () => {
    const result = buildElevenLabsSessionConfig({
      providerOptions: {
        dynamic_variables: { user_name: 'Alice' },
        custom_llm_extra_body: { temperature: 0.7 },
      },
    });

    expect(result).toEqual({
      type: 'conversation_initiation_client_data',
      dynamic_variables: { user_name: 'Alice' },
      custom_llm_extra_body: { temperature: 0.7 },
    });
  });

  it('deep-merges LLM override from providerOptions with instructions', () => {
    const result = buildElevenLabsSessionConfig({
      instructions: 'Be helpful',
      providerOptions: {
        conversation_config_override: {
          agent: {
            prompt: { llm: 'gpt-4o' },
          },
        },
      },
    });

    expect(result).toEqual({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: {
          prompt: { prompt: 'Be helpful', llm: 'gpt-4o' },
        },
      },
    });
  });

  it('deep-merges TTS overrides from providerOptions with voice', () => {
    const result = buildElevenLabsSessionConfig({
      voice: 'voice_abc',
      providerOptions: {
        conversation_config_override: {
          tts: { speed: 1.1 },
        },
      },
    });

    expect(result).toEqual({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        tts: { voice_id: 'voice_abc', speed: 1.1 },
      },
    });
  });

  it('builds config with empty config object', () => {
    const result = buildElevenLabsSessionConfig({});

    expect(result).toEqual({
      type: 'conversation_initiation_client_data',
    });
  });
});
