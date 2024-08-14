import { safeParseJSON } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { retryWithExponentialBackoff } from '../../util/retry-with-exponential-backoff';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getValidatedPrompt } from '../prompt/get-validated-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { CallWarning, FinishReason, LanguageModel, LogProbs } from '../types';
import { calculateCompletionTokenUsage } from '../types/token-usage';
import { prepareResponseHeaders } from '../util/prepare-response-headers';
import { Schema, asSchema } from '../util/schema';
import { GenerateObjectResult } from './generate-object-result';
import { injectJsonSchemaIntoSystem } from './inject-json-schema-into-system';
import { NoObjectGeneratedError } from './no-object-generated-error';

/**
Generate a structured, typed object for a given prompt and schema using a language model.

This function does not stream the output. If you want to stream the output, use `streamObject` instead.

@param model - The language model to use.

@param schema - The schema of the object that the model should generate.
@param schemaName - Optional name of the output that should be generated. Used by some providers for additional LLM guidance, e.g. via tool or schema name.
@param schemaDescription - Optional description of the output that should be generated. Used by some providers for additional LLM guidance, e.g. via tool or schema description.
@param mode - The mode to use for object generation. Not all models support all modes. Defaults to 'auto'.

@param system - A system message that will be part of the prompt.
@param prompt - A simple text prompt. You can either use `prompt` or `messages` but not both.
@param messages - A list of messages. You can either use `prompt` or `messages` but not both.

@param maxTokens - Maximum number of tokens to generate.
@param temperature - Temperature setting.
The value is passed through to the provider. The range depends on the provider and model.
It is recommended to set either `temperature` or `topP`, but not both.
@param topP - Nucleus sampling.
The value is passed through to the provider. The range depends on the provider and model.
It is recommended to set either `temperature` or `topP`, but not both.
@param topK - Only sample from the top K options for each subsequent token.
Used to remove "long tail" low probability responses.
Recommended for advanced use cases only. You usually only need to use temperature.
@param presencePenalty - Presence penalty setting.
It affects the likelihood of the model to repeat information that is already in the prompt.
The value is passed through to the provider. The range depends on the provider and model.
@param frequencyPenalty - Frequency penalty setting.
It affects the likelihood of the model to repeatedly use the same words or phrases.
The value is passed through to the provider. The range depends on the provider and model.
@param seed - The seed (integer) to use for random sampling.
If set and supported by the model, calls will generate deterministic results.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns
A result object that contains the generated object, the finish reason, the token usage, and additional information.
 */
