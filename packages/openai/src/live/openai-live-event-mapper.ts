import {
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  type Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
} from '@ai-sdk/provider';
import { z } from 'zod/v4';
import { buildOpenAILiveSessionConfig } from './openai-live-session-config';

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

export function createOpenAILiveServerEventParser(): (
  raw: unknown,
) => RealtimeModelV4ServerEvent[] {
  return raw => parseOpenAILiveServerEvent(raw);
}

export function parseOpenAILiveServerEvent(
  raw: unknown,
): RealtimeModelV4ServerEvent[] {
  return [parseServerEvent(raw)];
}

function parseServerEvent(raw: unknown): RealtimeModelV4ServerEvent {
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
      throw new UnsupportedFunctionalityError({
        functionality:
          'OpenAI Live session-update; startup settings are immutable; use context-append or input-audio-mute/input-audio-unmute',
      });
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
