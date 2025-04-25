import {
  JSONParseError,
  JSONValue,
  TypeValidationError,
} from '@ai-sdk/provider';
import { createIdGenerator, safeParseJSON } from '@ai-sdk/provider-utils';
import { NoObjectGeneratedError } from '../../errors/no-object-generated-error';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareRetries } from '../prompt/prepare-retries';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import {
  CallWarning,
  FinishReason,
  LogProbs,
  ProviderMetadata,
} from '../types';
import { LanguageModelRequestMetadata } from '../types/language-model-request-metadata';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { calculateLanguageModelUsage } from '../types/usage';
import { prepareResponseHeaders } from '../util/prepare-response-headers';
import { GenerateObjectResult } from './generate-object-result';
import { injectJsonInstruction } from './inject-json-instruction';
import { getOutputStrategy } from './output-strategy';
import { validateObjectGenerationInput } from './validate-object-generation-input';
import {
  GenerateObjectArrayOptions,
  GenerateObjectEnumOptions,
  GenerateObjectNoSchemaOptions,
  GenerateObjectObjectOptions,
  GenerateObjectOptions,
} from './generate-object-options';

const originalGenerateId = createIdGenerator({ prefix: 'aiobj', size: 24 });

/**
Generate a structured, typed object for a given prompt and schema using a language model.

This function does not stream the output. If you want to stream the output, use `streamObject` instead.

@returns
A result object that contains the generated object, the finish reason, the token usage, and additional information.
 */
export async function generateObject<OBJECT>(
  options: GenerateObjectObjectOptions<OBJECT>,
): Promise<GenerateObjectResult<OBJECT>>;
/**
Generate an array with structured, typed elements for a given prompt and element schema using a language model.

This function does not stream the output. If you want to stream the output, use `streamObject` instead.

@return
A result object that contains the generated object, the finish reason, the token usage, and additional information.
 */
export async function generateObject<ELEMENT>(
  options: GenerateObjectArrayOptions<ELEMENT>,
): Promise<GenerateObjectResult<Array<ELEMENT>>>;
/**
Generate a value from an enum (limited list of string values) using a language model.

This function does not stream the output.

@return
A result object that contains the generated value, the finish reason, the token usage, and additional information.
 */
export async function generateObject<ENUM extends string>(
  options: GenerateObjectEnumOptions<ENUM>,
): Promise<GenerateObjectResult<ENUM>>;
/**
Generate JSON with any schema for a given prompt using a language model.

This function does not stream the output. If you want to stream the output, use `streamObject` instead.

@returns
A result object that contains the generated object, the finish reason, the token usage, and additional information.
 */
export async function generateObject(
  options: GenerateObjectNoSchemaOptions,
): Promise<GenerateObjectResult<JSONValue>>;
export async function generateObject<RESULT>({
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
  experimental_providerMetadata,
  providerOptions = experimental_providerMetadata,
  _internal: {
    generateId = originalGenerateId,
    currentDate = () => new Date(),
  } = {},
  ...settings
}: GenerateObjectOptions & {
  enum?: Array<string>;
  schema?: any;
  schemaName?: string;
  schemaDescription?: string;
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
      let rawResponse:
        | { headers?: Record<string, string>; body?: unknown }
        | undefined;
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
                  'gen_ai.request.max_tokens': settings.maxTokens,
                  'gen_ai.request.presence_penalty': settings.presencePenalty,
                  'gen_ai.request.temperature': settings.temperature,
                  'gen_ai.request.top_k': settings.topK,
                  'gen_ai.request.top_p': settings.topP,
                },
              }),
              tracer,
              fn: async span => {
                const result = await model.doGenerate({
                  mode: {
                    type: 'object-json',
                    schema: outputStrategy.jsonSchema,
                    name: schemaName,
                    description: schemaDescription,
                  },
                  ...prepareCallSettings(settings),
                  inputFormat: standardizedPrompt.type,
                  prompt: promptMessages,
                  providerMetadata: providerOptions,
                  abortSignal,
                  headers,
                });

                const responseData = {
                  id: result.response?.id ?? generateId(),
                  timestamp: result.response?.timestamp ?? currentDate(),
                  modelId: result.response?.modelId ?? model.modelId,
                };

                if (result.text === undefined) {
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
                      'ai.response.object': { output: () => result.text },
                      'ai.response.id': responseData.id,
                      'ai.response.model': responseData.modelId,
                      'ai.response.timestamp':
                        responseData.timestamp.toISOString(),

                      'ai.usage.promptTokens': result.usage.promptTokens,
                      'ai.usage.completionTokens':
                        result.usage.completionTokens,

                      // standardized gen-ai llm span attributes:
                      'gen_ai.response.finish_reasons': [result.finishReason],
                      'gen_ai.response.id': responseData.id,
                      'gen_ai.response.model': responseData.modelId,
                      'gen_ai.usage.prompt_tokens': result.usage.promptTokens,
                      'gen_ai.usage.completion_tokens':
                        result.usage.completionTokens,
                    },
                  }),
                );

                return { ...result, objectText: result.text, responseData };
              },
            }),
          );

          result = generateResult.objectText;
          finishReason = generateResult.finishReason;
          usage = generateResult.usage;
          warnings = generateResult.warnings;
          rawResponse = generateResult.rawResponse;
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
                  'gen_ai.request.max_tokens': settings.maxTokens,
                  'gen_ai.request.presence_penalty': settings.presencePenalty,
                  'gen_ai.request.temperature': settings.temperature,
                  'gen_ai.request.top_k': settings.topK,
                  'gen_ai.request.top_p': settings.topP,
                },
              }),
              tracer,
              fn: async span => {
                const result = await model.doGenerate({
                  mode: {
                    type: 'object-tool',
                    tool: {
                      type: 'function',
                      name: schemaName ?? 'json',
                      description:
                        schemaDescription ?? 'Respond with a JSON object.',
                      parameters: outputStrategy.jsonSchema!,
                    },
                  },
                  ...prepareCallSettings(settings),
                  inputFormat,
                  prompt: promptMessages,
                  providerMetadata: providerOptions,
                  abortSignal,
                  headers,
                });

                const objectText = result.toolCalls?.[0]?.args;

                const responseData = {
                  id: result.response?.id ?? generateId(),
                  timestamp: result.response?.timestamp ?? currentDate(),
                  modelId: result.response?.modelId ?? model.modelId,
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

                      'ai.usage.promptTokens': result.usage.promptTokens,
                      'ai.usage.completionTokens':
                        result.usage.completionTokens,

                      // standardized gen-ai llm span attributes:
                      'gen_ai.response.finish_reasons': [result.finishReason],
                      'gen_ai.response.id': responseData.id,
                      'gen_ai.response.model': responseData.modelId,
                      'gen_ai.usage.input_tokens': result.usage.promptTokens,
                      'gen_ai.usage.output_tokens':
                        result.usage.completionTokens,
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
          rawResponse = generateResult.rawResponse;
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
            finishReason: finishReason,
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
            finishReason: finishReason,
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

            'ai.usage.promptTokens': usage.promptTokens,
            'ai.usage.completionTokens': usage.completionTokens,
          },
        }),
      );

      return new DefaultGenerateObjectResult({
        object,
        finishReason,
        usage: calculateLanguageModelUsage(usage),
        warnings,
        request,
        response: {
          ...response,
          headers: rawResponse?.headers,
          body: rawResponse?.body,
        },
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
  readonly experimental_providerMetadata: GenerateObjectResult<T>['experimental_providerMetadata'];
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
    this.experimental_providerMetadata = options.providerMetadata;
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
