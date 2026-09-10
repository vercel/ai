import {
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  type Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
} from '@ai-sdk/provider';
import { z } from 'zod/v4';
import {
  buildOpenAILiveSessionConfig,
  buildOpenAILiveSessionUpdate,
} from './openai-live-session-config';

const sessionSchema = z.object({ id: z.string().min(1) });
const startedSessionSchema = sessionSchema.extend({
  delegation: z.object({ type: z.enum(['client', 'responses']) }).nullish(),
});
const usageSchema = z.object({ seconds: z.number().nonnegative() });
const transcriptFields = {
  delta: z.string(),
  start_ms: z.number().nonnegative(),
  end_ms: z.number().nonnegative(),
};
const acknowledgmentFields = { client_event_id: z.string().nullish() };
const appendAcknowledgmentFields = {
  ...acknowledgmentFields,
  start_ms: z.number().nonnegative(),
  end_ms: z.number().nonnegative(),
};
const serverEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.started'),
    session: startedSessionSchema,
  }),
  z.object({
    type: z.literal('session.closed'),
    session: sessionSchema.nullish(),
    usage: usageSchema,
    reason: z.string(),
  }),
  z.object({
    type: z.literal('session.usage.updated'),
    usage: usageSchema,
    context_window: z
      .object({ usage_ratio: z.number().min(0).max(1) })
      .nullish(),
  }),
  z.object({
    type: z.literal('session.output_audio.delta'),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('session.input_transcript.delta'),
    ...transcriptFields,
  }),
  z.object({
    type: z.literal('session.output_transcript.delta'),
    ...transcriptFields,
  }),
  z.object({
    type: z.literal('session.delegation.created'),
    offset_ms: z.number().nonnegative().nullish(),
    delegation: z.object({
      id: z.string().min(1),
      target: z.enum(['client', 'responses']).nullish(),
      response_id: z.string().min(1).nullish(),
    }),
  }),
  z.object({
    type: z.literal('session.updated'),
    session: sessionSchema,
    ...acknowledgmentFields,
  }),
  z.object({
    type: z.literal('session.input_audio.muted'),
    ...acknowledgmentFields,
  }),
  z.object({
    type: z.literal('session.input_audio.unmuted'),
    ...acknowledgmentFields,
  }),
  z.object({
    type: z.literal('session.instructions.appended'),
    ...appendAcknowledgmentFields,
  }),
  z.object({
    type: z.literal('session.thinking.appended'),
    ...appendAcknowledgmentFields,
  }),
  z.object({
    type: z.literal('session.commentary.appended'),
    ...appendAcknowledgmentFields,
  }),
  z.object({
    type: z.literal('response.event'),
    event: z.object({ type: z.string() }).passthrough(),
    delegation_id: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal('error'),
    error: z.object({
      message: z.string(),
      code: z.string().nullish(),
      client_event_id: z.string().nullish(),
    }),
  }),
]);
const knownTypes = new Set<string>(
  serverEventSchema.options.map(schema => schema.shape.type.value),
);
const envelopeSchema = z.object({ type: z.string() });
const backendUsageSchema = z.object({
  input_tokens: z.number().nonnegative(),
  output_tokens: z.number().nonnegative(),
  total_tokens: z.number().nonnegative(),
  input_tokens_details: z
    .object({ cached_tokens: z.number().nonnegative().nullish() })
    .nullish(),
});
const backendEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('response.created'),
    response: z.object({ id: z.string().min(1) }),
  }),
  z.object({
    type: z.literal('response.output_item.done'),
    response_id: z.string().min(1).nullish(),
    item: z.object({
      type: z.literal('function_call'),
      call_id: z.string().min(1),
      name: z.string().min(1),
      arguments: z.string(),
    }),
  }),
  z.object({
    type: z.enum([
      'response.completed',
      'response.failed',
      'response.incomplete',
      'response.cancelled',
    ]),
    response: z.object({
      id: z.string().min(1),
      status: z.string().min(1),
      usage: z.unknown(),
    }),
  }),
]);

type BackendCorrelation = {
  responses: Map<string, Set<string>>;
  count: number;
  overflowed: boolean;
  closed: boolean;
};

function resetBackendCorrelation(correlation: BackendCorrelation) {
  correlation.responses.clear();
  correlation.count = 0;
  correlation.overflowed = false;
  correlation.closed = false;
}