export async function generateObject<T>({
  model,
  schema: inputSchema,
  schemaName,
  schemaDescription,
  mode,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
  headers,
  experimental_telemetry: telemetry,
  ...settings
}: Omit<CallSettings, 'stopSequences'> &
  Prompt & {
    /**
The language model to use.
     */
    model: LanguageModel;

    /**
The schema of the object that the model should generate.
     */
    schema: z.Schema<T, z.ZodTypeDef, any> | Schema<T>;

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

The schema is converted in a JSON schema and used in one of the following ways

- 'auto': The provider will choose the best mode for the model.
- 'tool': A tool with the JSON schema as parameters is is provided and the provider is instructed to use it.
- 'json': The JSON schema and an instruction is injected into the prompt. If the provider supports JSON mode, it is enabled. If the provider supports JSON grammars, the grammar is used.

Please note that most providers do not support all modes.

Default and recommended: 'auto' (best mode for the model).
     */
    mode?: 'auto' | 'json' | 'tool';

    /**
     * Optional telemetry configuration (experimental).
     */
    experimental_telemetry?: TelemetrySettings;
  }): Promise<DefaultGenerateObjectResult<T>> {
  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { ...settings, maxRetries },
  });

  const schema = asSchema(inputSchema);

  const tracer = getTracer({ isEnabled: telemetry?.isEnabled ?? false });
  return recordSpan({
    name: 'ai.generateObject',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationName: 'ai.generateObject',
          telemetry,
        }),
        ...baseTelemetryAttributes,
        // specific settings that only make sense on the outer level:
        'ai.prompt': {
          input: () => JSON.stringify({ system, prompt, messages }),
        },
        'ai.schema': {
          input: () => JSON.stringify(schema.jsonSchema),
        },
        'ai.schema.name': schemaName,
        'ai.schema.description': schemaDescription,
        'ai.settings.mode': mode,
      },
    }),
    tracer,
    fn: async span => {
      const retry = retryWithExponentialBackoff({ maxRetries });

      // use the default provider mode when the mode is set to 'auto' or unspecified
      if (mode === 'auto' || mode == null) {
        mode = model.defaultObjectGenerationMode;
      }

      let result: string;
      let finishReason: FinishReason;
      let usage: Parameters<typeof calculateCompletionTokenUsage>[0];
      let warnings: CallWarning[] | undefined;
      let rawResponse: { headers?: Record<string, string> } | undefined;
      let logprobs: LogProbs | undefined;

      switch (mode) {
        case 'json': {
          const validatedPrompt = getValidatedPrompt({
            system: model.supportsStructuredOutputs
              ? system
              : injectJsonSchemaIntoSystem({
                  system,
                  schema: schema.jsonSchema,
                }),
            prompt,
            messages,
          });

          const promptMessages = await convertToLanguageModelPrompt({
            prompt: validatedPrompt,
            modelSupportsImageUrls: model.supportsImageUrls,
          });

          const inputFormat = validatedPrompt.type;

          const generateResult = await retry(() =>
            recordSpan({
              name: 'ai.generateObject.doGenerate',
              attributes: selectTelemetryAttributes({
                telemetry,
                attributes: {
                  ...assembleOperationName({
                    operationName: 'ai.generateObject.doGenerate',
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
                  'gen_ai.request.model': model.modelId,
                  'gen_ai.system': model.provider,
                  'gen_ai.request.max_tokens': settings.maxTokens,
                  'gen_ai.request.temperature': settings.temperature,
                  'gen_ai.request.top_p': settings.topP,
                },
              }),
              tracer,
              fn: async span => {
                const result = await model.doGenerate({
                  mode: {
                    type: 'object-json',
                    schema: schema.jsonSchema,
                    name: schemaName,
                    description: schemaDescription,
                  },
                  ...prepareCallSettings(settings),
                  inputFormat,
                  prompt: promptMessages,
                  abortSignal,
                  headers,
                });

                if (result.text === undefined) {
                  throw new NoObjectGeneratedError();
                }

                // Add response information to the span:
                span.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      'ai.finishReason': result.finishReason,
                      'ai.usage.promptTokens': result.usage.promptTokens,
                      'ai.usage.completionTokens':
                        result.usage.completionTokens,
                      'ai.result.object': { output: () => result.text },

                      // standardized gen-ai llm span attributes:
                      'gen_ai.response.finish_reasons': [result.finishReason],
                      'gen_ai.usage.prompt_tokens': result.usage.promptTokens,
                      'gen_ai.usage.completion_tokens':
                        result.usage.completionTokens,
                    },
                  }),
                );

                return { ...result, objectText: result.text };
              },
            }),
          );

          result = generateResult.objectText;
          finishReason = generateResult.finishReason;
          usage = generateResult.usage;
          warnings = generateResult.warnings;
          rawResponse = generateResult.rawResponse;
          logprobs = generateResult.logprobs;

          break;
        }

        case 'tool': {
          const validatedPrompt = getValidatedPrompt({
            system,
            prompt,
            messages,
          });

          const promptMessages = await convertToLanguageModelPrompt({
            prompt: validatedPrompt,
            modelSupportsImageUrls: model.supportsImageUrls,
          });
          const inputFormat = validatedPrompt.type;

          const generateResult = await retry(() =>
            recordSpan({
              name: 'ai.generateObject.doGenerate',
              attributes: selectTelemetryAttributes({
                telemetry,
                attributes: {
                  ...assembleOperationName({
                    operationName: 'ai.generateObject.doGenerate',
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
                  'gen_ai.request.model': model.modelId,
                  'gen_ai.system': model.provider,
                  'gen_ai.request.max_tokens': settings.maxTokens,
                  'gen_ai.request.temperature': settings.temperature,
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
                      parameters: schema.jsonSchema,
                    },
                  },
                  ...prepareCallSettings(settings),
                  inputFormat,
                  prompt: promptMessages,
                  abortSignal,
                  headers,
                });

                const objectText = result.toolCalls?.[0]?.args;

                if (objectText === undefined) {
                  throw new NoObjectGeneratedError();
                }

                // Add response information to the span:
                span.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      'ai.finishReason': result.finishReason,
                      'ai.usage.promptTokens': result.usage.promptTokens,
                      'ai.usage.completionTokens':
                        result.usage.completionTokens,
                      'ai.result.object': { output: () => objectText },

                      // standardized gen-ai llm span attributes:
                      'gen_ai.response.finish_reasons': [result.finishReason],
                      'gen_ai.usage.prompt_tokens': result.usage.promptTokens,
                      'gen_ai.usage.completion_tokens':
                        result.usage.completionTokens,
                    },
                  }),
                );

                return { ...result, objectText };
              },
            }),
          );

          result = generateResult.objectText;
          finishReason = generateResult.finishReason;
          usage = generateResult.usage;
          warnings = generateResult.warnings;
          rawResponse = generateResult.rawResponse;
          logprobs = generateResult.logprobs;

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

      const parseResult = safeParseJSON({ text: result, schema });

      if (!parseResult.success) {
        throw parseResult.error;
      }

      // Add response information to the span:
      span.setAttributes(
        selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.finishReason': finishReason,
            'ai.usage.promptTokens': usage.promptTokens,
            'ai.usage.completionTokens': usage.completionTokens,
            'ai.result.object': {
              output: () => JSON.stringify(parseResult.value),
            },
          },
        }),
      );

      return new DefaultGenerateObjectResult({
        object: parseResult.value,
        finishReason,
        usage: calculateCompletionTokenUsage(usage),
        warnings,
        rawResponse,
        logprobs,
      });
    },
  });
}

