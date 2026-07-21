import type {
  Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
  Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
  Experimental_RealtimeModelV4Usage as RealtimeModelV4Usage,
} from '@ai-sdk/provider';

type XaiRealtimeTokenDetails = {
  audio_tokens?: number;
  text_tokens?: number;
};

type XaiRealtimeInputTokenDetails = XaiRealtimeTokenDetails & {
  cached_tokens_details?: XaiRealtimeTokenDetails;
};

type XaiRealtimeResponseUsage = {
  input_token_details?: XaiRealtimeInputTokenDetails;
  output_token_details?: XaiRealtimeTokenDetails;
};

type XaiRealtimeTranscriptionUsage = {
  type?: string;
  seconds?: number;
  output_tokens?: number;
  input_token_details?: XaiRealtimeTokenDetails;
};

type XaiRealtimeWireEvent = {
  type: string;
  session?: { id?: string };
  item?: { id?: string } & Record<string, unknown>;
  response?: { id?: string; status?: string; usage?: XaiRealtimeResponseUsage };
  error?: { message?: string; code?: string };
  item_id: string;
  previous_item_id?: string;
  response_id: string;
  transcript?: string;
  delta: string;
  text?: string;
  call_id: string;
  name: string;
  arguments: string;
  message?: string;
  code?: string;
  usage?: XaiRealtimeTranscriptionUsage;
};

export function parseXaiRealtimeServerEvent(
  raw: unknown,
): RealtimeModelV4ServerEvent {
  const event = raw as XaiRealtimeWireEvent;
  const type = event.type;

  switch (type) {
    case 'session.created':
      return {
        type: 'session-created',
        sessionId: event.session?.id,
        raw,
      };

    case 'session.updated':
      return { type: 'session-updated', raw };

    case 'conversation.created':
      return { type: 'custom', rawType: type, raw };

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

    case 'conversation.item.added':
      return {
        type: 'conversation-item-added',
        itemId: event.item?.id ?? event.item_id,
        item: event.item,
        raw,
      };

    case 'conversation.item.input_audio_transcription.completed': {
      const usage = mapTranscriptionUsage(event.usage);
      return {
        type: 'input-transcription-completed',
        itemId: event.item_id,
        transcript: event.transcript ?? '',
        ...(usage != null ? { usage } : {}),
        raw,
      };
    }

    case 'response.created':
      return {
        type: 'response-created',
        responseId: event.response?.id ?? event.response_id,
        raw,
      };

    case 'response.done': {
      const usage = mapResponseUsage(event.response?.usage);
      return {
        type: 'response-done',
        responseId: event.response?.id ?? event.response_id,
        status: event.response?.status ?? 'completed',
        ...(usage != null ? { usage } : {}),
        raw,
      };
    }

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

    case 'mcp_list_tools.in_progress':
    case 'mcp_list_tools.completed':
    case 'mcp_list_tools.failed':
    case 'response.mcp_call_arguments.delta':
    case 'response.mcp_call_arguments.done':
    case 'response.mcp_call.in_progress':
    case 'response.mcp_call.completed':
    case 'response.mcp_call.failed':
      return { type: 'custom', rawType: type, raw };

    case 'error':
      return {
        type: 'error',
        message: event.error?.message ?? event.message ?? 'Unknown error',
        code: event.error?.code ?? event.code,
        raw,
      };

    default:
      return { type: 'custom', rawType: type, raw };
  }
}

/**
 * Maps xAI realtime `response.done` usage to normalized usage. xAI speaks the
 * OpenAI realtime wire shape, so input buckets are gross (cache-inclusive) with
 * the cached portion surfaced separately.
 */
function mapResponseUsage(
  usage: XaiRealtimeResponseUsage | undefined,
): RealtimeModelV4Usage | undefined {
  if (usage == null) return undefined;

  const input = usage.input_token_details;
  const output = usage.output_token_details;
  const cached = input?.cached_tokens_details;

  return compactUsage({
    inputAudioTokens: input?.audio_tokens,
    inputTextTokens: input?.text_tokens,
    outputAudioTokens: output?.audio_tokens,
    outputTextTokens: output?.text_tokens,
    cachedInputAudioTokens: cached?.audio_tokens,
    cachedInputTextTokens: cached?.text_tokens,
  });
}

/**
 * Maps xAI realtime transcription-completed usage to normalized usage.
 * Duration-billed transcription reports `seconds`; token-billed reports tokens.
 */
function mapTranscriptionUsage(
  usage: XaiRealtimeTranscriptionUsage | undefined,
): RealtimeModelV4Usage | undefined {
  if (usage == null) return undefined;

  if (usage.type === 'duration') {
    return usage.seconds != null ? { audioSeconds: usage.seconds } : undefined;
  }

  const input = usage.input_token_details;
  return compactUsage({
    inputAudioTokens: input?.audio_tokens,
    inputTextTokens: input?.text_tokens,
    outputTextTokens: usage.output_tokens,
  });
}

/** Drop `undefined` fields; return `undefined` when nothing is observable. */
function compactUsage(
  usage: RealtimeModelV4Usage,
): RealtimeModelV4Usage | undefined {
  const result: RealtimeModelV4Usage = {};
  for (const [key, value] of Object.entries(usage)) {
    if (value != null) {
      result[key as keyof RealtimeModelV4Usage] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

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
      // xAI does not support `conversation.item.truncate` over WebSocket (it is
      // silently ignored by the server). Barge-in still works because the SDK
      // stops local playback when `speech_started` fires, so dropping the event
      // here just avoids sending a no-op.
      return undefined;

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

  if (config.tools != null && config.tools.length > 0) {
    session.tools = config.tools.map(tool => ({
      type: tool.type,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

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
