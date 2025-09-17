import { TypeValidationError } from '@ai-sdk/provider';
import {
  StandardSchemaV1,
  Tool,
  validateTypes,
  Validator,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { providerMetadataSchema } from '../types/provider-metadata';
import {
  DataUIPart,
  InferUIMessageData,
  InferUIMessageTools,
  ToolUIPart,
  UIMessage,
} from './ui-messages';
import { InvalidArgumentError } from '../error';

const textUIPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  state: z.enum(['streaming', 'done']).optional(),
  providerMetadata: providerMetadataSchema.optional(),
});

const reasoningUIPartSchema = z.object({
  type: z.literal('reasoning'),
  text: z.string(),
  state: z.enum(['streaming', 'done']).optional(),
  providerMetadata: providerMetadataSchema.optional(),
});

const sourceUrlUIPartSchema = z.object({
  type: z.literal('source-url'),
  sourceId: z.string(),
  url: z.string(),
  title: z.string().optional(),
  providerMetadata: providerMetadataSchema.optional(),
});

const sourceDocumentUIPartSchema = z.object({
  type: z.literal('source-document'),
  sourceId: z.string(),
  mediaType: z.string(),
  title: z.string(),
  filename: z.string().optional(),
  providerMetadata: providerMetadataSchema.optional(),
});

const fileUIPartSchema = z.object({
  type: z.literal('file'),
  mediaType: z.string(),
  filename: z.string().optional(),
  url: z.string(),
  providerMetadata: providerMetadataSchema.optional(),
});

const stepStartUIPartSchema = z.object({
  type: z.literal('step-start'),
});

const dataUIPartSchema = z.object({
  type: z.string().startsWith('data-'),
  id: z.string().optional(),
  data: z.unknown(),
});

const dynamicToolUIPartSchemas = [
  z.object({
    type: z.literal('dynamic-tool'),
    toolName: z.string(),
    toolCallId: z.string(),
    state: z.literal('input-streaming'),
    input: z.unknown().optional(),
    output: z.never().optional(),
    errorText: z.never().optional(),
  }),
  z.object({
    type: z.literal('dynamic-tool'),
    toolName: z.string(),
    toolCallId: z.string(),
    state: z.literal('input-available'),
    input: z.unknown(),
    output: z.never().optional(),
    errorText: z.never().optional(),
    callProviderMetadata: providerMetadataSchema.optional(),
  }),
  z.object({
    type: z.literal('dynamic-tool'),
    toolName: z.string(),
    toolCallId: z.string(),
    state: z.literal('output-available'),
    input: z.unknown(),
    output: z.unknown(),
    errorText: z.never().optional(),
    callProviderMetadata: providerMetadataSchema.optional(),
    preliminary: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('dynamic-tool'),
    toolName: z.string(),
    toolCallId: z.string(),
    state: z.literal('output-error'),
    input: z.unknown(),
    output: z.never().optional(),
    errorText: z.string(),
    callProviderMetadata: providerMetadataSchema.optional(),
  }),
];

const toolUIPartSchemas = [
  z.object({
    type: z.string().startsWith('tool-'),
    toolCallId: z.string(),
    state: z.literal('input-streaming'),
    providerExecuted: z.boolean().optional(),
    input: z.unknown().optional(),
    output: z.never().optional(),
    errorText: z.never().optional(),
  }),
  z.object({
    type: z.string().startsWith('tool-'),
    toolCallId: z.string(),
    state: z.literal('input-available'),
    providerExecuted: z.boolean().optional(),
    input: z.unknown(),
    output: z.never().optional(),
    errorText: z.never().optional(),
    callProviderMetadata: providerMetadataSchema.optional(),
  }),
  z.object({
    type: z.string().startsWith('tool-'),
    toolCallId: z.string(),
    state: z.literal('output-available'),
    providerExecuted: z.boolean().optional(),
    input: z.unknown(),
    output: z.unknown(),
    errorText: z.never().optional(),
    callProviderMetadata: providerMetadataSchema.optional(),
    preliminary: z.boolean().optional(),
  }),
  z.object({
    type: z.string().startsWith('tool-'),
    toolCallId: z.string(),
    state: z.literal('output-error'),
    providerExecuted: z.boolean().optional(),
    input: z.unknown(),
    output: z.never().optional(),
    errorText: z.string(),
    callProviderMetadata: providerMetadataSchema.optional(),
  }),
];

const uiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['system', 'user', 'assistant']),
  metadata: z.unknown().optional(),
  parts: z.array(
    z.union([
      textUIPartSchema,
      reasoningUIPartSchema,
      sourceUrlUIPartSchema,
      sourceDocumentUIPartSchema,
      fileUIPartSchema,
      stepStartUIPartSchema,
      dataUIPartSchema,
      ...dynamicToolUIPartSchemas,
      ...toolUIPartSchemas,
    ]),
  ),
});

export type SafeValidateUIMessagesResult<UI_MESSAGE extends UIMessage> =
  | {
      success: true;
      data: Array<UI_MESSAGE>;
    }
  | {
      success: false;
      error: Error;
    };