class DefaultGenerateObjectResult<T> implements GenerateObjectResult<T> {
  readonly object: GenerateObjectResult<T>['object'];
  readonly finishReason: GenerateObjectResult<T>['finishReason'];
  readonly usage: GenerateObjectResult<T>['usage'];
  readonly warnings: GenerateObjectResult<T>['warnings'];
  readonly rawResponse: GenerateObjectResult<T>['rawResponse'];
  readonly logprobs: GenerateObjectResult<T>['logprobs'];

  constructor(options: {
    object: GenerateObjectResult<T>['object'];
    finishReason: GenerateObjectResult<T>['finishReason'];
    usage: GenerateObjectResult<T>['usage'];
    warnings: GenerateObjectResult<T>['warnings'];
    rawResponse: GenerateObjectResult<T>['rawResponse'];
    logprobs: GenerateObjectResult<T>['logprobs'];
  }) {
    this.object = options.object;
    this.finishReason = options.finishReason;
    this.usage = options.usage;
    this.warnings = options.warnings;
    this.rawResponse = options.rawResponse;
    this.logprobs = options.logprobs;
  }

  toJsonResponse(init?: ResponseInit): Response {
    return new Response(JSON.stringify(this.object), {
      status: init?.status ?? 200,
      headers: prepareResponseHeaders(init, {
        contentType: 'application/json; charset=utf-8',
      }),
    });
  }
}

/**
 * @deprecated Use `generateObject` instead.
 */
export const experimental_generateObject = generateObject;
