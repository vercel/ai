import { z } from 'zod/v4';
import {
  ProviderMetadata,
  providerMetadataSchema,
} from '../types/provider-metadata';
import {
  InferUIMessageData,
  InferUIMessageMetadata,
  UIDataTypes,
  UIMessage,
} from '../ui/ui-messages';
import { ValueOf } from '../util/value-of';

export const uiMessageChunkSchema = z.union([
  z.strictObject({
    type: z.literal('text-start'),
    id: z.string(),
    providerMetadata: providerMetadataSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('text-delta'),
    id: z.string(),
    delta: z.string(),
    providerMetadata: providerMetadataSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('text-end'),
    id: z.string(),
    providerMetadata: providerMetadataSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('error'),
    errorText: z.string(),
  }),
  z.strictObject({
    type: z.literal('tool-input-start'),
    toolCallId: z.string(),
    toolName: z.string(),
    providerExecuted: z.boolean().optional(),
    dynamic: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('tool-input-delta'),
    toolCallId: z.string(),
    inputTextDelta: z.string(),
  }),
  z.strictObject({
    type: z.literal('tool-input-available'),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
    providerExecuted: z.boolean().optional(),
    providerMetadata: providerMetadataSchema.optional(),
    dynamic: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('tool-input-error'),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
    providerExecuted: z.boolean().optional(),
    providerMetadata: providerMetadataSchema.optional(),
    dynamic: z.boolean().optional(),
    errorText: z.string(),
  }),
  z.strictObject({
    type: z.literal('tool-output-available'),
    toolCallId: z.string(),
    output: z.unknown(),
    providerExecuted: z.boolean().optional(),
    dynamic: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('tool-output-error'),
    toolCallId: z.string(),
    errorText: z.string(),
    providerExecuted: z.boolean().optional(),
    dynamic: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('reasoning'),
    text: z.string(),
    providerMetadata: providerMetadataSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('reasoning-start'),
    id: z.string(),
    providerMetadata: providerMetadataSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('reasoning-delta'),
    id: z.string(),
    delta: z.string(),
    providerMetadata: providerMetadataSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('reasoning-end'),
    id: z.string(),
    providerMetadata: providerMetadataSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('reasoning-part-finish'),
  }),
  z.strictObject({
    type: z.literal('source-url'),
    sourceId: z.string(),
    url: z.string(),
    title: z.string().optional(),
    providerMetadata: providerMetadataSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('source-document'),
    sourceId: z.string(),
    mediaType: z.string(),
    title: z.string(),
    filename: z.string().optional(),
    providerMetadata: providerMetadataSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('file'),
    url: z.string(),
    mediaType: z.string(),
    providerMetadata: providerMetadataSchema.optional(),
  }),
  z.strictObject({
    type: z.string().startsWith('data-'),
    id: z.string().optional(),
    data: z.unknown(),
    transient: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('start-step'),
  }),
  z.strictObject({
    type: z.literal('finish-step'),
  }),
  z.strictObject({
    type: z.literal('start'),
    messageId: z.string().optional(),
    messageMetadata: z.unknown().optional(),
  }),
  z.strictObject({
    type: z.literal('finish'),
    messageMetadata: z.unknown().optional(),
  }),
  z.strictObject({
    type: z.literal('abort'),
  }),
  z.strictObject({
    type: z.literal('message-metadata'),
    messageMetadata: z.unknown(),
  }),
]);

export type DataUIMessageChunk<DATA_TYPES extends UIDataTypes> = ValueOf<{
  [NAME in keyof DATA_TYPES & string]: {
    type: `data-${NAME}`;
    id?: string;
    data: DATA_TYPES[NAME];
    transient?: boolean;
  };
}>;

export type UIMessageChunk<
  METADATA = unknown,
  DATA_TYPES extends UIDataTypes = UIDataTypes,
> =
  | {
      type: 'text-start';
      id: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'text-delta';
      delta: string;
      id: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'text-end';
      id: string;
      providerMetadata?: ProviderMetadata;
    }
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
  | {
      type: 'reasoning-end';
      id: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'error';
      errorText: string;
    }
  | {
      type: 'tool-input-available';
      toolCallId: string;
      toolName: string;
      input: unknown;
      providerExecuted?: boolean;
      providerMetadata?: ProviderMetadata;
      dynamic?: boolean;
    }
  | {
      type: 'tool-input-error';
      toolCallId: string;
      toolName: string;
      input: unknown;
      providerExecuted?: boolean;
      providerMetadata?: ProviderMetadata;
      dynamic?: boolean;
      errorText: string;
    }
  | {
      type: 'tool-output-available';
      toolCallId: string;
      output: unknown;
      providerExecuted?: boolean;
      dynamic?: boolean;
    }
  | {
      type: 'tool-output-error';
      toolCallId: string;
      errorText: string;
      providerExecuted?: boolean;
      dynamic?: boolean;
    }
  | {
      type: 'tool-input-start';
      toolCallId: string;
      toolName: string;
      providerExecuted?: boolean;
      dynamic?: boolean;
    }
  | {
      type: 'tool-input-delta';
      toolCallId: string;
      inputTextDelta: string;
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
  | DataUIMessageChunk<DATA_TYPES>
  | {
      type: 'start-step';
    }
  | {
      type: 'finish-step';
    }
  | {
      type: 'start';
      messageId?: string;
      messageMetadata?: METADATA;
    }
  | {
      type: 'finish';
      messageMetadata?: METADATA;
    }
  | {
      type: 'abort';
    }
  | {
      type: 'message-metadata';
      messageMetadata: METADATA;
    };

export function isDataUIMessageChunk(
  chunk: UIMessageChunk,
): chunk is DataUIMessageChunk<UIDataTypes> {
  return chunk.type.startsWith('data-');
}

export type InferUIMessageChunk<T extends UIMessage> = UIMessageChunk<
  InferUIMessageMetadata<T>,
  InferUIMessageData<T>
>;