/**
 * Validates a list of UI messages like `validateUIMessages`,
 * but instead of throwing it returns `{ success: true, data }`
 * or `{ success: false, error }`.
 */
export async function safeValidateUIMessages<UI_MESSAGE extends UIMessage>({
  messages,
  metadataSchema,
  dataSchemas,
  tools,
}: {
  messages: unknown;
  metadataSchema?:
    | Validator<UIMessage['metadata']>
    | StandardSchemaV1<unknown, UI_MESSAGE['metadata']>;
  dataSchemas?: {
    [NAME in keyof InferUIMessageData<UI_MESSAGE> & string]?:
      | Validator<InferUIMessageData<UI_MESSAGE>[NAME]>
      | StandardSchemaV1<unknown, InferUIMessageData<UI_MESSAGE>[NAME]>;
  };
  tools?: {
    [NAME in keyof InferUIMessageTools<UI_MESSAGE> & string]?: Tool<
      InferUIMessageTools<UI_MESSAGE>[NAME]['input'],
      InferUIMessageTools<UI_MESSAGE>[NAME]['output']
    >;
  };
}): Promise<SafeValidateUIMessagesResult<UI_MESSAGE>> {
  try {
    if (messages == null) {
      return {
        success: false,
        error: new InvalidArgumentError({
          parameter: 'messages',
          value: messages,
          message: 'messages parameter must be provided',
        }),
      };
    }

    const validatedMessages = await validateTypes({
      value: messages,
      schema: z.array(uiMessageSchema),
    });

    if (metadataSchema) {
      for (const message of validatedMessages) {
        await validateTypes({
          value: message.metadata,
          schema: metadataSchema,
        });
      }
    }

    if (dataSchemas) {
      for (const message of validatedMessages) {
        const dataParts = message.parts.filter(part =>
          part.type.startsWith('data-'),
        ) as DataUIPart<InferUIMessageData<UI_MESSAGE>>[];

        for (const dataPart of dataParts) {
          const dataName = dataPart.type.slice(5);
          const dataSchema = dataSchemas[dataName];

          if (!dataSchema) {
            return {
              success: false,
              error: new TypeValidationError({
                value: dataPart.data,
                cause: `No data schema found for data part ${dataName}`,
              }),
            };
          }

          await validateTypes({
            value: dataPart.data,
            schema: dataSchema,
          });
        }
      }
    }

    if (tools) {
      for (const message of validatedMessages) {
        const toolParts = message.parts.filter(part =>
          part.type.startsWith('tool-'),
        ) as ToolUIPart<InferUIMessageTools<UI_MESSAGE>>[];

        for (const toolPart of toolParts) {
          const toolName = toolPart.type.slice(5);
          const tool = tools[toolName];

          if (!tool) {
            return {
              success: false,
              error: new TypeValidationError({
                value: toolPart.input,
                cause: `No tool schema found for tool part ${toolName}`,
              }),
            };
          }

          if (
            toolPart.state === 'input-available' ||
            toolPart.state === 'output-available' ||
            toolPart.state === 'output-error'
          ) {
            await validateTypes({
              value: toolPart.input,
              schema: tool.inputSchema,
            });
          }

          if (toolPart.state === 'output-available' && tool.outputSchema) {
            await validateTypes({
              value: toolPart.output,
              schema: tool.outputSchema,
            });
          }
        }
      }
    }

    return {
      success: true,
      data: validatedMessages as Array<UI_MESSAGE>,
    };
  } catch (error) {
    const err = error as Error;

    return {
      success: false,
      error: err,
    };
  }
}

/**
 * Validates a list of UI messages.
 *
 * Metadata, data parts, and generic tool call structures are only validated if
 * the corresponding schemas are provided. Otherwise, they are assumed to be
 * valid.
 */
export async function validateUIMessages<UI_MESSAGE extends UIMessage>({
  messages,
  metadataSchema,
  dataSchemas,
  tools,
}: {
  messages: unknown;
  metadataSchema?:
    | Validator<UIMessage['metadata']>
    | StandardSchemaV1<unknown, UI_MESSAGE['metadata']>;
  dataSchemas?: {
    [NAME in keyof InferUIMessageData<UI_MESSAGE> & string]?:
      | Validator<InferUIMessageData<UI_MESSAGE>[NAME]>
      | StandardSchemaV1<unknown, InferUIMessageData<UI_MESSAGE>[NAME]>;
  };
  tools?: {
    [NAME in keyof InferUIMessageTools<UI_MESSAGE> & string]?: Tool<
      InferUIMessageTools<UI_MESSAGE>[NAME]['input'],
      InferUIMessageTools<UI_MESSAGE>[NAME]['output']
    >;
  };
}): Promise<Array<UI_MESSAGE>> {
  const response = await safeValidateUIMessages({
    messages,
    metadataSchema,
    dataSchemas,
    tools,
  });

  if (!response.success) throw response.error;

  return response.data;
}
