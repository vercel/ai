import {
  JSONParseError,
  JSONValue,
  TypeValidationError,
} from '@ai-sdk/provider';
import {
  createIdGenerator,
  InferSchema,
  safeParseJSON,
  Schema,
} from '@ai-sdk/provider-utils';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4/core';
import { NoObjectGeneratedError } from '../../src/error/no-object-generated-error';
import { prepareHeaders } from '../../src/util/prepare-headers';
import { prepareRetries } from '../../src/util/prepare-retries';
import { extractContentText } from '../generate-text/extract-content-text';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import { resolveLanguageModel } from '../prompt/resolve-language-model';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { wrapGatewayError } from '../prompt/wrap-gateway-error';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { stringifyForTelemetry } from '../telemetry/stringify-for-telemetry';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import {
  CallWarning,
  FinishReason,
  LanguageModel,
} from '../types/language-model';
import { LanguageModelRequestMetadata } from '../types/language-model-request-metadata';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { ProviderMetadata, ProviderOptions } from '../types/provider-metadata';
import { LanguageModelUsage } from '../types/usage';
import { GenerateObjectResult } from './generate-object-result';
import { getOutputStrategy } from './output-strategy';
import { validateObjectGenerationInput } from './validate-object-generation-input';

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

@param model - The language model to use.
@param tools - Tools that are accessible to and can be called by the model. The model needs to support calling tools.

@param system - A system message that will be part of the prompt.
@param prompt - A simple text prompt. You can either use `prompt` or `messages` but not both.
@param messages - A list of messages. You can either use `prompt` or `messages` but not both.

@param maxOutputTokens - Maximum number of tokens to generate.
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
@param stopSequences - Stop sequences.
If set, the model will stop generating text when one of the stop sequences is generated.
@param seed - The seed (integer) to use for random sampling.
If set and supported by the model, calls will generate deterministic results.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@param schema - The schema of the object that the model should generate.
@param schemaName - Optional name of the output that should be generated.
Used by some providers for additional LLM guidance, e.g.
via tool or schema name.
@param schemaDescription - Optional description of the output that should be generated.
Used by some providers for additional LLM guidance, e.g.
via tool or schema description.

@param output - The type of the output.

- 'object': The output is an object.
- 'array': The output is an array.
- 'enum': The output is an enum.
- 'no-schema': The output is not a schema.

@param experimental_repairText - A function that attempts to repair the raw output of the mode
to enable JSON parsing.

@param experimental_telemetry - Optional telemetry configuration (experimental).

@param providerOptions - Additional provider-specific options. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.

@returns
A result object that contains the generated object, the finish reason, the token usage, and additional information.
 */
export async function generateObject<
  SCHEMA extends z3.Schema | z4.$ZodType | Schema = z4.$ZodType<JSONValue>,
  OUTPUT extends
    | 'object'
    | 'array'
    | 'enum'
    | 'no-schema' = InferSchema<SCHEMA> extends string ? 'enum' : 'object',
  RESULT = OUTPUT extends 'array'
    ? Array<InferSchema<SCHEMA>>
    : InferSchema<SCHEMA>,
>(
  options: Omit<CallSettings, 'stopSequences'> &
    Prompt &
    (OUTPUT extends 'enum'
      ? {
          /**
The enum values that the model should use.
        */
          enum: Array<RESULT>;
          mode?: 'json';
          output: 'enum';
        }
      : OUTPUT extends 'no-schema'
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
      output?: OUTPUT;

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
): Promise<GenerateObjectResult<RESULT>> {
  const {
    model: modelArg,
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
  } = options;

  const model = resolveLanguageModel(modelArg);

  const enumValues = 'enum' in options ? options.enum : undefined;
  const {
    schema: inputSchema,
    schemaDescription,
    schemaName,
  } = 'schema' in options ? options : {};

  validateObjectGenerationInput({
    output,
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

  const callSettings = prepareCallSettings(settings);

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { ...callSettings, maxRetries },
  });

  const tracer = getTracer(telemetry);

  try {
    return await recordSpan({
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
        },
      }),
      tracer,
      fn: async span => {
        let result: string;
        let finishReason: FinishReason;
        let usage: LanguageModelUsage;
        let warnings: CallWarning[] | undefined;
        let response: LanguageModelResponseMetadata;
        let request: LanguageModelRequestMetadata;
        let resultProviderMetadata: ProviderMetadata | undefined;

        const standardizedPrompt = await standardizePrompt({
          system,
          prompt,
          messages,
        });

        const promptMessages = await convertToLanguageModelPrompt({
          prompt: standardizedPrompt,
          supportedUrls: await model.supportedUrls,
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
                'ai.prompt.messages': {
                  input: () => stringifyForTelemetry(promptMessages),
                },

                // standardized gen-ai llm span attributes:
                'gen_ai.system': model.provider,
                'gen_ai.request.model': model.modelId,
                'gen_ai.request.frequency_penalty':
                  callSettings.frequencyPenalty,
                'gen_ai.request.max_tokens': callSettings.maxOutputTokens,
                'gen_ai.request.presence_penalty': callSettings.presencePenalty,
                'gen_ai.request.temperature': callSettings.temperature,
                'gen_ai.request.top_k': callSettings.topK,
                'gen_ai.request.top_p': callSettings.topP,
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
                  usage: result.usage,
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
        resultProviderMetadata = generateResult.providerMetadata;
        request = generateResult.request ?? {};
        response = generateResult.responseData;

        async function processResult(result: string): Promise<RESULT> {
          const parseResult = await safeParseJSON({ text: result });

          if (!parseResult.success) {
            throw new NoObjectGeneratedError({
              message: 'No object generated: could not parse the response.',
              cause: parseResult.error,
              text: result,
              response,
              usage,
              finishReason,
            });
          }

          const validationResult = await outputStrategy.validateFinalResult(
            parseResult.value,
            {
              text: result,
              response,
              usage,
            },
          );

          if (!validationResult.success) {
            throw new NoObjectGeneratedError({
              message: 'No object generated: response did not match schema.',
              cause: validationResult.error,
              text: result,
              response,
              usage,
              finishReason,
            });
          }

          return validationResult.value;
        }

        let object: RESULT;
        try {
          object = await processResult(result);
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

            object = await processResult(repairedText);
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
          usage,
          warnings,
          request,
          response,
          providerMetadata: resultProviderMetadata,
        });
      },
    });
  } catch (error) {
    throw wrapGatewayError(error);
  }
}

class DefaultGenerateObjectResult<T> implements GenerateObjectResult<T> {
  readonly object: GenerateObjectResult<T>['object'];
  readonly finishReason: GenerateObjectResult<T>['finishReason'];
  readonly usage: GenerateObjectResult<T>['usage'];
  readonly warnings: GenerateObjectResult<T>['warnings'];
  readonly providerMetadata: GenerateObjectResult<T>['providerMetadata'];
  readonly response: GenerateObjectResult<T>['response'];
  readonly request: GenerateObjectResult<T>['request'];

  constructor(options: {
    object: GenerateObjectResult<T>['object'];
    finishReason: GenerateObjectResult<T>['finishReason'];
    usage: GenerateObjectResult<T>['usage'];
    warnings: GenerateObjectResult<T>['warnings'];
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
  }

  toJsonResponse(init?: ResponseInit): Response {
    return new Response(JSON.stringify(this.object), {
      status: init?.status ?? 200,
      headers: prepareHeaders(init?.headers, {
        'content-type': 'application/json; charset=utf-8',
      }),
    });
  }
}
