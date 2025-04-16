import {
  JSONParseError,
  JSONValue,
  TypeValidationError,
} from '@ai-sdk/provider';
import { createIdGenerator, safeParseJSON } from '@ai-sdk/provider-utils';
import { Schema } from '../util';
import { z } from 'zod';
import { NoObjectGeneratedError } from '../../errors/no-object-generated-error';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareRetries } from '../prompt/prepare-retries';
import { Prompt } from '../prompt/prompt';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import {
  CallWarning,
  FinishReason,
  LanguageModel,
  LogProbs,
  ProviderMetadata,
} from '../types';
import { LanguageModelRequestMetadata } from '../types/language-model-request-metadata';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { ProviderOptions } from '../types/provider-metadata';
import { calculateLanguageModelUsage } from '../types/usage';
import { prepareResponseHeaders } from '../util/prepare-response-headers';
import { GenerateObjectResult } from './generate-object-result';
import { injectJsonInstruction } from './inject-json-instruction';
import { getOutputStrategy } from './output-strategy';
import { validateObjectGenerationInput } from './validate-object-generation-input';
import { extractContentText } from '../generate-text/extract-content-text';

const originalGenerateId = createIdGenerator({ prefix: 'aiobj', size: 24 });

/**
A function that attempts to repair the raw output of the mode
to enable JSON parsing.

Should return the repaired text or null if the text cannot be repaired.
     */
export type RepairTextFunction = (options: {
  text: string;
  error: JSONParseError | TypeValidationError;
}) => Promise<string | null>;

/**
Generate a structured, typed object for a given prompt and schema using a language model.

This function does not stream the output. If you want to stream the output, use `streamObject` instead.

@returns
A result object that contains the generated object, the finish reason, the token usage, and additional information.
 */
export async function generateObject<
  TYPE extends SCHEMA extends z.Schema
    ? Output extends 'array'
      ? Array<z.infer<SCHEMA>>
      : z.infer<SCHEMA>
    : SCHEMA extends Schema<infer T>
      ? Output extends 'array'
        ? Array<T>
        : T
      : never,
  SCHEMA extends z.Schema | Schema = z.Schema<JSONValue>,
  Output extends 'object' | 'array' | 'enum' | 'no-schema' = TYPE extends string
    ? 'enum'
    : 'object',
>(
  options: Omit<CallSettings, 'stopSequences'> &
    Prompt &
    (Output extends 'enum'
      ? {
          /**
The enum values that the model should use.
          */
          enum: Array<TYPE>;
          mode?: 'json';
          output: 'enum';
        }
      : Output extends 'no-schema'
        ? {}
        : {
            /**
The schema of the object that the model should generate.
            */
            schema: SCHEMA;

            /**
Optional name of the output that should be generated.
Used by some providers for additional LLM guidance, e.g.
via tool or schema name.
            */
            schemaName?: string;

            /**
Optional description of the output that should be generated.
Used by some providers for additional LLM guidance, e.g.
via tool or schema description.
            */
            schemaDescription?: string;

            /**
The mode to use for object generation.

The schema is converted into a JSON schema and used in one of the following ways

- 'auto': The provider will choose the best mode for the model.
- 'tool': A tool with the JSON schema as parameters is provided and the provider is instructed to use it.
- 'json': The JSON schema and an instruction are injected into the prompt. If the provider supports JSON mode, it is enabled. If the provider supports JSON grammars, the grammar is used.

Please note that most providers do not support all modes.

Default and recommended: 'auto' (best mode for the model).
            */
            mode?: 'auto' | 'json' | 'tool';
          }) & {
      output?: Output;

      /**
The language model to use.
     */
      model: LanguageModel;
      /**
A function that attempts to repair the raw output of the mode
to enable JSON parsing.
     */
      experimental_repairText?: RepairTextFunction;

      /**
Optional telemetry configuration (experimental).
       */

      experimental_telemetry?: TelemetrySettings;

      /**
Additional provider-specific options. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
      providerOptions?: ProviderOptions;

      /**
       * Internal. For test use only. May change without notice.
       */
      _internal?: {
        generateId?: () => string;
        currentDate?: () => Date;
      };
    },
): Promise<GenerateObjectResult<TYPE>>;

