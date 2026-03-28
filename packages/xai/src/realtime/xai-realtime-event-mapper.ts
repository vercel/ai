import {
  RealtimeModelV4ClientEvent,
  RealtimeModelV4ServerEvent,
  RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';

/**
 * Parses a raw xAI Voice Agent API server event into a normalized event.
 *
 * xAI's realtime event names are largely compatible with OpenAI's,
 * but differ in audio format fields, session config shape, MCP events,
 * and the absence of some OpenAI-specific events.
 */
export function parseXaiRealtimeServerEvent(
  raw: unknown,
): RealtimeModelV4ServerEvent {
  const event = raw as Record<string, any>;
  const type = event.type as string;

  switch (type) {
    // ── Session lifecycle ──────────────────────────────────────────
    case 'session.created':
      return {
        type: 'session-created',
        sessionId: event.session?.id,
        raw,
      };

    case 'session.updated':
      return { type: 'session-updated', raw };

    // ── Conversation created ──────────────────────────────────────
    case 'conversation.created':
      return { type: 'unknown', rawType: type, raw };

    // ── Input audio buffer ─────────────────────────────────────────
    case 'input_audio_buffer.speech_started':
      return {
        type: 'speech-started',
        itemId: event.item_id,
        raw,
      };

    case 'input_audio_buffer.speech_stopped':
      return {
        type: 'speech-stopped',
        itemId: event.item_id,
        raw,
      };

    case 'input_audio_buffer.committed':
      return {
        type: 'audio-committed',
        itemId: event.item_id,
        previousItemId: event.previous_item_id,
        raw,
      };

    // ── Conversation items ─────────────────────────────────────────
    case 'conversation.item.added':
      return {
        type: 'conversation-item-added',
        itemId: event.item?.id ?? event.item_id,
        item: event.item,
        raw,
      };

    case 'conversation.item.input_audio_transcription.completed':
      return {
        type: 'input-transcription-completed',
        itemId: event.item_id,
        transcript: event.transcript ?? '',
        raw,
      };

    // ── Response lifecycle ──────────────────────────────────────────
    case 'response.created':
      return {
        type: 'response-created',
        responseId: event.response?.id ?? event.response_id,
        raw,
      };

    case 'response.done':
      return {
        type: 'response-done',
        responseId: event.response?.id ?? event.response_id,
        status: event.response?.status ?? 'completed',
        raw,
      };

    // ── Output item lifecycle ───────────────────────────────────────
    case 'response.output_item.added':
      return {
        type: 'output-item-added',
        responseId: event.response_id,
        itemId: event.item?.id ?? event.item_id,
        raw,
      };

    case 'response.output_item.done':
      return {
        type: 'output-item-done',
        responseId: event.response_id,
        itemId: event.item?.id ?? event.item_id,
        raw,
      };

    case 'response.content_part.added':
      return {
        type: 'content-part-added',
        responseId: event.response_id,
        itemId: event.item_id,
        raw,
      };

    case 'response.content_part.done':
      return {
        type: 'content-part-done',
        responseId: event.response_id,
        itemId: event.item_id,
        raw,
      };

    // ── Audio output ────────────────────────────────────────────────
    case 'response.output_audio.delta':
      return {
        type: 'audio-delta',
        responseId: event.response_id,
        itemId: event.item_id,
        delta: event.delta,
        raw,
      };

    case 'response.output_audio.done':
      return {
        type: 'audio-done',
        responseId: event.response_id,
        itemId: event.item_id,
        raw,
      };

    // ── Audio transcript output ─────────────────────────────────────
    case 'response.output_audio_transcript.delta':
      return {
        type: 'audio-transcript-delta',
        responseId: event.response_id,
        itemId: event.item_id,
        delta: event.delta,
        raw,
      };

    case 'response.output_audio_transcript.done':
      return {
        type: 'audio-transcript-done',
        responseId: event.response_id,
        itemId: event.item_id,
        transcript: event.transcript,
        raw,
      };

    // ── Text output ─────────────────────────────────────────────────
    case 'response.text.delta':
      return {
        type: 'text-delta',
        responseId: event.response_id,
        itemId: event.item_id,
        delta: event.delta,
        raw,
      };

    case 'response.text.done':
      return {
        type: 'text-done',
        responseId: event.response_id,
        itemId: event.item_id,
        text: event.text,
        raw,
      };

    // ── Function calling ────────────────────────────────────────────
    case 'response.function_call_arguments.delta':
      return {
        type: 'function-call-arguments-delta',
        responseId: event.response_id,
        itemId: event.item_id,
        callId: event.call_id,
        delta: event.delta,
        raw,
      };

    case 'response.function_call_arguments.done':
      return {
        type: 'function-call-arguments-done',
        responseId: event.response_id,
        itemId: event.item_id,
        callId: event.call_id,
        name: event.name,
        arguments: event.arguments,
        raw,
      };

    // ── MCP events (xAI-specific, pass through as unknown) ─────────
    case 'mcp_list_tools.in_progress':
    case 'mcp_list_tools.completed':
    case 'mcp_list_tools.failed':
    case 'response.mcp_call_arguments.delta':
    case 'response.mcp_call_arguments.done':
    case 'response.mcp_call.in_progress':
    case 'response.mcp_call.completed':
    case 'response.mcp_call.failed':
      return { type: 'unknown', rawType: type, raw };

    // ── Error ───────────────────────────────────────────────────────
    case 'error':
      return {
        type: 'error',
        message: event.error?.message ?? event.message ?? 'Unknown error',
        code: event.error?.code ?? event.code,
        raw,
      };

    // ── Pass-through ────────────────────────────────────────────────
    default:
      return { type: 'unknown', rawType: type, raw };
  }
}

/**
 * Serializes a normalized client event into xAI's Voice Agent API format.
 */
export function serializeXaiRealtimeClientEvent(
  event: RealtimeModelV4ClientEvent,
): unknown {
  switch (event.type) {
    case 'session-update':
      return {
        type: 'session.update',
        session: buildXaiSessionConfig(event.config),
      };

    case 'input-audio-append':
      return {
        type: 'input_audio_buffer.append',
        audio: event.audio,
      };

    case 'input-audio-commit':
      return { type: 'input_audio_buffer.commit' };

    case 'input-audio-clear':
      return { type: 'input_audio_buffer.clear' };

    case 'conversation-item-create': {
      const item = event.item;
      switch (item.type) {
        case 'text-message':
          return {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: item.role,
              content: [{ type: 'input_text', text: item.text }],
            },
          };
        case 'audio-message':
          return {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: item.role,
              content: [{ type: 'input_audio', audio: item.audio }],
            },
          };
        case 'function-call-output':
          return {
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: item.callId,
              output: item.output,
            },
          };
      }
      break;
    }

    case 'conversation-item-truncate':
      return {
        type: 'conversation.item.truncate',
        item_id: event.itemId,
        content_index: event.contentIndex,
        audio_end_ms: event.audioEndMs,
      };

    case 'response-create':
      return {
        type: 'response.create',
        ...(event.options != null
          ? {
              response: {
                ...(event.options.modalities != null
                  ? { modalities: event.options.modalities }
                  : {}),
                ...(event.options.instructions != null
                  ? { instructions: event.options.instructions }
                  : {}),
              },
            }
          : {}),
      };

    case 'response-cancel':
      return { type: 'response.cancel' };
  }
}