export function createOpenAILiveServerEventParser(): (
  raw: unknown,
) => RealtimeModelV4ServerEvent[] {
  const correlation: BackendCorrelation = {
    responses: new Map(),
    count: 0,
    overflowed: false,
    closed: false,
  };
  return raw => {
    const events = parseServerEvent(raw, correlation);
    return Array.isArray(events) ? events : [events];
  };
}

function normalizeBackendEvent(
  event: unknown,
  delegationId: string | null | undefined,
  raw: unknown,
  correlation?: BackendCorrelation,
): RealtimeModelV4ServerEvent[] {
  const parsed = backendEventSchema.safeParse(event);
  if (!parsed.success) return [];
  const data = parsed.data;
  switch (data.type) {
    case 'response.created': {
      const errors: RealtimeModelV4ServerEvent[] = [];
      if (correlation != null && !correlation.closed && delegationId != null) {
        const responses = correlation.responses.get(delegationId);
        if (!responses?.has(data.response.id)) {
          if (correlation.count >= 512) {
            // Preserve pending entries, but fail closed for inference after lost state.
            correlation.overflowed = true;
            errors.push({
              type: 'error',
              code: 'backend_correlation_limit',
              message:
                'OpenAI Live exceeded 512 active backend response associations. Start a new session to restore inferred correlation.',
              raw,
            });
          } else {
            const active = responses ?? new Set<string>();
            active.add(data.response.id);
            correlation.responses.set(delegationId, active);
            correlation.count++;
          }
        }
      }
      return [
        {
          type: 'backend-response-created',
          responseId: data.response.id,
          delegationId,
          raw,
        },
        ...errors,
      ];
    }
    case 'response.output_item.done': {
      const responses =
        delegationId != null && !correlation?.overflowed
          ? correlation?.responses.get(delegationId)
          : undefined;
      const responseId =
        data.response_id ??
        (responses?.size === 1 ? responses.values().next().value : undefined);
      if (responseId == null) return [];
      return [
        {
          type: 'backend-tool-call',
          responseId,
          delegationId,
          callId: data.item.call_id,
          name: data.item.name,
          arguments: data.item.arguments,
          raw,
        },
      ];
    }
    default: {
      if (correlation != null) {
        for (const [id, responses] of correlation.responses) {
          if (responses.delete(data.response.id)) correlation.count--;
          if (responses.size === 0) correlation.responses.delete(id);
        }
      }
      const usage = backendUsageSchema.safeParse(data.response.usage);
      return [
        {
          type: 'backend-response-done',
          responseId: data.response.id,
          delegationId,
          status: data.response.status,
          ...(usage.success
            ? {
                usage: {
                  inputTokens: usage.data.input_tokens,
                  outputTokens: usage.data.output_tokens,
                  totalTokens: usage.data.total_tokens,
                  cachedInputTokens:
                    usage.data.input_tokens_details?.cached_tokens ?? undefined,
                  raw: data.response.usage,
                },
              }
            : {}),
          raw,
        },
      ];
    }
  }
}

export function parseOpenAILiveServerEvent(
  raw: unknown,
): RealtimeModelV4ServerEvent[] {
  const events = parseServerEvent(raw);
  return Array.isArray(events) ? events : [events];
}