export async function generateObject<SCHEMA, RESULT>({
  model,
  enum: enumValues, // rename bc enum is reserved by typescript
  schema: inputSchema,
  schemaName,
  schemaDescription,
  mode,
  output = 'object',
  system,
  prompt,
  messages,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  experimental_repairText: repairText,
  experimental_telemetry: telemetry,
  providerOptions,
  _internal: {
    generateId = originalGenerateId,
    currentDate = () => new Date(),
  } = {},
  ...settings
}: Omit<CallSettings, 'stopSequences'> &
  Prompt & {
    /**
     * The expected structure of the output.
     *
     * - 'object': Generate a single object that conforms to the schema.
     * - 'array': Generate an array of objects that conform to the schema.
     * - 'no-schema': Generate any JSON object. No schema is specified.
     *
     * Default is 'object' if not specified.
     */
    output?: 'object' | 'array' | 'enum' | 'no-schema';

    model: LanguageModel;
    enum?: Array<SCHEMA>;
    schema?: z.Schema<SCHEMA> | Schema<SCHEMA>;
    schemaName?: string;
    schemaDescription?: string;
    mode?: 'auto' | 'json' | 'tool';
    experimental_repairText?: RepairTextFunction;
    experimental_telemetry?: TelemetrySettings;
    providerOptions?: ProviderOptions;

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      generateId?: () => string;
      currentDate?: () => Date;
    };
  }): Promise<GenerateObjectResult<RESULT>> {
  validateObjectGenerationInput({
    output,
    mode,
    schema: inputSchema,
    schemaName,
    schemaDescription,
    enumValues,
  });

  const { maxRetries, retry } = prepareRetries({ maxRetries: maxRetriesArg });

  const outputStrategy = getOutputStrategy({
    output,
    schema: inputSchema,
    enumValues,
  });

  // automatically set mode to 'json' for no-schema output
  if (outputStrategy.type === 'no-schema' && mode === undefined) {
    mode = 'json';
  }

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { ...settings, maxRetries },
  });

  const tracer = getTracer(telemetry);

  return recordSpan({
    name: 'ai.generateObject',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: 'ai.generateObject',
          telemetry,
        }),
        ...baseTelemetryAttributes,
        // specific settings that only make sense on the outer level:
        'ai.prompt': {
          input: () => JSON.stringify({ system, prompt, messages }),
        },
        'ai.schema':
          outputStrategy.jsonSchema != null
            ? { input: () => JSON.stringify(outputStrategy.jsonSchema) }
            : undefined,
        'ai.schema.name': schemaName,
        'ai.schema.description': schemaDescription,
        'ai.settings.output': outputStrategy.type,
        'ai.settings.mode': mode,
      },
    }),
    tracer,
    fn: async span => {
      // use the default provider mode when the mode is set to 'auto' or unspecified
      if (mode === 'auto' || mode == null) {
        mode = model.defaultObjectGenerationMode;
      }

      let result: string;
      let finishReason: FinishReason;
      let usage: Parameters<typeof calculateLanguageModelUsage>[0];
      let warnings: CallWarning[] | undefined;
      let response: LanguageModelResponseMetadata;
      let request: LanguageModelRequestMetadata;
      let logprobs: LogProbs | undefined;
      let resultProviderMetadata: ProviderMetadata | undefined;

      switch (mode) {
        case 'json': {
          const standardizedPrompt = standardizePrompt({
            prompt: {
              system:
                outputStrategy.jsonSchema == null
                  ? injectJsonInstruction({ prompt: system })
                  : model.supportsStructuredOutputs
                    ? system
                    : injectJsonInstruction({
                        prompt: system,
                        schema: outputStrategy.jsonSchema,
                      }),
              prompt,
              messages,
            },
            tools: undefined,
          });

          const promptMessages = await convertToLanguageModelPrompt({
            prompt: standardizedPrompt,
            modelSupportsImageUrls: model.supportsImageUrls,
            modelSupportsUrl: model.supportsUrl?.bind(model), // support 'this' context
          });

          const generateResult = await retry(() =>
            recordSpan({
              name: 'ai.generateObject.doGenerate',
              attributes: selectTelemetryAttributes({
                telemetry,
                attributes: {
                  ...assembleOperationName({
                    operationId: 'ai.generateObject.doGenerate',
                    telemetry,
                  }),
                  ...baseTelemetryAttributes,
                  'ai.prompt.format': {
                    input: () => standardizedPrompt.type,
                  },
                  'ai.prompt.messages': {
                    input: () => JSON.stringify(promptMessages),
                  },
                  'ai.settings.mode': mode,

                  // standardized gen-ai llm span attributes:
                  'gen_ai.system': model.provider,
                  'gen_ai.request.model': model.modelId,
                  'gen_ai.request.frequency_penalty': settings.frequencyPenalty,
                  'gen_ai.request.max_tokens': settings.maxOutputTokens,
                  'gen_ai.request.presence_penalty': settings.presencePenalty,
                  'gen_ai.request.temperature': settings.temperature,
                  'gen_ai.request.top_k': settings.topK,
                  'gen_ai.request.top_p': settings.topP,
                },
              }),
              tracer,
              fn: async span => {
                const result = await model.doGenerate({
                  responseFormat: {
                    type: 'json',
                    schema: outputStrategy.jsonSchema,
                    name: schemaName,
                    description: schemaDescription,
                  },
                  ...prepareCallSettings(settings),
                  inputFormat: standardizedPrompt.type,
                  prompt: promptMessages,
                  providerOptions,
                  abortSignal,
                  headers,
                });

                const responseData = {
                  id: result.response?.id ?? generateId(),
                  timestamp: result.response?.timestamp ?? currentDate(),
                  modelId: result.response?.modelId ?? model.modelId,
                  headers: result.response?.headers,
                  body: result.response?.body,
                };

                const text = extractContentText(result.content);

                if (text === undefined) {
                  throw new NoObjectGeneratedError({
                    message:
                      'No object generated: the model did not return a response.',
                    response: responseData,
                    usage: calculateLanguageModelUsage(result.usage),
                    finishReason: result.finishReason,
                  });
                }

                // Add response information to the span:
                span.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      'ai.response.finishReason': result.finishReason,
                      'ai.response.object': { output: () => text },
                      'ai.response.id': responseData.id,
                      'ai.response.model': responseData.modelId,
                      'ai.response.timestamp':
                        responseData.timestamp.toISOString(),

                      // TODO rename telemetry attributes to inputTokens and outputTokens
                      'ai.usage.promptTokens': result.usage.inputTokens,
                      'ai.usage.completionTokens': result.usage.outputTokens,

                      // standardized gen-ai llm span attributes:
                      'gen_ai.response.finish_reasons': [result.finishReason],
                      'gen_ai.response.id': responseData.id,
                      'gen_ai.response.model': responseData.modelId,
                      'gen_ai.usage.input_tokens': result.usage.inputTokens,
                      'gen_ai.usage.output_tokens': result.usage.outputTokens,
                    },
                  }),
                );

                return { ...result, objectText: text, responseData };
              },
            }),
          );

          result = generateResult.objectText;
          finishReason = generateResult.finishReason;
          usage = generateResult.usage;
          warnings = generateResult.warnings;
          logprobs = generateResult.logprobs;
          resultProviderMetadata = generateResult.providerMetadata;
          request = generateResult.request ?? {};
          response = generateResult.responseData;

          break;
        }

        case 'tool': {
          const standardizedPrompt = standardizePrompt({
            prompt: { system, prompt, messages },
            tools: undefined,
          });

          const promptMessages = await convertToLanguageModelPrompt({
            prompt: standardizedPrompt,
            modelSupportsImageUrls: model.supportsImageUrls,
            modelSupportsUrl: model.supportsUrl?.bind(model), // support 'this' context,
          });
          const inputFormat = standardizedPrompt.type;

          const generateResult = await retry(() =>
            recordSpan({
              name: 'ai.generateObject.doGenerate',
              attributes: selectTelemetryAttributes({
                telemetry,
                attributes: {
                  ...assembleOperationName({
                    operationId: 'ai.generateObject.doGenerate',
                    telemetry,
                  }),
                  ...baseTelemetryAttributes,
                  'ai.prompt.format': {
                    input: () => inputFormat,
                  },
                  'ai.prompt.messages': {
                    input: () => JSON.stringify(promptMessages),
                  },
                  'ai.settings.mode': mode,

                  // standardized gen-ai llm span attributes:
                  'gen_ai.system': model.provider,
                  'gen_ai.request.model': model.modelId,
                  'gen_ai.request.frequency_penalty': settings.frequencyPenalty,
                  'gen_ai.request.max_tokens': settings.maxOutputTokens,
                  'gen_ai.request.presence_penalty': settings.presencePenalty,
                  'gen_ai.request.temperature': settings.temperature,
                  'gen_ai.request.top_k': settings.topK,
                  'gen_ai.request.top_p': settings.topP,
                },
              }),
              tracer,
              fn: async span => {
                const result = await model.doGenerate({
                  tools: [
                    {
                      type: 'function',
                      name: schemaName ?? 'json',
                      description:
                        schemaDescription ?? 'Respond with a JSON object.',
                      parameters: outputStrategy.jsonSchema!,
                    },
                  ],
                  toolChoice: { type: 'required' },
                  ...prepareCallSettings(settings),
                  inputFormat,
                  prompt: promptMessages,
                  providerOptions,
                  abortSignal,
                  headers,
                });

                const firstToolCall = result.content.find(
                  content => content.type === 'tool-call',
                );

                const objectText = firstToolCall?.args;

                const responseData = {
                  id: result.response?.id ?? generateId(),
                  timestamp: result.response?.timestamp ?? currentDate(),
                  modelId: result.response?.modelId ?? model.modelId,
                  headers: result.response?.headers,
                  body: result.response?.body,
                };

                if (objectText === undefined) {
                  throw new NoObjectGeneratedError({
                    message: 'No object generated: the tool was not called.',
                    response: responseData,
                    usage: calculateLanguageModelUsage(result.usage),
                    finishReason: result.finishReason,
                  });
                }

                // Add response information to the span:
                span.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      'ai.response.finishReason': result.finishReason,
                      'ai.response.object': { output: () => objectText },
                      'ai.response.id': responseData.id,
                      'ai.response.model': responseData.modelId,
                      'ai.response.timestamp':
                        responseData.timestamp.toISOString(),

                      // TODO rename telemetry attributes to inputTokens and outputTokens
                      'ai.usage.promptTokens': result.usage.inputTokens,
                      'ai.usage.completionTokens': result.usage.outputTokens,

                      // standardized gen-ai llm span attributes:
                      'gen_ai.response.finish_reasons': [result.finishReason],
                      'gen_ai.response.id': responseData.id,
                      'gen_ai.response.model': responseData.modelId,
                      'gen_ai.usage.input_tokens': result.usage.inputTokens,
                      'gen_ai.usage.output_tokens': result.usage.outputTokens,
                    },
                  }),
                );

                return { ...result, objectText, responseData };
              },
            }),
          );

          result = generateResult.objectText;
          finishReason = generateResult.finishReason;
          usage = generateResult.usage;
          warnings = generateResult.warnings;
          logprobs = generateResult.logprobs;
          resultProviderMetadata = generateResult.providerMetadata;
          request = generateResult.request ?? {};
          response = generateResult.responseData;

          break;
        }

        case undefined: {
          throw new Error(
            'Model does not have a default object generation mode.',
          );
        }

        default: {
          const _exhaustiveCheck: never = mode;
          throw new Error(`Unsupported mode: ${_exhaustiveCheck}`);
        }
      }

      function processResult(result: string): RESULT {
        const parseResult = safeParseJSON({ text: result });

        if (!parseResult.success) {
          throw new NoObjectGeneratedError({
            message: 'No object generated: could not parse the response.',
            cause: parseResult.error,
            text: result,
            response,
            usage: calculateLanguageModelUsage(usage),
            finishReason,
          });
        }

        const validationResult = outputStrategy.validateFinalResult(
          parseResult.value,
          {
            text: result,
            response,
            usage: calculateLanguageModelUsage(usage),
          },
        );

        if (!validationResult.success) {
          throw new NoObjectGeneratedError({
            message: 'No object generated: response did not match schema.',
            cause: validationResult.error,
            text: result,
            response,
            usage: calculateLanguageModelUsage(usage),
            finishReason,
          });
        }

        return validationResult.value;
      }

      let object: RESULT;
      try {
        object = processResult(result);
      } catch (error) {
        if (
          repairText != null &&
          NoObjectGeneratedError.isInstance(error) &&
          (JSONParseError.isInstance(error.cause) ||
            TypeValidationError.isInstance(error.cause))
        ) {
          const repairedText = await repairText({
            text: result,
            error: error.cause,
          });

          if (repairedText === null) {
            throw error;
          }

          object = processResult(repairedText);
        } else {
          throw error;
        }
      }

      // Add response information to the span:
      span.setAttributes(
        selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.response.finishReason': finishReason,
            'ai.response.object': {
              output: () => JSON.stringify(object),
            },

            // TODO rename telemetry attributes to inputTokens and outputTokens
            'ai.usage.promptTokens': usage.inputTokens,
            'ai.usage.completionTokens': usage.outputTokens,
          },
        }),
      );

      return new DefaultGenerateObjectResult({
        object,
        finishReason,
        usage: calculateLanguageModelUsage(usage),
        warnings,
        request,
        response,
        logprobs,
        providerMetadata: resultProviderMetadata,
      });
    },
  });
}

