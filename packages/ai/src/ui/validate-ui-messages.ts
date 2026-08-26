import { TypeValidationError, type JSONObject } from '@ai-sdk/provider';
import {
  lazySchema,
  safeValidateTypes,
  validateTypes,
  zodSchema,
  type FlexibleSchema,
  type Tool,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error';
import { jsonValueSchema } from '../types/json-value';
import { getOwn } from '../util/get-own';
import { providerMetadataSchema } from '../types/provider-metadata';
import { z, type ZodType } from '../util/zod';
import type {
  DataUIPart,
  DynamicToolUIPart,
  InferUIMessageData,
  InferUIMessageTools,
  ToolUIPart,
  UIMessage,
} from './ui-messages';

const toolMetadataSchema: ZodType<JSONObject> = z.record(
  z.string(),
  jsonValueSchema.optional(),
);

const providerReferenceSchema = z.record(z.string(), z.string());

function isEmptyObject(value: unknown): value is Record<string, never> {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function asDynamicToolPart(toolPart: ToolUIPart): DynamicToolUIPart {
  const { type, ...part } = toolPart;

  return {
    ...part,
    type: 'dynamic-tool',
    toolName: type.slice(5),
  } as DynamicToolUIPart;
}

const uiMessagesSchema = lazySchema(() =>
  zodSchema(
    z
      .array(
        z
          .object({
            id: z.string(),
            role: z.enum(['system', 'user', 'assistant']),
            metadata: z.unknown().optional(),
            parts: z.array(
              z.union([
                z.object({
                  type: z.literal('text'),
                  text: z.string(),
                  state: z.enum(['streaming', 'done']).optional(),
                  providerMetadata: providerMetadataSchema.optional(),
                }),
                z.object({
                  type: z.literal('reasoning'),
                  id: z.string().optional(),
                  text: z.string(),
                  state: z.enum(['streaming', 'done']).optional(),
                  providerMetadata: providerMetadataSchema.optional(),
                }),
                z.object({
                  type: z.literal('custom'),
                  kind: z.string(),
                  providerMetadata: providerMetadataSchema.optional(),
                }),
                z.object({
                  type: z.literal('source-url'),
                  sourceId: z.string(),
                  url: z.string(),
                  title: z.string().optional(),
                  providerMetadata: providerMetadataSchema.optional(),
                }),
                z.object({
                  type: z.literal('source-document'),
                  sourceId: z.string(),
                  mediaType: z.string(),
                  title: z.string(),
                  filename: z.string().optional(),
                  providerMetadata: providerMetadataSchema.optional(),
                }),
                z.object({
                  type: z.literal('file'),
                  mediaType: z.string(),
                  filename: z.string().optional(),
                  url: z.string(),
                  providerReference: providerReferenceSchema.optional(),
                  providerMetadata: providerMetadataSchema.optional(),
                }),
                z.object({
                  type: z.literal('reasoning-file'),
                  mediaType: z.string(),
                  url: z.string(),
                  providerMetadata: providerMetadataSchema.optional(),
                }),
                z.object({
                  type: z.literal('step-start'),
                }),
                z.object({
                  type: z.string().startsWith('data-'),
                  id: z.string().optional(),
                  data: z.unknown(),
                }),
                z.object({
                  type: z.literal('dynamic-tool'),
                  toolName: z.string(),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('input-streaming'),
                  input: z.unknown().optional(),
                  providerExecuted: z.boolean().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  output: z.never().optional(),
                  errorText: z.never().optional(),
                  approval: z.never().optional(),
                }),
                z.object({
                  type: z.literal('dynamic-tool'),
                  toolName: z.string(),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('input-available'),
                  input: z.unknown(),
                  providerExecuted: z.boolean().optional(),
                  output: z.never().optional(),
                  errorText: z.never().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  approval: z.never().optional(),
                }),
                z.object({
                  type: z.literal('dynamic-tool'),
                  toolName: z.string(),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('approval-requested'),
                  input: z.unknown(),
                  providerExecuted: z.boolean().optional(),
                  output: z.never().optional(),
                  errorText: z.never().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  approval: z.object({
                    id: z.string(),
                    approved: z.never().optional(),
                    requestReason: z.string().optional(),
                    reason: z.never().optional(),
                    isAutomatic: z.boolean().optional(),
                    signature: z.string().optional(),
                  }),
                }),
                z.object({
                  type: z.literal('dynamic-tool'),
                  toolName: z.string(),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('approval-responded'),
                  input: z.unknown(),
                  providerExecuted: z.boolean().optional(),
                  output: z.never().optional(),
                  errorText: z.never().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  approval: z.object({
                    id: z.string(),
                    approved: z.boolean(),
                    requestReason: z.string().optional(),
                    reason: z.string().optional(),
                    isAutomatic: z.boolean().optional(),
                    signature: z.string().optional(),
                  }),
                }),
                z.object({
                  type: z.literal('dynamic-tool'),
                  toolName: z.string(),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('output-available'),
                  input: z.unknown(),
                  providerExecuted: z.boolean().optional(),
                  output: z.unknown(),
                  errorText: z.never().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  resultProviderMetadata: providerMetadataSchema.optional(),
                  preliminary: z.boolean().optional(),
                  approval: z
                    .object({
                      id: z.string(),
                      approved: z.literal(true),
                      requestReason: z.string().optional(),
                      reason: z.string().optional(),
                      isAutomatic: z.boolean().optional(),
                      signature: z.string().optional(),
                    })
                    .optional(),
                }),
                z.object({
                  type: z.literal('dynamic-tool'),
                  toolName: z.string(),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('output-error'),
                  input: z.unknown().optional(),
                  rawInput: z.unknown().optional(),
                  providerExecuted: z.boolean().optional(),
                  output: z.never().optional(),
                  errorText: z.string(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  resultProviderMetadata: providerMetadataSchema.optional(),
                  approval: z
                    .object({
                      id: z.string(),
                      approved: z.literal(true),
                      requestReason: z.string().optional(),
                      reason: z.string().optional(),
                      isAutomatic: z.boolean().optional(),
                      signature: z.string().optional(),
                    })
                    .optional(),
                }),
                z.object({
                  type: z.literal('dynamic-tool'),
                  toolName: z.string(),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('output-denied'),
                  input: z.unknown(),
                  providerExecuted: z.boolean().optional(),
                  output: z.never().optional(),
                  errorText: z.never().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  approval: z.object({
                    id: z.string(),
                    approved: z.literal(false),
                    requestReason: z.string().optional(),
                    reason: z.string().optional(),
                    isAutomatic: z.boolean().optional(),
                    signature: z.string().optional(),
                  }),
                }),
                z.object({
                  type: z.string().startsWith('tool-'),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('input-streaming'),
                  providerExecuted: z.boolean().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  input: z.unknown().optional(),
                  output: z.never().optional(),
                  errorText: z.never().optional(),
                  approval: z.never().optional(),
                }),
                z.object({
                  type: z.string().startsWith('tool-'),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('input-available'),
                  providerExecuted: z.boolean().optional(),
                  input: z.unknown(),
                  output: z.never().optional(),
                  errorText: z.never().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  approval: z.never().optional(),
                }),
                z.object({
                  type: z.string().startsWith('tool-'),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('approval-requested'),
                  input: z.unknown(),
                  providerExecuted: z.boolean().optional(),
                  output: z.never().optional(),
                  errorText: z.never().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  approval: z.object({
                    id: z.string(),
                    approved: z.never().optional(),
                    requestReason: z.string().optional(),
                    reason: z.never().optional(),
                    isAutomatic: z.boolean().optional(),
                    signature: z.string().optional(),
                  }),
                }),
                z.object({
                  type: z.string().startsWith('tool-'),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('approval-responded'),
                  input: z.unknown(),
                  providerExecuted: z.boolean().optional(),
                  output: z.never().optional(),
                  errorText: z.never().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  approval: z.object({
                    id: z.string(),
                    approved: z.boolean(),
                    requestReason: z.string().optional(),
                    reason: z.string().optional(),
                    isAutomatic: z.boolean().optional(),
                    signature: z.string().optional(),
                  }),
                }),
                z.object({
                  type: z.string().startsWith('tool-'),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('output-available'),
                  providerExecuted: z.boolean().optional(),
                  input: z.unknown(),
                  output: z.unknown(),
                  errorText: z.never().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  resultProviderMetadata: providerMetadataSchema.optional(),
                  preliminary: z.boolean().optional(),
                  approval: z
                    .object({
                      id: z.string(),
                      approved: z.literal(true),
                      requestReason: z.string().optional(),
                      reason: z.string().optional(),
                      isAutomatic: z.boolean().optional(),
                      signature: z.string().optional(),
                    })
                    .optional(),
                }),
                z.object({
                  type: z.string().startsWith('tool-'),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('output-error'),
                  providerExecuted: z.boolean().optional(),
                  input: z.unknown().optional(),
                  rawInput: z.unknown().optional(),
                  output: z.never().optional(),
                  errorText: z.string(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  resultProviderMetadata: providerMetadataSchema.optional(),
                  approval: z
                    .object({
                      id: z.string(),
                      approved: z.literal(true),
                      requestReason: z.string().optional(),
                      reason: z.string().optional(),
                      isAutomatic: z.boolean().optional(),
                      signature: z.string().optional(),
                    })
                    .optional(),
                }),
                z.object({
                  type: z.string().startsWith('tool-'),
                  toolCallId: z.string(),
                  toolMetadata: toolMetadataSchema.optional(),
                  state: z.literal('output-denied'),
                  providerExecuted: z.boolean().optional(),
                  input: z.unknown(),
                  output: z.never().optional(),
                  errorText: z.never().optional(),
                  callProviderMetadata: providerMetadataSchema.optional(),
                  approval: z.object({
                    id: z.string(),
                    approved: z.literal(false),
                    requestReason: z.string().optional(),
                    reason: z.string().optional(),
                    isAutomatic: z.boolean().optional(),
                    signature: z.string().optional(),
                  }),
                }),
              ]),
            ),
          })
          .superRefine((message, context) => {
            if (message.role !== 'assistant' && message.parts.length === 0) {
              context.addIssue({
                origin: 'array',
                code: 'too_small',
                minimum: 1,
                inclusive: true,
                input: message.parts,
                path: ['parts'],
                message: 'Message must contain at least one part',
              });
            }
          }),
      )
      .nonempty('Messages array must not be empty'),
  ),
);

export type SafeValidateUIMessagesResult<UI_MESSAGE extends UIMessage> =
  | {
      success: true;
      data: Array<UI_MESSAGE>;
    }
  | {
      success: false;
      error: Error;
    };

type ValidateUIMessagesOptions<UI_MESSAGE extends UIMessage> = {
  messages: unknown;
  metadataSchema?: FlexibleSchema<UIMessage['metadata']>;
  dataSchemas?: {
    [NAME in keyof InferUIMessageData<UI_MESSAGE> & string]?: FlexibleSchema<
      InferUIMessageData<UI_MESSAGE>[NAME]
    >;
  };
  tools?: {
    [NAME in keyof InferUIMessageTools<UI_MESSAGE> & string]?: Tool<
      InferUIMessageTools<UI_MESSAGE>[NAME]['input'],
      InferUIMessageTools<UI_MESSAGE>[NAME]['output']
    >;
  };
};

async function safeValidateUIMessagesInternal<UI_MESSAGE extends UIMessage>(
  {
    messages,
    metadataSchema,
    dataSchemas,
    tools,
  }: ValidateUIMessagesOptions<UI_MESSAGE>,
  {
    convertMissingTerminalToolsToDynamic,
  }: {
    convertMissingTerminalToolsToDynamic: boolean;
  },
): Promise<SafeValidateUIMessagesResult<UI_MESSAGE>> {
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
      schema: uiMessagesSchema,
    });

    if (metadataSchema) {
      for (const [msgIdx, message] of validatedMessages.entries()) {
        await validateTypes({
          value: message.metadata,
          schema: metadataSchema,
          context: {
            field: `messages[${msgIdx}].metadata`,
            entityId: message.id,
          },
        });
      }
    }

    const shouldValidateToolParts =
      tools != null || convertMissingTerminalToolsToDynamic;

    if (dataSchemas || shouldValidateToolParts) {
      for (const [msgIdx, message] of validatedMessages.entries()) {
        for (const [partIdx, part] of message.parts.entries()) {
          // Data part validation
          if (dataSchemas && part.type.startsWith('data-')) {
            const dataPart = part as DataUIPart<InferUIMessageData<UI_MESSAGE>>;
            const dataName = dataPart.type.slice(5);
            const dataSchema = dataSchemas[dataName];

            if (!dataSchema) {
              return {
                success: false,
                error: new TypeValidationError({
                  value: dataPart.data,
                  cause: `No data schema found for data part ${dataName}`,
                  context: {
                    field: `messages[${msgIdx}].parts[${partIdx}].data`,
                    entityName: dataName,
                    entityId: dataPart.id,
                  },
                }),
              };
            }

            await validateTypes({
              value: dataPart.data,
              schema: dataSchema,
              context: {
                field: `messages[${msgIdx}].parts[${partIdx}].data`,
                entityName: dataName,
                entityId: dataPart.id,
              },
            });
          }

          // Tool part validation
          if (shouldValidateToolParts && part.type.startsWith('tool-')) {
            const toolPart = part as ToolUIPart<
              InferUIMessageTools<UI_MESSAGE>
            >;
            const toolName = toolPart.type.slice(5);
            const tool = tools == null ? undefined : getOwn(tools, toolName);
            const isTerminal =
              toolPart.state === 'output-available' ||
              toolPart.state === 'output-error' ||
              toolPart.state === 'output-denied';

            if (!tool && isTerminal) {
              if (tools != null || convertMissingTerminalToolsToDynamic) {
                // Persisted terminal history can reference tools that are no
                // longer registered. Normalize those parts so callers do not
                // receive unvalidated values under current static tool types.
                message.parts[partIdx] = asDynamicToolPart(
                  toolPart,
                ) as (typeof message.parts)[number];
              }
              continue;
            }

            // TODO support dynamic tools
            if (!tool) {
              return {
                success: false,
                error: new TypeValidationError({
                  value: toolPart.input,
                  cause: `No tool schema found for tool part ${toolName}`,
                  context: {
                    field: `messages[${msgIdx}].parts[${partIdx}].input`,
                    entityName: toolName,
                    entityId: toolPart.toolCallId,
                  },
                }),
              };
            }

            const inputValidationContext = {
              field: `messages[${msgIdx}].parts[${partIdx}].input`,
              entityName: toolName,
              entityId: toolPart.toolCallId,
            };
            let convertToDynamic = false;

            // Tool input validation
            if (toolPart.state === 'output-error') {
              // Failed calls can retain invalid input. Keep them loadable, but
              // expose incompatible input as unknown instead of the current
              // static tool input type.
              if (toolPart.input !== undefined) {
                const result = await safeValidateTypes({
                  value: toolPart.input,
                  schema: tool.inputSchema,
                  context: inputValidationContext,
                });
                convertToDynamic = !result.success;
              }
            } else if (toolPart.state === 'output-available') {
              const result = await safeValidateTypes({
                value: toolPart.input,
                schema: tool.inputSchema,
                context: inputValidationContext,
              });

              if (!result.success) {
                // Empty terminal input can represent aborted or incomplete
                // history whose input was never streamed. Preserve it without
                // claiming that it matches the current static input type.
                if (isEmptyObject(toolPart.input)) {
                  convertToDynamic = true;
                } else {
                  throw result.error;
                }
              }
            } else if (
              toolPart.state === 'input-available' ||
              toolPart.state === 'approval-requested' ||
              toolPart.state === 'approval-responded' ||
              toolPart.state === 'output-denied'
            ) {
              await validateTypes({
                value: toolPart.input,
                schema: tool.inputSchema,
                context: inputValidationContext,
              });
            }

            // Tool output validation
            if (toolPart.state === 'output-available' && tool.outputSchema) {
              await validateTypes({
                value: toolPart.output,
                schema: tool.outputSchema,
                context: {
                  field: `messages[${msgIdx}].parts[${partIdx}].output`,
                  entityName: toolName,
                  entityId: toolPart.toolCallId,
                },
              });
            }

            if (convertToDynamic) {
              message.parts[partIdx] = asDynamicToolPart(
                toolPart,
              ) as (typeof message.parts)[number];
            }
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
 * Validates a list of UI messages like `validateUIMessages`,
 * but instead of throwing it returns `{ success: true, data }`
 * or `{ success: false, error }`.
 */
export async function safeValidateUIMessages<UI_MESSAGE extends UIMessage>(
  options: ValidateUIMessagesOptions<UI_MESSAGE>,
): Promise<SafeValidateUIMessagesResult<UI_MESSAGE>> {
  return safeValidateUIMessagesInternal(options, {
    convertMissingTerminalToolsToDynamic: false,
  });
}

/**
 * Validates a list of UI messages.
 *
 * Metadata, data parts, and generic tool call structures are only validated if
 * the corresponding schemas are provided. Otherwise, they are assumed to be
 * valid.
 */
export async function validateUIMessages<UI_MESSAGE extends UIMessage>(
  options: ValidateUIMessagesOptions<UI_MESSAGE>,
): Promise<Array<UI_MESSAGE>> {
  const response = await safeValidateUIMessages(options);

  if (!response.success) throw response.error;

  return response.data;
}

export async function validateUIMessagesForAgent<UI_MESSAGE extends UIMessage>(
  options: ValidateUIMessagesOptions<UI_MESSAGE>,
): Promise<Array<UI_MESSAGE>> {
  const response = await safeValidateUIMessagesInternal(options, {
    // Agent tool sets can include ephemeral tools (for example, tools from a
    // disconnected MCP server), so terminal history is converted to dynamic
    // tool parts when those tools are no longer registered.
    convertMissingTerminalToolsToDynamic: true,
  });

  if (!response.success) throw response.error;

  return response.data;
}
