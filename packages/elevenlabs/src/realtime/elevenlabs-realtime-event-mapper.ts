import {
  Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
  Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';

/**
 * Stateful event mapper for ElevenLabs Conversational AI WebSocket API.
 *
 * ElevenLabs events don't carry response/item IDs and there is no explicit
 * "turn complete" signal. This class tracks turn state to generate
 * consistent synthetic IDs and emits response-done when a new turn starts
 * or an interruption occurs.
 */
export class ElevenLabsRealtimeEventMapper {
  private turnCounter = 0;
  private hasAudio = false;
  private hasText = false;
  private turnStarted = false;

  private get responseId(): string {
    return `elevenlabs-resp-${this.turnCounter}`;
  }

  private get itemId(): string {
    return `elevenlabs-item-${this.turnCounter}`;
  }

  private finishTurn(
    raw: unknown,
    status: string,
  ): RealtimeModelV4ServerEvent[] {
    const events: RealtimeModelV4ServerEvent[] = [];

    if (this.hasAudio) {
      events.push({
        type: 'audio-done',
        responseId: this.responseId,
        itemId: this.itemId,
        raw,
      });
    }
    if (this.hasText) {
      events.push({
        type: 'text-done',
        responseId: this.responseId,
        itemId: this.itemId,
        raw,
      });
    }
    events.push({
      type: 'response-done',
      responseId: this.responseId,
      status,
      raw,
    });

    this.turnCounter++;
    this.hasAudio = false;
    this.hasText = false;
    this.turnStarted = false;

    return events;
  }

  private ensureTurnStarted(raw: unknown): RealtimeModelV4ServerEvent[] {
    if (this.turnStarted) {
      return [];
    }
    this.turnStarted = true;
    return [
      {
        type: 'response-created',
        responseId: this.responseId,
        raw,
      },
    ];
  }

  parseServerEvent(
    raw: unknown,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    const data = raw as Record<string, any>;
    const type = data.type as string | undefined;

    switch (type) {
      case 'conversation_initiation_metadata': {
        const meta = data.conversation_initiation_metadata_event;
        return {
          type: 'session-created',
          sessionId: meta?.conversation_id,
          raw,
        };
      }

      case 'agent_response': {
        const events: RealtimeModelV4ServerEvent[] = [];

        if (this.turnStarted && !this.hasAudio && !this.hasText) {
          // Previous turn had response-created but no content yet — this
          // is the first content event, no need to close a prior turn.
        } else if (!this.turnStarted) {
          // Brand new turn
        } else if (this.turnStarted) {
          // New agent_response while a turn is active means the previous
          // turn ended and a new one is starting.
          events.push(...this.finishTurn(raw, 'completed'));
        }

        events.push(...this.ensureTurnStarted(raw));

        const text = data.agent_response_event?.agent_response;
        if (text != null) {
          this.hasText = true;
          events.push({
            type: 'text-delta',
            responseId: this.responseId,
            itemId: this.itemId,
            delta: text,
            raw,
          });
        }

        return events.length === 1 ? events[0] : events;
      }

      case 'audio': {
        const events: RealtimeModelV4ServerEvent[] = [];
        events.push(...this.ensureTurnStarted(raw));

        const audioBase64 = data.audio_event?.audio_base_64;
        if (audioBase64 != null) {
          this.hasAudio = true;
          events.push({
            type: 'audio-delta',
            responseId: this.responseId,
            itemId: this.itemId,
            delta: audioBase64,
            raw,
          });
        }

        return events.length === 1 ? events[0] : events;
      }

      case 'user_transcript': {
        const transcript = data.user_transcription_event?.user_transcript ?? '';
        return {
          type: 'input-transcription-completed',
          itemId: `elevenlabs-user-${this.turnCounter}`,
          transcript,
          raw,
        };
      }

      case 'agent_response_correction': {
        const correctionEvent = data.agent_response_correction_event;
        const correctedText = correctionEvent?.corrected_agent_response ?? '';

        return {
          type: 'text-done',
          responseId: this.responseId,
          itemId: this.itemId,
          text: correctedText,
          raw,
        };
      }

      case 'interruption': {
        const events: RealtimeModelV4ServerEvent[] = [];

        events.push({ type: 'speech-started', raw });

        if (this.turnStarted) {
          events.push(...this.finishTurn(raw, 'interrupted'));
        }

        return events.length === 1 ? events[0] : events;
      }

      case 'client_tool_call': {
        const toolCall = data.client_tool_call;
        if (toolCall == null) {
          return { type: 'unknown', rawType: 'client_tool_call', raw };
        }

        const args = JSON.stringify(toolCall.parameters ?? {});
        const callId = toolCall.tool_call_id ?? '';
        const name = toolCall.tool_name ?? '';

        const events: RealtimeModelV4ServerEvent[] = [];
        events.push(...this.ensureTurnStarted(raw));

        events.push(
          {
            type: 'function-call-arguments-delta',
            responseId: this.responseId,
            itemId: this.itemId,
            callId,
            delta: args,
            raw,
          },
          {
            type: 'function-call-arguments-done',
            responseId: this.responseId,
            itemId: this.itemId,
            callId,
            name,
            arguments: args,
            raw,
          },
        );

        return events;
      }

      case 'ping':
      case 'vad_score':
      case 'internal_tentative_agent_response':
        return { type: 'unknown', rawType: type, raw };

      default:
        return {
          type: 'unknown',
          rawType: type ?? String(Object.keys(data)[0]),
          raw,
        };
    }
  }

  /**
   * Returns a pong response for ping events, or null for everything else.
   * Called by the session layer to auto-respond to keepalive pings.
   */
  getAutoResponse(raw: unknown): unknown | null {
    const data = raw as Record<string, any>;
    if (data.type === 'ping') {
      return {
        type: 'pong',
        event_id: data.ping_event?.event_id,
      };
    }
    return null;
  }

  serializeClientEvent(event: RealtimeModelV4ClientEvent): unknown {
    switch (event.type) {
      case 'session-update':
        return buildElevenLabsSessionConfig(event.config);

      case 'input-audio-append':
        return { user_audio_chunk: event.audio };

      case 'conversation-item-create': {
        const item = event.item;
        switch (item.type) {
          case 'text-message':
            return { type: 'user_message', text: item.text };
          case 'function-call-output':
            return {
              type: 'client_tool_result',
              tool_call_id: item.callId,
              result: item.output,
              is_error: false,
            };
          case 'audio-message':
            return null;
        }
        break;
      }

      case 'input-audio-commit':
      case 'input-audio-clear':
      case 'conversation-item-truncate':
      case 'response-create':
      case 'response-cancel':
        return null;
    }

    return null;
  }
}

/**
 * Builds an ElevenLabs-specific session configuration from a normalized
 * config. Produces a `conversation_initiation_client_data` message to be
 * sent as the first message after WebSocket connection.
 *
 * Provider options are merged into the result. The `conversation_config_override`
 * from providerOptions is deep-merged with overrides derived from normalized
 * fields (instructions, voice).
 */
export function buildElevenLabsSessionConfig(
  config: RealtimeModelV4SessionConfig | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: 'conversation_initiation_client_data',
  };

  if (config == null) {
    return result;
  }

  const prompt: Record<string, unknown> = {};
  const tts: Record<string, unknown> = {};

  if (config.instructions != null) {
    prompt.prompt = config.instructions;
  }

  if (config.voice != null) {
    tts.voice_id = config.voice;
  }

  const override: Record<string, unknown> = {};
  if (Object.keys(prompt).length > 0) {
    override.agent = { prompt };
  }
  if (Object.keys(tts).length > 0) {
    override.tts = tts;
  }

  if (config.providerOptions != null) {
    const { conversation_config_override: extraOverride, ...rest } =
      config.providerOptions as Record<string, any>;

    if (extraOverride != null) {
      // Deep-merge agent and tts from providerOptions
      if (extraOverride.agent != null) {
        const existingAgent = (override.agent ?? {}) as Record<string, any>;
        const existingPrompt = (existingAgent.prompt ?? {}) as Record<
          string,
          unknown
        >;
        const extraAgent = extraOverride.agent as Record<string, any>;
        const extraPrompt = (extraAgent.prompt ?? {}) as Record<
          string,
          unknown
        >;

        override.agent = {
          ...existingAgent,
          ...extraAgent,
          prompt: { ...existingPrompt, ...extraPrompt },
        };
      }
      if (extraOverride.tts != null) {
        override.tts = {
          ...((override.tts ?? {}) as Record<string, unknown>),
          ...(extraOverride.tts as Record<string, unknown>),
        };
      }
      // Pass through any other override fields (e.g. conversation)
      const { agent: _a, tts: _t, ...otherOverrides } = extraOverride;
      Object.assign(override, otherOverrides);
    }

    Object.assign(result, rest);
  }

  if (Object.keys(override).length > 0) {
    result.conversation_config_override = override;
  }

  return result;
}
