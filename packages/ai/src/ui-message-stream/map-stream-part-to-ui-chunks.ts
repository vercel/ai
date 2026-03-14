import type { ProviderMetadata } from '../types/provider-metadata';
import type { UIMessageChunk } from './ui-message-chunks';

/**
 * Normalized stream part type that covers the fields needed for
 * UIMessageChunk conversion. Both TextStreamPart<TOOLS> and
 * LanguageModelV3StreamPart (after normalization) can satisfy this interface.
 */
export type MappableStreamPart =
  | { type: 'text-start'; id: string; providerMetadata?: ProviderMetadata }
  | {
      type: 'text-delta';
      id: string;
      delta: string;
      providerMetadata?: ProviderMetadata;
    }
  | { type: 'text-end'; id: string; providerMetadata?: ProviderMetadata }
  | {
      type: 'reasoning-start';
      id: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'reasoning-delta';
      id: string;
      delta: string;
      providerMetadata?: ProviderMetadata;
    }
  | { type: 'reasoning-end'; id: string; providerMetadata?: ProviderMetadata }
  | {
      type: 'file';
      url: string;
      mediaType: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'source';
      sourceType: 'url';
      id: string;
      url: string;
      title?: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'source';
      sourceType: 'document';
      id: string;
      mediaType: string;
      title: string;
      filename?: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'tool-input-start';
      id: string;
      toolName: string;
      providerExecuted?: boolean;
      providerMetadata?: ProviderMetadata;
      dynamic?: boolean;
      title?: string;
    }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-input-end' }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      input: unknown;
      providerExecuted?: boolean;
      providerMetadata?: ProviderMetadata;
      dynamic?: boolean;
      title?: string;
      invalid?: boolean;
      error?: unknown;
    }
  | {
      type: 'tool-result';
      toolCallId: string;
      output: unknown;
      providerExecuted?: boolean;
      providerMetadata?: ProviderMetadata;
      dynamic?: boolean;
      preliminary?: boolean;
    }
  | {
      type: 'tool-approval-request';
      approvalId: string;
      toolCallId: string;
    }
  | {
      type: 'tool-error';
      toolCallId: string;
      toolName: string;
      error: unknown;
      providerExecuted?: boolean;
      providerMetadata?: ProviderMetadata;
      dynamic?: boolean;
    }
  | { type: 'tool-output-denied'; toolCallId: string }
  | { type: 'error'; error: unknown }
  | { type: 'start' }
  | {
      type: 'finish';
      finishReason?: string;
    }
  | { type: 'abort'; reason?: string }
  | { type: 'start-step' }
  | { type: 'finish-step' }
  | { type: 'raw' }
  | { type: 'stream-start' }
  | { type: 'response-metadata' };

/**
 * Options for mapping stream parts to UI chunks.
 */
export interface MapStreamPartToUIChunksOptions {
  /** Whether to include reasoning chunks. @default true */
  sendReasoning?: boolean;

  /** Whether to include source chunks. @default true */
  sendSources?: boolean;

  /**
   * Resolve dynamic status for a tool part. Called for tool-related chunks
   * to determine if the tool is dynamic. If not provided, uses the part's
   * own `dynamic` field.
   */
  isDynamic?: (part: {
    toolName: string;
    dynamic?: boolean;
  }) => boolean | undefined;

  /** Format error objects to strings. @default String(error) */
  onError?: (error: unknown) => string;
}

function optionalField<K extends string, V>(
  key: K,
  value: V | null | undefined,
): { [P in K]: V } | {} {
  return value != null ? ({ [key]: value } as { [P in K]: V }) : {};
}

function defaultOnError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Pure function that maps a single stream part to zero or more UIMessageChunks.
 *
 * This is the shared conversion logic used by both `toUIMessageStream()`
 * (which operates on TextStreamPart<TOOLS>) and
 * `createProviderStreamToUIChunkTransform()` (which normalizes
 * LanguageModelV3StreamPart first).
 */
