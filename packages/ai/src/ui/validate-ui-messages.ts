import {
  TypeValidationContext,
  TypeValidationError,
  type JSONObject,
} from '@ai-sdk/provider';
import {
  lazySchema,
  safeValidateTypes,
  StandardSchemaV1,
  validateTypes,
  zodSchema,
  type FlexibleSchema,
  type Tool,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { InvalidArgumentError } from '../error';
import { jsonValueSchema } from '../types/json-value';
import { getOwn } from '../util/get-own';
import { isDeepEqualData } from '../util/is-deep-equal-data';
import { providerMetadataSchema as providerMetadataRecordSchema } from '../types/provider-metadata';
import type {
  DataUIPart,
  DynamicToolUIPart,
  InferUIMessageData,
  InferUIMessageTools,
  ToolUIPart,
  UIMessage,
} from './ui-messages';
import { markToolPartAsUnavailable } from './unavailable-tool';

/**
 * Returns the path to the first value that can never be part of a JSON value
 * (a non-finite number, bigint, symbol, or function), if there is one.
 */
function findInvalidJsonValuePath(
  value: unknown,
  path: PropertyKey[] = [],
  visited = new WeakSet<object>(),
): PropertyKey[] | undefined {
  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? undefined : [...path];
    case 'bigint':
    case 'symbol':
    case 'function':
      return [...path];
    case 'object': {
      if (value === null || visited.has(value)) {
        return undefined;
      }
      visited.add(value);

      const keys = Array.isArray(value) ? value.keys() : Object.keys(value);
      for (const key of keys) {
        // record schemas ignore `__proto__` keys:
        if (key === '__proto__') continue;

        path.push(key);
        const invalidPath = findInvalidJsonValuePath(
          (value as Record<PropertyKey, unknown>)[key],
          path,
          visited,
        );
        if (invalidPath != null) return invalidPath;
        path.pop();
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Rejects values that contain an invalid JSON value with a single issue before
 * `schema` validates them.
 *
 * The JSON value schema is a recursive union. It reports the issues of every
 * alternative at every nesting level around an invalid value, so the size of a
 * validation error would grow much faster than the (untrusted) input.
 *
 * @param jsonValuePath - Path from the validated value to the JSON value.
 */
function withJsonValueCheck<SCHEMA extends z.ZodType>(
  schema: SCHEMA,
  jsonValuePath: string[] = [],
) {
  return z
    .unknown()
    .check(context => {
      let jsonValue = context.value;
      for (const key of jsonValuePath) {
        jsonValue =
          jsonValue != null && typeof jsonValue === 'object'
            ? (jsonValue as Record<string, unknown>)[key]
            : undefined;
      }

      const invalidPath = findInvalidJsonValuePath(jsonValue);
      if (invalidPath != null) {
        // Pushing the issue instead of adding it with `context.addIssue` aborts
        // the pipe, so the recursive schema does not run:
        context.issues.push({
          code: 'custom',
          message:
            'Invalid JSON value. Expected null, a string, a finite number, ' +
            'a boolean, an array, or an object.',
          input: context.value,
          path: [...jsonValuePath, ...invalidPath],
        });
      }
    })
    .pipe(schema);
}

const toolMetadataRecordSchema: z.ZodType<JSONObject> = z.record(
  z.string(),
  jsonValueSchema.optional(),
);

const toolMetadataSchema = withJsonValueCheck(toolMetadataRecordSchema);

const providerMetadataSchema = withJsonValueCheck(providerMetadataRecordSchema);

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

  return markToolPartAsUnavailable({
    ...part,
    type: 'dynamic-tool',
    toolName: type.slice(5),
  } as DynamicToolUIPart);
}

function getToolPartInputSchemaInput(
  toolPart: ToolUIPart,
): { value: unknown } | undefined {
  return toolPart.approval != null &&
    Object.prototype.hasOwnProperty.call(toolPart.approval, 'inputSchemaInput')
    ? { value: toolPart.approval.inputSchemaInput }
    : undefined;
}

/**
 * Creates an array schema that validates its elements in order and stops at
 * the first invalid element.
 *
 * UI messages are untrusted input. `z.array` validates every element and
 * reports the issues of all invalid elements, so the memory and time needed to
 * reject an input would grow with the number of invalid elements in it.
 */
function arrayUntilFirstInvalidElement<SCHEMA extends z.ZodType>(
  selectElementSchema: (element: unknown) => SCHEMA,
) {
  return z.array(z.unknown()).transform((elements: unknown[], context) => {
    const validatedElements: Array<z.output<SCHEMA>> = [];

    for (const [index, element] of elements.entries()) {
      const result = selectElementSchema(element).safeParse(element);

      if (!result.success) {
        for (const issue of result.error.issues) {
          // re-report the element's issues with their path in the array:
          context.issues.push({
            ...issue,
            path: [index, ...issue.path],
          } as (typeof context.issues)[number]);
        }

        return z.NEVER;
      }

      validatedElements.push(result.data);
    }

    return validatedElements;
  });
}

const uiMessagesSchema = lazySchema(() => {
  const approvalRequestedSchema = z.object({
    id: z.string(),
    approved: z.never().optional(),
    descriptor: z.unknown().optional(),
    reason: z.never().optional(),
    signature: z.string().optional(),
    inputSchemaInput: z.unknown().optional(),
  });
  const approvalRespondedSchema = approvalRequestedSchema.extend({
    approved: z.boolean(),
    reason: z.string().optional(),
  });
  const approvalGrantedSchema = approvalRespondedSchema.extend({
    approved: z.literal(true),
  });
  const approvalDeniedSchema = approvalRespondedSchema.extend({
    approved: z.literal(false),
  });

  // Parts with a missing or unknown type are validated against the static part
  // schema, whose default error would only mention the static part types.
  const invalidPartTypeMessage =
    'Invalid UI message part type. Expected a known part type ' +
    '(for example "text" or "dynamic-tool") or a type starting with "data-" or "tool-".';

  const staticPartSchema = z.discriminatedUnion(
    'type',
    [
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
        providerMetadata: providerMetadataSchema.optional(),
      }),
      z.object({
        type: z.literal('step-start'),
      }),
    ],
    {
      error: issue =>
        issue.code === 'invalid_union' ? invalidPartTypeMessage : undefined,
    },
  );

  const dataPartSchema = z.object({
    type: z.string().startsWith('data-'),
    id: z.string().optional(),
    data: z.unknown(),
  });

  const dynamicToolPartSchema = z.discriminatedUnion('state', [
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.literal(false).optional(),
      toolName: z.string(),
      toolCallId: z.string(),
      toolMetadata: toolMetadataSchema.optional(),
      state: z.literal('input-streaming'),
      input: z.unknown().optional(),
      rawInput: z.string().optional(),
      inputEncoding: z.enum(['json', 'text']).optional(),
      providerExecuted: z.boolean().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      approval: z.never().optional(),
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.literal(false).optional(),
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
      dynamic: z.literal(false).optional(),
      toolName: z.string(),
      toolCallId: z.string(),
      toolMetadata: toolMetadataSchema.optional(),
      state: z.literal('approval-requested'),
      input: z.unknown(),
      providerExecuted: z.boolean().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalRequestedSchema,
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.literal(false).optional(),
      toolName: z.string(),
      toolCallId: z.string(),
      toolMetadata: toolMetadataSchema.optional(),
      state: z.literal('approval-responded'),
      input: z.unknown(),
      providerExecuted: z.boolean().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalRespondedSchema,
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.literal(false).optional(),
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
      approval: approvalGrantedSchema.optional(),
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.literal(false).optional(),
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
      approval: approvalGrantedSchema.optional(),
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.literal(false).optional(),
      toolName: z.string(),
      toolCallId: z.string(),
      toolMetadata: toolMetadataSchema.optional(),
      state: z.literal('output-denied'),
      input: z.unknown(),
      providerExecuted: z.boolean().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalDeniedSchema,
    }),
  ]);

  const toolPartSchema = z.discriminatedUnion('state', [
    z.object({
      type: z.string().startsWith('tool-'),
      toolCallId: z.string(),
      toolMetadata: toolMetadataSchema.optional(),
      state: z.literal('input-streaming'),
      providerExecuted: z.boolean().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      input: z.unknown().optional(),
      rawInput: z.string().optional(),
      inputEncoding: z.enum(['json', 'text']).optional(),
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
      approval: approvalRequestedSchema,
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
      approval: approvalRespondedSchema,
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
      approval: approvalGrantedSchema.optional(),
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
      approval: approvalGrantedSchema.optional(),
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
      approval: approvalDeniedSchema,
    }),
  ]);

  const messageSchema = z
    .object({
      id: z.string(),
      role: z.enum(['system', 'user', 'assistant']),
      metadata: z.unknown().optional(),
      // Validate each part only against the schemas for its type. A union of
      // all part schemas would report the issues of every alternative for
      // each invalid part.
      parts: arrayUntilFirstInvalidElement((part: unknown) => {
        const type = (part as { type?: unknown } | null | undefined)?.type;

        if (typeof type === 'string') {
          if (type.startsWith('data-')) return dataPartSchema;
          if (type.startsWith('tool-')) return toolPartSchema;
          if (type === 'dynamic-tool') return dynamicToolPartSchema;
        }

        return staticPartSchema;
      }),
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
    });

  return zodSchema(
    arrayUntilFirstInvalidElement(() => messageSchema).check(
      z.minLength(1, 'Messages array must not be empty'),
    ),
  );
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
        message.metadata = await validateTypes({
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

            dataPart.data = await validateTypes({
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
            const tool = getOwn(tools, toolName);
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
            const inputSchemaInput = getToolPartInputSchemaInput(toolPart);
            const inputToValidate =
              inputSchemaInput == null
                ? toolPart.input
                : inputSchemaInput.value;
            let convertToDynamic = false;

            // Tool input validation
            if (
              toolPart.state !== 'input-streaming' &&
              (toolPart.state !== 'output-error' ||
                inputSchemaInput != null ||
                toolPart.input !== undefined)
            ) {
              const result = await safeValidateTypes({
                value: inputToValidate,
                schema: tool.inputSchema,
                context: inputValidationContext,
              });

              let inputError: TypeValidationError | undefined;
              if (!result.success) {
                inputError = result.error;
              } else if (inputSchemaInput != null) {
                if (!isDeepEqualData(result.value, toolPart.input)) {
                  inputError = new TypeValidationError({
                    value: toolPart.input,
                    cause:
                      'Tool input does not match the output reconstructed from inputSchemaInput.',
                    context: inputValidationContext,
                  });
                }
              }

              if (inputError != null) {
                // Failed calls and empty terminal inputs must remain loadable,
                // but must not claim to match the current static input type.
                if (
                  toolPart.state === 'output-error' ||
                  (toolPart.state === 'output-available' &&
                    isEmptyObject(toolPart.input))
                ) {
                  convertToDynamic = true;
                } else {
                  throw inputError;
                }
              }
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