class DefaultGenerateObjectResult<T> implements GenerateObjectResult<T> {
  readonly object: GenerateObjectResult<T>['object'];
  readonly finishReason: GenerateObjectResult<T>['finishReason'];
  readonly usage: GenerateObjectResult<T>['usage'];
  readonly warnings: GenerateObjectResult<T>['warnings'];
  readonly logprobs: GenerateObjectResult<T>['logprobs'];
  readonly providerMetadata: GenerateObjectResult<T>['providerMetadata'];
  readonly response: GenerateObjectResult<T>['response'];
  readonly request: GenerateObjectResult<T>['request'];

  constructor(options: {
    object: GenerateObjectResult<T>['object'];
    finishReason: GenerateObjectResult<T>['finishReason'];
    usage: GenerateObjectResult<T>['usage'];
    warnings: GenerateObjectResult<T>['warnings'];
    logprobs: GenerateObjectResult<T>['logprobs'];
    providerMetadata: GenerateObjectResult<T>['providerMetadata'];
    response: GenerateObjectResult<T>['response'];
    request: GenerateObjectResult<T>['request'];
  }) {
    this.object = options.object;
    this.finishReason = options.finishReason;
    this.usage = options.usage;
    this.warnings = options.warnings;
    this.providerMetadata = options.providerMetadata;
    this.response = options.response;
    this.request = options.request;
    this.logprobs = options.logprobs;
  }

  toJsonResponse(init?: ResponseInit): Response {
    return new Response(JSON.stringify(this.object), {
      status: init?.status ?? 200,
      headers: prepareResponseHeaders(init?.headers, {
        contentType: 'application/json; charset=utf-8',
      }),
    });
  }
}
