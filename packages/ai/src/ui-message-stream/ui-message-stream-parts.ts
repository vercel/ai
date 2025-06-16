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
  z.strictObject({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.strictObject({
    type: z.literal('error'),
    errorText: z.string(),
  }),
  z.strictObject({
    type: z.literal('tool-input-start'),
    toolCallId: z.string(),
    toolName: z.string(),
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
  }),
  z.strictObject({
    type: z.literal('tool-output-available'),
    toolCallId: z.string(),
    output: z.unknown(),
    providerMetadata: z.any().optional(),
  }),
  z.strictObject({
    type: z.literal('reasoning'),
    text: z.string(),
    providerMetadata: z.record(z.any()).optional(),
  }),
  z.strictObject({
    type: z.literal('reasoning-part-finish'),
  }),
  z.strictObject({
    type: z.literal('source-url'),
    sourceId: z.string(),
    url: z.string(),
    title: z.string().optional(),
    providerMetadata: z.any().optional(), // Use z.any() for generic metadata
  }),
  z.strictObject({
    type: z.literal('source-document'),
    sourceId: z.string(),
    mediaType: z.string(),
    title: z.string(),
    filename: z.string().optional(),
    providerMetadata: z.any().optional(), // Use z.any() for generic metadata
  }),
  z.strictObject({
    type: z.literal('file'),
    url: z.string(),
    mediaType: z.string(),
  }),
  z.strictObject({
    type: z.string().startsWith('data-'),
    id: z.string().optional(),
    data: z.unknown(),
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
    type: z.literal('message-metadata'),
    messageMetadata: z.unknown(),
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
      type: 'tool-input-available';
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: 'tool-output-available';
      toolCallId: string;
      output: unknown;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'tool-input-start';
      toolCallId: string;
      toolName: string;
    }
  | {
      type: 'tool-input-delta';
      toolCallId: string;
      inputTextDelta: string;
    }
  | {
      type: 'reasoning';
      text: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'reasoning-part-finish';
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
      type: 'message-metadata';
      messageMetadata: METADATA;
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
