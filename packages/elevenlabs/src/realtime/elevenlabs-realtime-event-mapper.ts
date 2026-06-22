import type {
  Experimental_RealtimeModelV4 as RealtimeModelV4,
  Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  Experimental_RealtimeModelV4FunctionCallOutput as RealtimeModelV4FunctionCallOutput,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
  Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import type { ElevenLabsRealtimeModelOptions } from './elevenlabs-realtime-model-options';

type ElevenLabsRealtimeWireEvent = {
  type?: string;
  conversation_initiation_metadata_event?: {
    conversation_id?: string;
  };
  user_transcription_event?: {
    user_transcript?: string;
  };
  agent_response_event?: {
    agent_response?: string;
  };
  audio_event?: {
    audio_base_64?: string;
  };
  ping_event?: {
    event_id?: string | number;
  };
  client_tool_call?: {
    tool_name?: string;
    tool_call_id?: string;
    parameters?: unknown;
  };
  error?: {
    message?: string;
    code?: string | number;
  };
  message?: string;
  code?: string | number;
};

type ElevenLabsRealtimeTurn = {
  responseId: string;
  itemId: string;
  hasAudio: boolean;
  hasText: boolean;
  started: boolean;
  text: string;
};

/**
 * Stateful event mapper for ElevenAgents WebSockets.
 *
 * ElevenLabs does not expose response or item IDs on agent events, so the
 * mapper generates stable synthetic IDs for each agent turn. The optional
 * `agent_response_complete` event closes a turn immediately; default agents
 * fall back to closing it when the next turn begins.
 */
export class ElevenLabsRealtimeEventMapper {
  private turnCounter = 0;
  private inputCounter = 0;
  private activeTurn: ElevenLabsRealtimeTurn | undefined;

  parseServerEvent(
    raw: unknown,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    const event = raw as ElevenLabsRealtimeWireEvent;

    switch (event.type) {
      case 'conversation_initiation_metadata':
        return {
          type: 'session-created',
          sessionId:
            event.conversation_initiation_metadata_event?.conversation_id,
          raw,
        };

      case 'user_transcript': {
        const events = this.closeTurn(raw, 'completed');
        events.push({
          type: 'input-transcription-completed',
          itemId: `elevenlabs-input-${this.inputCounter++}`,
          transcript: event.user_transcription_event?.user_transcript ?? '',
          raw,
        });
        return events.length === 1 ? events[0] : events;
      }

      case 'agent_response': {
        const events = this.closeTurn(raw, 'completed');
        const turn = this.beginTurn();
        events.push(...this.beginTurnEvents(turn, raw));
        const delta = event.agent_response_event?.agent_response ?? '';
        turn.hasText = true;
        turn.text += delta;
        events.push({
          type: 'text-delta',
          responseId: turn.responseId,
          itemId: turn.itemId,
          delta,
          raw,
        });
        return events.length === 1 ? events[0] : events;
      }

      case 'audio': {
        const turn = this.beginTurn();
        const events = this.beginTurnEvents(turn, raw);
        const delta = event.audio_event?.audio_base_64 ?? '';
        turn.hasAudio = true;
        events.push({
          type: 'audio-delta',
          responseId: turn.responseId,
          itemId: turn.itemId,
          delta,
          raw,
        });
        return events.length === 1 ? events[0] : events;
      }

      case 'client_tool_call': {
        const turn = this.beginTurn();
        const events = this.beginTurnEvents(turn, raw);
        const callId =
          event.client_tool_call?.tool_call_id ??
          `elevenlabs-tool-${this.turnCounter}`;
        const name = event.client_tool_call?.tool_name ?? 'unknown';
        const args = JSON.stringify(event.client_tool_call?.parameters ?? {});
        events.push(
          {
            type: 'function-call-arguments-delta',
            responseId: turn.responseId,
            itemId: turn.itemId,
            callId,
            delta: args,
            raw,
          },
          {
            type: 'function-call-arguments-done',
            responseId: turn.responseId,
            itemId: turn.itemId,
            callId,
            name,
            arguments: args,
            raw,
          },
        );
        return events;
      }

      case 'agent_response_complete':
        return this.closeTurn(raw, 'completed');

      case 'interruption': {
        const events: RealtimeModelV4ServerEvent[] = [
          {
            type: 'speech-started',
            raw,
          },
        ];
        events.push(...this.closeTurn(raw, 'cancelled'));
        return events.length === 1 ? events[0] : events;
      }

      case 'error':
        return {
          type: 'error',
          message:
            event.error?.message ?? event.message ?? 'Unknown ElevenLabs error',
          ...(event.error?.code != null || event.code != null
            ? { code: String(event.error?.code ?? event.code) }
            : {}),
          raw,
        };

      default:
        return {
          type: 'custom',
          rawType: event.type ?? 'unknown',
          raw,
        };
    }
  }

  getHealthCheckResponse(raw: unknown): unknown | null {
    const event = raw as ElevenLabsRealtimeWireEvent;
    if (event.type !== 'ping') return null;

    return {
      type: 'pong',
      ...(event.ping_event?.event_id != null
        ? { event_id: event.ping_event.event_id }
        : {}),
    };
  }

  serializeClientEvent(
    event: RealtimeModelV4ClientEvent,
  ): ReturnType<RealtimeModelV4['serializeClientEvent']> {
    switch (event.type) {
      case 'session-update':
        return buildElevenLabsSessionConfig(event.config);

      case 'input-audio-append':
        return { user_audio_chunk: event.audio };

      case 'input-audio-commit':
      case 'input-audio-clear':
      case 'response-create':
      case 'response-cancel':
      case 'conversation-item-truncate':
        return null;

      case 'conversation-item-create': {
        const item = event.item;
        switch (item.type) {
          case 'text-message':
            return {
              type: 'user_message',
              text: item.text,
            };

          case 'audio-message':
            return { user_audio_chunk: item.audio };

          case 'function-call-output':
            return serializeFunctionCallOutput(item);
        }
        break;
      }
    }

    return null;
  }

  private beginTurn(): ElevenLabsRealtimeTurn {
    if (this.activeTurn != null) return this.activeTurn;

    const turn = {
      responseId: `elevenlabs-resp-${this.turnCounter}`,
      itemId: `elevenlabs-item-${this.turnCounter}`,
      hasAudio: false,
      hasText: false,
      started: false,
      text: '',
    };
    this.activeTurn = turn;
    return turn;
  }

  private beginTurnEvents(
    turn: ElevenLabsRealtimeTurn,
    raw: unknown,
  ): RealtimeModelV4ServerEvent[] {
    if (turn.started) return [];
    turn.started = true;
    return [
      {
        type: 'response-created',
        responseId: turn.responseId,
        raw,
      },
    ];
  }

  private closeTurn(
    raw: unknown,
    status: string,
  ): RealtimeModelV4ServerEvent[] {
    const turn = this.activeTurn;
    if (turn == null) return [];

    const events: RealtimeModelV4ServerEvent[] = [];

    if (turn.hasAudio) {
      events.push({
        type: 'audio-done',
        responseId: turn.responseId,
        itemId: turn.itemId,
        raw,
      });
    }

    if (turn.hasText) {
      events.push({
        type: 'text-done',
        responseId: turn.responseId,
        itemId: turn.itemId,
        text: turn.text,
        raw,
      });
    }

    events.push({
      type: 'response-done',
      responseId: turn.responseId,
      status,
      raw,
    });

    this.turnCounter++;
    this.activeTurn = undefined;
    return events;
  }
}

function serializeFunctionCallOutput(
  item: RealtimeModelV4FunctionCallOutput,
): unknown {
  return {
    type: 'client_tool_result',
    tool_call_id: item.callId,
    result: item.output,
    is_error: false,
  };
}

export function buildElevenLabsSessionConfig(
  config: RealtimeModelV4SessionConfig,
): Record<string, unknown> | null {
  const conversationConfigOverride: Record<string, unknown> = {};
  const agentOverride: Record<string, unknown> = {};
  const ttsOverride: Record<string, unknown> = {};

  if (config.instructions != null) {
    agentOverride.prompt = { prompt: config.instructions };
  }

  if (config.voice != null) {
    ttsOverride.voice_id = config.voice;
  }

  if (Object.keys(agentOverride).length > 0) {
    conversationConfigOverride.agent = agentOverride;
  }

  if (Object.keys(ttsOverride).length > 0) {
    conversationConfigOverride.tts = ttsOverride;
  }

  const payload: Record<string, unknown> = {
    type: 'conversation_initiation_client_data',
  };

  if (Object.keys(conversationConfigOverride).length > 0) {
    payload.conversation_config_override = conversationConfigOverride;
  }

  const elevenLabsOptions = config.providerOptions?.elevenlabs;
  if (isRecord(elevenLabsOptions)) {
    const options = elevenLabsOptions as ElevenLabsRealtimeModelOptions;

    if (options.conversationConfigOverride != null) {
      payload.conversation_config_override = mergeConversationOverrides(
        isRecord(payload.conversation_config_override)
          ? payload.conversation_config_override
          : {},
        options.conversationConfigOverride,
      );
    }

    if (options.customLlmExtraBody != null) {
      payload.custom_llm_extra_body = options.customLlmExtraBody;
    }

    if (options.dynamicVariables != null) {
      payload.dynamic_variables = options.dynamicVariables;
    }
  }

  return Object.keys(payload).length === 1 ? null : payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function mergeConversationOverrides(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };

  for (const [key, value] of Object.entries(override)) {
    result[key] =
      isRecord(result[key]) && isRecord(value)
        ? { ...result[key], ...value }
        : value;
  }

  return result;
}
