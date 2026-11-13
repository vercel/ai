import { citationSchema } from '../types/citation';
import { TypeValidationError, type JSONObject } from '@ai-sdk/provider';
import {
  lazySchema,
  safeValidateTypes,
  validateTypes,
  zodSchema,
  type FlexibleSchema,
  type MaybePromiseLike,
  type Tool,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error';
import { jsonValueSchema } from '../types/json-value';
import { getOwn } from '../util/get-own';
import { isDeepEqualData } from '../util/is-deep-equal-data';
import { providerMetadataSchema as providerMetadataRecordSchema } from '../types/provider-metadata';
import { z, type ZodOutput, type ZodType } from '../util/zod';
import type {
  DataUIPart,
  DynamicToolUIPart,
  InferUIMessageData,
  InferUIMessageTools,
  ToolUIPart,
  UIMessage,
} from './ui-messages';
import { markToolPartAsUnavailable } from './unavailable-tool';
import { warnIfUIMessageHasDeprecatedRawInput } from './warn-if-ui-message-has-deprecated-raw-input';

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
function withJsonValueCheck<SCHEMA extends ZodType>(
  schema: SCHEMA,
  jsonValuePath: string[] = [],
) {
  return z.pipe(
    z.unknown().check(context => {
      let jsonValue = context.value;
      for (const key of jsonValuePath) {
        jsonValue =
          jsonValue != null && typeof jsonValue === 'object'
            ? (jsonValue as Record<string, unknown>)[key]
            : undefined;
      }

      const invalidPath = findInvalidJsonValuePath(jsonValue);
      if (invalidPath != null) {
        context.issues.push({
          code: 'custom',
          message:
            'Invalid JSON value. Expected null, a string, a finite number, ' +
            'a boolean, an array, or an object.',
          input: context.value,
          path: [...jsonValuePath, ...invalidPath],
        });
      }
    }),
    schema,
  );
}

const toolMetadataRecordSchema: ZodType<JSONObject> = z.record(
  z.string(),
  z.optional(jsonValueSchema),
);

const toolMetadataSchema = withJsonValueCheck(toolMetadataRecordSchema);

const providerMetadataSchema = withJsonValueCheck(providerMetadataRecordSchema);

const providerReferenceSchema = z.record(z.string(), z.string());

const uiCitationSchema = withJsonValueCheck(citationSchema, [
  'source',
  'providerMetadata',
]);

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
function arrayUntilFirstInvalidElement<SCHEMA extends ZodType>(
  selectElementSchema: (element: unknown) => SCHEMA,
) {
  return z.pipe(
    z.array(z.unknown()),
    z.transform((elements: unknown[], context) => {
      const validatedElements: Array<ZodOutput<SCHEMA>> = [];

      for (const [index, element] of elements.entries()) {
        const result = z.safeParse(selectElementSchema(element), element);

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
    }),
  );
}

const uiMessagesSchema = lazySchema(() => {
  const approvalRequestedSchema = z.object({
    id: z.string(),
    approved: z.optional(z.never()),
    descriptor: z.optional(z.unknown()),
    requestReason: z.optional(z.string()),
    reason: z.optional(z.never()),
    isAutomatic: z.optional(z.boolean()),
    signature: z.optional(z.string()),
    inputSchemaInput: z.optional(z.unknown()),
  });
  const approvalRespondedSchema = z.extend(approvalRequestedSchema, {
    approved: z.boolean(),
    reason: z.optional(z.string()),
  });
  const approvalGrantedSchema = z.extend(approvalRespondedSchema, {
    approved: z.literal(true),
  });
  const approvalDeniedSchema = z.extend(approvalRespondedSchema, {
    approved: z.literal(false),
  });

  const steeringMessagePartSchema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      text: z.string(),
      providerMetadata: z.optional(providerMetadataSchema),
    }),
    z.object({
      type: z.literal('file'),
      mediaType: z.string(),
      filename: z.optional(z.string()),
      url: z.string(),
      providerReference: z.optional(providerReferenceSchema),
      providerMetadata: z.optional(providerMetadataSchema),
    }),
  ]);

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
        citations: z.optional(
          arrayUntilFirstInvalidElement(() => uiCitationSchema),
        ),
        state: z.optional(z.enum(['streaming', 'done'])),
        providerMetadata: z.optional(providerMetadataSchema),
      }),
      z.object({
        type: z.literal('reasoning'),
        id: z.optional(z.string()),
        text: z.string(),
        state: z.optional(z.enum(['streaming', 'done'])),
        providerMetadata: z.optional(providerMetadataSchema),
      }),
      z.object({
        type: z.literal('custom'),
        kind: z.string(),
        providerMetadata: z.optional(providerMetadataSchema),
      }),
      z.object({
        type: z.literal('source-url'),
        sourceId: z.string(),
        url: z.string(),
        title: z.optional(z.string()),
        providerMetadata: z.optional(providerMetadataSchema),
      }),
      z.object({
        type: z.literal('source-document'),
        sourceId: z.string(),
        mediaType: z.string(),
        title: z.string(),
        filename: z.optional(z.string()),
        providerMetadata: z.optional(providerMetadataSchema),
      }),
      z.object({
        type: z.literal('file'),
        mediaType: z.string(),
        filename: z.optional(z.string()),
        url: z.string(),
        providerReference: z.optional(providerReferenceSchema),
        providerMetadata: z.optional(providerMetadataSchema),
      }),
      z.object({
        type: z.literal('reasoning-file'),
        mediaType: z.string(),
        url: z.string(),
        providerMetadata: z.optional(providerMetadataSchema),
      }),
      z.object({
        type: z.literal('steering-message'),
        id: z.string(),
        parts: arrayUntilFirstInvalidElement(() => steeringMessagePartSchema),
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
    type: z.string().check(z.startsWith('data-')),
    id: z.optional(z.string()),
    data: z.unknown(),
  });

  const dynamicToolPartSchema = z.discriminatedUnion('state', [
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.optional(z.literal(false)),
      toolName: z.string(),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('input-streaming'),
      input: z.optional(z.unknown()),
      rawInput: z.optional(z.string()),
      inputEncoding: z.optional(z.enum(['json', 'text'])),
      providerExecuted: z.optional(z.boolean()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      output: z.optional(z.never()),
      errorText: z.optional(z.never()),
      approval: z.optional(z.never()),
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.optional(z.literal(false)),
      toolName: z.string(),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('input-available'),
      input: z.unknown(),
      providerExecuted: z.optional(z.boolean()),
      output: z.optional(z.never()),
      errorText: z.optional(z.never()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      approval: z.optional(z.never()),
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.optional(z.literal(false)),
      toolName: z.string(),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('approval-requested'),
      input: z.unknown(),
      providerExecuted: z.optional(z.boolean()),
      output: z.optional(z.never()),
      errorText: z.optional(z.never()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      approval: approvalRequestedSchema,
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.optional(z.literal(false)),
      toolName: z.string(),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('approval-responded'),
      input: z.unknown(),
      providerExecuted: z.optional(z.boolean()),
      output: z.optional(z.never()),
      errorText: z.optional(z.never()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      approval: approvalRespondedSchema,
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.optional(z.literal(false)),
      toolName: z.string(),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('output-available'),
      input: z.unknown(),
      providerExecuted: z.optional(z.boolean()),
      output: z.unknown(),
      errorText: z.optional(z.never()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      resultProviderMetadata: z.optional(providerMetadataSchema),
      preliminary: z.optional(z.boolean()),
      approval: z.optional(approvalGrantedSchema),
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.optional(z.literal(false)),
      toolName: z.string(),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('output-error'),
      input: z.optional(z.unknown()),
      rawInput: z.optional(z.unknown()),
      providerExecuted: z.optional(z.boolean()),
      output: z.optional(z.never()),
      errorText: z.string(),
      callProviderMetadata: z.optional(providerMetadataSchema),
      resultProviderMetadata: z.optional(providerMetadataSchema),
      approval: z.optional(approvalGrantedSchema),
    }),
    z.object({
      type: z.literal('dynamic-tool'),
      dynamic: z.optional(z.literal(false)),
      toolName: z.string(),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('output-denied'),
      input: z.unknown(),
      providerExecuted: z.optional(z.boolean()),
      output: z.optional(z.never()),
      errorText: z.optional(z.never()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      approval: approvalDeniedSchema,
    }),
  ]);

  const toolPartSchema = z.discriminatedUnion('state', [
    z.object({
      type: z.string().check(z.startsWith('tool-')),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('input-streaming'),
      providerExecuted: z.optional(z.boolean()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      input: z.optional(z.unknown()),
      rawInput: z.optional(z.string()),
      inputEncoding: z.optional(z.enum(['json', 'text'])),
      output: z.optional(z.never()),
      errorText: z.optional(z.never()),
      approval: z.optional(z.never()),
    }),
    z.object({
      type: z.string().check(z.startsWith('tool-')),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('input-available'),
      providerExecuted: z.optional(z.boolean()),
      input: z.unknown(),
      output: z.optional(z.never()),
      errorText: z.optional(z.never()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      approval: z.optional(z.never()),
    }),
    z.object({
      type: z.string().check(z.startsWith('tool-')),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('approval-requested'),
      input: z.unknown(),
      providerExecuted: z.optional(z.boolean()),
      output: z.optional(z.never()),
      errorText: z.optional(z.never()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      approval: approvalRequestedSchema,
    }),
    z.object({
      type: z.string().check(z.startsWith('tool-')),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('approval-responded'),
      input: z.unknown(),
      providerExecuted: z.optional(z.boolean()),
      output: z.optional(z.never()),
      errorText: z.optional(z.never()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      approval: approvalRespondedSchema,
    }),
    z.object({
      type: z.string().check(z.startsWith('tool-')),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('output-available'),
      providerExecuted: z.optional(z.boolean()),
      input: z.unknown(),
      output: z.unknown(),
      errorText: z.optional(z.never()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      resultProviderMetadata: z.optional(providerMetadataSchema),
      preliminary: z.optional(z.boolean()),
      approval: z.optional(approvalGrantedSchema),
    }),
    z.object({
      type: z.string().check(z.startsWith('tool-')),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('output-error'),
      providerExecuted: z.optional(z.boolean()),
      input: z.optional(z.unknown()),
      rawInput: z.optional(z.unknown()),
      output: z.optional(z.never()),
      errorText: z.string(),
      callProviderMetadata: z.optional(providerMetadataSchema),
      resultProviderMetadata: z.optional(providerMetadataSchema),
      approval: z.optional(approvalGrantedSchema),
    }),
    z.object({
      type: z.string().check(z.startsWith('tool-')),
      toolCallId: z.string(),
      title: z.optional(z.string()),
      toolMetadata: z.optional(toolMetadataSchema),
      state: z.literal('output-denied'),
      providerExecuted: z.optional(z.boolean()),
      input: z.unknown(),
      output: z.optional(z.never()),
      errorText: z.optional(z.never()),
      callProviderMetadata: z.optional(providerMetadataSchema),
      approval: approvalDeniedSchema,
    }),
  ]);

  const messageSchema = z
    .object({
      id: z.string(),
      role: z.enum(['system', 'user', 'assistant']),
      metadata: z.optional(z.unknown()),
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
    .check(context => {
      const message = context.value;
      if (message.role !== 'assistant' && message.parts.length === 0) {
        context.issues.push({
          continue: true,
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
    [NAME in keyof InferUIMessageTools<UI_MESSAGE> & string]?:
      | Tool<
          InferUIMessageTools<UI_MESSAGE>[NAME]['input'],
          InferUIMessageTools<UI_MESSAGE>[NAME]['output']
        >
      | {
          inputSchema: FlexibleSchema<
            InferUIMessageTools<UI_MESSAGE>[NAME]['input']
          >;
          outputSchema?: FlexibleSchema<
            InferUIMessageTools<UI_MESSAGE>[NAME]['output']
          >;
        };
  };
  experimental_refineToolInput?: {
    [NAME in keyof InferUIMessageTools<UI_MESSAGE> & string]?: (
      input: InferUIMessageTools<UI_MESSAGE>[NAME]['input'],
    ) => MaybePromiseLike<InferUIMessageTools<UI_MESSAGE>[NAME]['input']>;
  };
};

async function safeValidateUIMessagesInternal<UI_MESSAGE extends UIMessage>(
  {
    messages,
    metadataSchema,
    dataSchemas,
    tools,
    experimental_refineToolInput,
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

    warnIfUIMessageHasDeprecatedRawInput(validatedMessages);

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
                try {
                  const refine = getOwn(experimental_refineToolInput, toolName);
                  const reconstructedInput =
                    refine == null ? result.value : await refine(result.value);

                  if (!isDeepEqualData(reconstructedInput, toolPart.input)) {
                    inputError = new TypeValidationError({
                      value: toolPart.input,
                      cause:
                        'Tool input does not match the output reconstructed from inputSchemaInput.',
                      context: inputValidationContext,
                    });
                  }
                } catch (error) {
                  inputError = new TypeValidationError({
                    value: inputToValidate,
                    cause: error,
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
