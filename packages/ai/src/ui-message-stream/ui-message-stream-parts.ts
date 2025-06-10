import { z } from 'zod';
import { ValueOf } from '../util/value-of';
import {
  InferUIMessageData,
  InferUIMessageMetadata,
  UIDataTypes,
  UIMessage,
} from '../ui/ui-messages';
import { ProviderMetadata } from '../../core/types/provider-metadata';

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
    type: z.literal('source-document'),
    sourceId: z.string(),
    mediaType: z.string(),
    title: z.string(),
    filename: z.string().optional(),
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

export type DataUIMessageStreamPart<DATA_TYPES extends UIDataTypes> = ValueOf<{
  [NAME in keyof DATA_TYPES & string]: {
    type: `data-${NAME}`;
    id?: string;
    data: DATA_TYPES[NAME];
  };
}>;

export type UIMessageStreamPart<
  METADATA = unknown,
  DATA_TYPES extends UIDataTypes = UIDataTypes,
> =
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
      type: 'source-document';
      sourceId: string;
      mediaType: string;
      title: string;
      filename?: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'file';
      url: string;
      mediaType: string;
    }
  | DataUIMessageStreamPart<DATA_TYPES>
  | {
      type: 'metadata';
      metadata: METADATA;
    }
  | {
      type: 'start-step';
      metadata?: METADATA;
    }
  | {
      type: 'finish-step';
      metadata?: METADATA;
    }
  | {
      type: 'start';
      messageId?: string;
      metadata?: METADATA;
    }
  | {
      type: 'finish';
      metadata?: METADATA;
    }
  | {
      type: 'reasoning-part-finish';
    };

export function isDataUIMessageStreamPart(
  part: UIMessageStreamPart,
): part is DataUIMessageStreamPart<UIDataTypes> {
  return part.type.startsWith('data-');
}

export type InferUIMessageStreamPart<T extends UIMessage> = UIMessageStreamPart<
  InferUIMessageMetadata<T>,
  InferUIMessageData<T>
>;