function parseServerEvent(
  raw: unknown,
  correlation?: BackendCorrelation,
): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
  const envelope = envelopeSchema.safeParse(raw);
  if (envelope.success && !knownTypes.has(envelope.data.type)) {
    return { type: 'custom', rawType: envelope.data.type, raw };
  }
  const parsed = serverEventSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      type: 'error',
      code: 'invalid_server_event',
      message: 'Invalid OpenAI Live server event.',
      raw,
    };
  }
  const event = parsed.data;
  if ('start_ms' in event && event.end_ms < event.start_ms) {
    return {
      type: 'error',
      code: 'invalid_server_event',
      message: 'Invalid OpenAI Live event time interval.',
      raw,
    };
  }
  switch (event.type) {
    case 'session.started':
      if (correlation != null) resetBackendCorrelation(correlation);
      return {
        type: 'session-started',
        sessionId: event.session.id,
        delegationMode:
          event.session.delegation?.type === 'responses'
            ? 'provider'
            : 'client',
        raw,
      };
    case 'session.closed':
      if (correlation != null) {
        resetBackendCorrelation(correlation);
        correlation.closed = true;
      }
      return {
        type: 'session-closed',
        sessionId: event.session?.id,
        usage: event.usage,
        reason: event.reason,
        raw,
      };
    case 'session.usage.updated':
      return {
        type: 'session-usage',
        usage: event.usage,
        contextWindowUsageRatio: event.context_window?.usage_ratio,
        raw,
      };
    case 'session.output_audio.delta':
      return { type: 'audio-chunk', delta: event.delta, raw };
    case 'session.input_transcript.delta':
    case 'session.output_transcript.delta':
      return {
        type: 'transcript-fragment',
        speaker:
          event.type === 'session.input_transcript.delta'
            ? 'user'
            : 'assistant',
        delta: event.delta,
        startMs: event.start_ms,
        endMs: event.end_ms,
        raw,
      };
    case 'session.delegation.created':
      return {
        type: 'delegation-created',
        delegationId: event.delegation.id,
        target:
          event.delegation.target === 'responses'
            ? 'provider'
            : (event.delegation.target ?? undefined),
        offsetMs: event.offset_ms ?? undefined,
        ...(event.delegation.response_id != null
          ? { responseId: event.delegation.response_id }
          : {}),
        raw,
      };
    case 'response.event':
      return [
        {
          type: 'backend-event',
          event: event.event,
          delegationId: event.delegation_id,
          raw,
        },
        ...normalizeBackendEvent(
          event.event,
          event.delegation_id,
          raw,
          correlation,
        ),
      ];
    case 'error':
      return {
        type: 'error',
        message: event.error.message,
        code: event.error.code ?? undefined,
        clientEventId: event.error.client_event_id ?? undefined,
        raw,
      };
    case 'session.updated':
      return {
        type: 'command-acknowledged',
        command: 'session.update',
        clientEventId: event.client_event_id ?? undefined,
        raw,
      };
    case 'session.input_audio.muted':
    case 'session.input_audio.unmuted':
      return {
        type: 'command-acknowledged',
        command: event.type.slice(0, -1),
        clientEventId: event.client_event_id ?? undefined,
        raw,
      };
    case 'session.instructions.appended':
    case 'session.thinking.appended':
    case 'session.commentary.appended':
      return {
        type: 'command-acknowledged',
        command: event.type.slice(0, -2),
        clientEventId: event.client_event_id ?? undefined,
        raw,
      };
  }
}

export function serializeOpenAILiveClientEvent(
  event: RealtimeModelV4ClientEvent,
  modelId: string,
): unknown {
  const eventId =
    'eventId' in event && event.eventId !== undefined
      ? { event_id: event.eventId }
      : {};
  switch (event.type) {
    case 'session-start':
      return {
        type: 'session.start',
        session: buildOpenAILiveSessionConfig(event.config, modelId),
        ...eventId,
      };
    case 'session-update':
      return {
        type: 'session.update',
        session: buildOpenAILiveSessionUpdate(event.config),
        ...eventId,
      };
    case 'session-close':
      return { type: 'session.close', ...eventId };
    case 'input-audio-append':
      return {
        type: 'session.input_audio.append',
        audio: event.audio,
        ...eventId,
      };
    case 'input-audio-mute':
      return { type: 'session.input_audio.mute', ...eventId };
    case 'input-audio-unmute':
      return { type: 'session.input_audio.unmute', ...eventId };
    case 'backend-tool-result':
      return {
        type: 'response.item.create',
        item: {
          type: 'function_call_output',
          call_id: event.callId,
          output: event.output,
        },
        ...eventId,
      };
    case 'backend-response-create':
      return { type: 'response.create', ...eventId };
    case 'backend-input-create':
      return {
        type: 'response.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: event.content.map(part => {
            if (part.type === 'text')
              return { type: 'input_text', text: part.text };
            const options = z
              .strictObject({
                imageDetail: z.enum(['auto', 'low', 'high']).optional(),
              })
              .parse(part.providerOptions?.openai ?? {});
            return {
              type: 'input_image',
              image_url: part.url,
              ...(options.imageDetail !== undefined
                ? { detail: options.imageDetail }
                : {}),
            };
          }),
        },
        ...eventId,
      };
    case 'context-append': {
      const context = z
        .object({
          content: z.string(),
          delegationId: z.string().min(1).nullable(),
        })
        .parse(event);
      const options = z
        .strictObject({
          channel: z
            .enum(['instructions', 'thinking', 'commentary'])
            .optional(),
        })
        .parse(event.providerOptions?.openai ?? {});
      return {
        type: `session.${options.channel ?? 'thinking'}.append`,
        content: context.content,
        delegation_id: context.delegationId,
        ...eventId,
      };
    }
    default:
      throw new UnsupportedFunctionalityError({
        functionality: `OpenAI Live command: ${event.type}; use continuous audio and context-append instead of voice-turn commands`,
      });
  }
}