export function mapStreamPartToUIChunks(
  part: MappableStreamPart,
  options?: MapStreamPartToUIChunksOptions,
): UIMessageChunk[] {
  const sendReasoning = options?.sendReasoning ?? true;
  const sendSources = options?.sendSources ?? true;
  const isDynamic = options?.isDynamic;
  const onError = options?.onError ?? defaultOnError;

  switch (part.type) {
    case 'text-start': {
      return [
        {
          type: 'text-start',
          id: part.id,
          ...optionalField('providerMetadata', part.providerMetadata),
        },
      ];
    }

    case 'text-delta': {
      return [
        {
          type: 'text-delta',
          id: part.id,
          delta: part.delta,
          ...optionalField('providerMetadata', part.providerMetadata),
        },
      ];
    }

    case 'text-end': {
      return [
        {
          type: 'text-end',
          id: part.id,
          ...optionalField('providerMetadata', part.providerMetadata),
        },
      ];
    }

    case 'reasoning-start': {
      return [
        {
          type: 'reasoning-start',
          id: part.id,
          ...optionalField('providerMetadata', part.providerMetadata),
        },
      ];
    }

    case 'reasoning-delta': {
      if (!sendReasoning) return [];
      return [
        {
          type: 'reasoning-delta',
          id: part.id,
          delta: part.delta,
          ...optionalField('providerMetadata', part.providerMetadata),
        },
      ];
    }

    case 'reasoning-end': {
      return [
        {
          type: 'reasoning-end',
          id: part.id,
          ...optionalField('providerMetadata', part.providerMetadata),
        },
      ];
    }

    case 'file': {
      return [
        {
          type: 'file',
          mediaType: part.mediaType,
          url: part.url,
          ...optionalField('providerMetadata', part.providerMetadata),
        },
      ];
    }

    case 'source': {
      if (!sendSources) return [];

      if (part.sourceType === 'url') {
        return [
          {
            type: 'source-url',
            sourceId: part.id,
            url: part.url,
            title: part.title,
            ...optionalField('providerMetadata', part.providerMetadata),
          },
        ];
      }

      if (part.sourceType === 'document') {
        return [
          {
            type: 'source-document',
            sourceId: part.id,
            mediaType: part.mediaType,
            title: part.title,
            filename: part.filename,
            ...optionalField('providerMetadata', part.providerMetadata),
          },
        ];
      }

      return [];
    }

    case 'tool-input-start': {
      const dynamic = isDynamic ? isDynamic(part) : part.dynamic;

      return [
        {
          type: 'tool-input-start',
          toolCallId: part.id,
          toolName: part.toolName,
          ...optionalField('providerExecuted', part.providerExecuted),
          ...optionalField('providerMetadata', part.providerMetadata),
          ...optionalField('dynamic', dynamic),
          ...optionalField('title', part.title),
        },
      ];
    }

    case 'tool-input-delta': {
      return [
        {
          type: 'tool-input-delta',
          toolCallId: part.id,
          inputTextDelta: part.delta,
        },
      ];
    }

    case 'tool-input-end': {
      return [];
    }

    case 'tool-call': {
      const dynamic = isDynamic ? isDynamic(part) : part.dynamic;

      if (part.invalid) {
        return [
          {
            type: 'tool-input-error',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            ...optionalField('providerExecuted', part.providerExecuted),
            ...optionalField('providerMetadata', part.providerMetadata),
            ...optionalField('dynamic', dynamic),
            errorText: onError(part.error),
            ...optionalField('title', part.title),
          },
        ];
      }

      return [
        {
          type: 'tool-input-available',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          ...optionalField('providerExecuted', part.providerExecuted),
          ...optionalField('providerMetadata', part.providerMetadata),
          ...optionalField('dynamic', dynamic),
          ...optionalField('title', part.title),
        },
      ];
    }

    case 'tool-result': {
      return [
        {
          type: 'tool-output-available',
          toolCallId: part.toolCallId,
          output: part.output,
          ...optionalField('providerExecuted', part.providerExecuted),
          ...optionalField('providerMetadata', part.providerMetadata),
          ...optionalField('preliminary', part.preliminary),
          ...optionalField('dynamic', part.dynamic),
        },
      ];
    }

    case 'tool-approval-request': {
      return [
        {
          type: 'tool-approval-request',
          approvalId: part.approvalId,
          toolCallId: part.toolCallId,
        },
      ];
    }

    case 'tool-error': {
      const dynamic = isDynamic ? isDynamic(part) : part.dynamic;

      return [
        {
          type: 'tool-output-error',
          toolCallId: part.toolCallId,
          errorText: part.providerExecuted
            ? typeof part.error === 'string'
              ? part.error
              : JSON.stringify(part.error)
            : onError(part.error),
          ...optionalField('providerExecuted', part.providerExecuted),
          ...optionalField('providerMetadata', part.providerMetadata),
          ...optionalField('dynamic', dynamic),
        },
      ];
    }

    case 'tool-output-denied': {
      return [
        {
          type: 'tool-output-denied',
          toolCallId: part.toolCallId,
        },
      ];
    }

    case 'error': {
      return [
        {
          type: 'error',
          errorText: onError(part.error),
        },
      ];
    }

    case 'start-step': {
      return [{ type: 'start-step' }];
    }

    case 'finish-step': {
      return [{ type: 'finish-step' }];
    }

    case 'start':
    case 'finish':
    case 'abort': {
      // These lifecycle events are handled by the consumer
      // (toUIMessageStream adds messageMetadata, messageId, etc.)
      return [];
    }

    case 'stream-start':
    case 'response-metadata':
    case 'raw': {
      // Internal events - no UI representation
      return [];
    }

    default: {
      return [];
    }
  }
}
