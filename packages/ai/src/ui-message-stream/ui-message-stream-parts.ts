import { z } from 'zod';
import { ProviderMetadata } from '../../core';

export const uiMessageStreamPartSchema = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    errorText: z.string(),
  }),
  z.object({
    type: z.literal('tool-call-streaming-start'),
    toolCallId: z.string(),
    toolName: z.string(),
  }),
  z.object({
    type: z.literal('tool-call-delta'),
    toolCallId: z.string(),
    argsTextDelta: z.string(),
  }),
  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
  }),
  z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string(),
    result: z.unknown(),
    providerMetadata: z.any().optional(),
  }),
  z.object({
    type: z.literal('reasoning'),
    text: z.string(),
    providerMetadata: z.record(z.any()).optional(),
  }),
  z.object({
    type: z.literal('source-url'),
    sourceId: z.string(),
    url: z.string(),
    title: z.string().optional(),
    providerMetadata: z.any().optional(), // Use z.any() for generic metadata
  }),
  z.object({
    type: z.literal('file'),
    url: z.string(),
    mediaType: z.string(),
  }),
  z.object({
    type: z.string().startsWith('data-'),
    id: z.string().optional(),
    data: z.unknown(),
  }),
  z.object({
    type: z.literal('metadata'),
    value: z.object({ metadata: z.unknown() }),
  }),
  z.object({
    type: z.literal('start-step'),
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('finish-step'),
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('start'),
    messageId: z.string().optional(),
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('finish'),
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('reasoning-part-finish'),
  }),
]);

export type DataUIMessageStreamPart = {
  type: `data-${string}`;
  id?: string;
  data: unknown;
};

export type UIMessageStreamPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'error';
      errorText: string;
    }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: 'tool-result';
      toolCallId: string;
      result: unknown;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'tool-call-streaming-start';
      toolCallId: string;
      toolName: string;
    }
  | {
      type: 'tool-call-delta';
      toolCallId: string;
      argsTextDelta: string;
    }
  | {
      type: 'reasoning';
      text: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'source-url';
      sourceId: string;
      url: string;
      title?: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'file';
      url: string;
      mediaType: string;
    }
  | DataUIMessageStreamPart
  | {
      type: 'metadata';
      metadata: unknown;
    }
  | {
      type: 'start-step';
      metadata?: unknown;
    }
  | {
      type: 'finish-step';
      metadata?: unknown;
    }
  | {
      type: 'start';
      messageId?: string;
      metadata?: unknown;
    }
  | {
      type: 'finish';
      metadata?: unknown;
    }
  | {
      type: 'reasoning-part-finish';
    };

export function isDataUIMessageStreamPart(
  part: UIMessageStreamPart,
): part is DataUIMessageStreamPart {
  return part.type.startsWith('data-');
}