/**
 * Builds an xAI-specific session configuration from a normalized config.
 *
 * xAI uses a different audio config shape than OpenAI:
 * `audio.input.format.type` / `audio.input.format.rate` instead of
 * top-level `input_audio_format`.
 */
export function buildXaiSessionConfig(
  config: RealtimeModelV4SessionConfig,
): Record<string, unknown> {
  const session: Record<string, unknown> = {};

  if (config.instructions != null) {
    session.instructions = config.instructions;
  }

  if (config.voice != null) {
    session.voice = config.voice;
  }

  // xAI audio config uses nested `audio.input.format` / `audio.output.format`
  const audio: Record<string, unknown> = {};

  if (config.inputAudioFormat != null) {
    audio.input = {
      format: {
        type: config.inputAudioFormat.type,
        ...(config.inputAudioFormat.rate != null
          ? { rate: config.inputAudioFormat.rate }
          : {}),
      },
    };
  }

  if (config.outputAudioFormat != null) {
    audio.output = {
      format: {
        type: config.outputAudioFormat.type,
        ...(config.outputAudioFormat.rate != null
          ? { rate: config.outputAudioFormat.rate }
          : {}),
      },
    };
  }

  if (Object.keys(audio).length > 0) {
    session.audio = audio;
  }

  // Turn detection
  if (config.turnDetection != null) {
    if (config.turnDetection.type === 'disabled') {
      session.turn_detection = null;
    } else {
      const td: Record<string, unknown> = {
        type: 'server_vad',
      };
      if (config.turnDetection.threshold != null) {
        td.threshold = config.turnDetection.threshold;
      }
      if (config.turnDetection.silenceDurationMs != null) {
        td.silence_duration_ms = config.turnDetection.silenceDurationMs;
      }
      if (config.turnDetection.prefixPaddingMs != null) {
        td.prefix_padding_ms = config.turnDetection.prefixPaddingMs;
      }
      session.turn_detection = td;
    }
  }

  // Function tools (standard user-defined tools)
  if (config.tools != null && config.tools.length > 0) {
    session.tools = config.tools.map(tool => ({
      type: tool.type,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  // Provider-specific options (web_search, x_search, file_search, mcp tools, etc.)
  if (config.providerOptions != null) {
    const xaiOptions = config.providerOptions as Record<string, unknown>;

    if (Array.isArray(xaiOptions.tools)) {
      const existingTools = (session.tools as unknown[]) ?? [];
      session.tools = [...existingTools, ...xaiOptions.tools];
    }

    for (const [key, value] of Object.entries(xaiOptions)) {
      if (key !== 'tools') {
        session[key] = value;
      }
    }
  }

  return session;
}
