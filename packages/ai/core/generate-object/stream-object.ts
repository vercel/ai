import {
  LanguageModelV1CallOptions,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import {
  DeepPartial,
  isDeepEqualData,
  parsePartialJson,
} from '@ai-sdk/ui-utils';
import { Span } from '@opentelemetry/api';
import { ServerResponse } from 'http';
import { z } from 'zod';
import { createResolvablePromise } from '../../util/create-resolvable-promise';
import { DelayedPromise } from '../../util/delayed-promise';
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
import { CallWarning, LanguageModel } from '../types';
import {
  CompletionTokenUsage,
  calculateCompletionTokenUsage,
} from '../types/token-usage';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { prepareResponseHeaders } from '../util/prepare-response-headers';
import { Schema, asSchema } from '../util/schema';
import { injectJsonSchemaIntoSystem } from './inject-json-schema-into-system';
import {
  ObjectStreamInputPart,
  ObjectStreamPart,
  StreamObjectResult,
} from './stream-object-result';

/**
Generate a structured, typed object for a given prompt and schema using a language model.

This function streams the output. If you do not want to stream the output, use `generateObject` instead.

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

@return
A result object for accessing the partial object stream and additional information.
 */
export async function streamObject<T>({
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
  onFinish,
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
Optional telemetry configuration (experimental).
     */
    experimental_telemetry?: TelemetrySettings;

    /**
Callback that is called when the LLM response and the final object validation are finished.
     */
    onFinish?: (event: {
      /**
The token usage of the generated response.
*/
      usage: CompletionTokenUsage;

      /**
The generated object (typed according to the schema). Can be undefined if the final object does not match the schema.
   */
      object: T | undefined;

      /**
Optional error object. This is e.g. a TypeValidationError when the final object does not match the schema.
   */
      error: unknown | undefined;

      /**
Optional raw response data.
   */
      rawResponse?: {
        /**
Response headers.
     */
        headers?: Record<string, string>;
      };

      /**
Warnings from the model provider (e.g. unsupported settings).
       */
      warnings?: CallWarning[];
    }) => Promise<void> | void;
  }): Promise<DefaultStreamObjectResult<T>> {
  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { ...settings, maxRetries },
  });

  const tracer = getTracer({ isEnabled: telemetry?.isEnabled ?? false });

  const retry = retryWithExponentialBackoff({ maxRetries });

  const schema = asSchema(inputSchema);

  return recordSpan({
    name: 'ai.streamObject',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationName: 'ai.streamObject',
          telemetry,
        }),
        ...baseTelemetryAttributes,
        // specific settings that only make sense on the outer level:
        'ai.prompt': {
          input: () => JSON.stringify({ system, prompt, messages }),
        },
        'ai.schema': { input: () => JSON.stringify(schema.jsonSchema) },
        'ai.schema.name': schemaName,
        'ai.schema.description': schemaDescription,
        'ai.settings.mode': mode,
      },
    }),
    tracer,
    endWhenDone: false,
    fn: async rootSpan => {
      // use the default provider mode when the mode is set to 'auto' or unspecified
      if (mode === 'auto' || mode == null) {
        mode = model.defaultObjectGenerationMode;
      }

      let callOptions: LanguageModelV1CallOptions;
      let transformer: Transformer<
        LanguageModelV1StreamPart,
        string | Omit<LanguageModelV1StreamPart, 'text-delta'>
      >;

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

          callOptions = {
            mode: {
              type: 'object-json',
              schema: schema.jsonSchema,
              name: schemaName,
              description: schemaDescription,
            },
            ...prepareCallSettings(settings),
            inputFormat: validatedPrompt.type,
            prompt: await convertToLanguageModelPrompt({
              prompt: validatedPrompt,
              modelSupportsImageUrls: model.supportsImageUrls,
            }),
            abortSignal,
            headers,
          };

          transformer = {
            transform: (chunk, controller) => {
              switch (chunk.type) {
                case 'text-delta':
                  controller.enqueue(chunk.textDelta);
                  break;
                case 'finish':
                case 'error':
                  controller.enqueue(chunk);
                  break;
              }
            },
          };

          break;
        }

        case 'tool': {
          const validatedPrompt = getValidatedPrompt({
            system,
            prompt,
            messages,
          });

          callOptions = {
            mode: {
              type: 'object-tool',
              tool: {
                type: 'function',
                name: schemaName ?? 'json',
                description: schemaDescription ?? 'Respond with a JSON object.',
                parameters: schema.jsonSchema,
              },
            },
            ...prepareCallSettings(settings),
            inputFormat: validatedPrompt.type,
            prompt: await convertToLanguageModelPrompt({
              prompt: validatedPrompt,
              modelSupportsImageUrls: model.supportsImageUrls,
            }),
            abortSignal,
            headers,
          };

          transformer = {
            transform(chunk, controller) {
              switch (chunk.type) {
                case 'tool-call-delta':
                  controller.enqueue(chunk.argsTextDelta);
                  break;
                case 'finish':
                case 'error':
                  controller.enqueue(chunk);
                  break;
              }
            },
          };

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

      // const result = await retry(() => model.doStream(callOptions));
      const {
        result: { stream, warnings, rawResponse },
        doStreamSpan,
      } = await retry(() =>
        recordSpan({
          name: 'ai.streamObject.doStream',
          attributes: selectTelemetryAttributes({
            telemetry,
            attributes: {
              ...assembleOperationName({
                operationName: 'ai.streamObject.doStream',
                telemetry,
              }),
              ...baseTelemetryAttributes,
              'ai.prompt.format': {
                input: () => callOptions.inputFormat,
              },
              'ai.prompt.messages': {
                input: () => JSON.stringify(callOptions.prompt),
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
          endWhenDone: false,
          fn: async doStreamSpan => ({
            result: await model.doStream(callOptions),
            doStreamSpan,
          }),
        }),
      );

      return new DefaultStreamObjectResult({
        stream: stream.pipeThrough(new TransformStream(transformer)),
        warnings,
        rawResponse,
        schema,
        onFinish,
        rootSpan,
        doStreamSpan,
        telemetry,
      });
    },
  });
}

class DefaultStreamObjectResult<T> implements StreamObjectResult<T> {
  private readonly originalStream: ReadableStream<ObjectStreamPart<T>>;
  private readonly objectPromise: DelayedPromise<T>;

  readonly warnings: StreamObjectResult<T>['warnings'];
  readonly usage: StreamObjectResult<T>['usage'];
  readonly rawResponse: StreamObjectResult<T>['rawResponse'];

  constructor({
    stream,
    warnings,
    rawResponse,
    schema,
    onFinish,
    rootSpan,
    doStreamSpan,
    telemetry,
  }: {
    stream: ReadableStream<
      string | Omit<LanguageModelV1StreamPart, 'text-delta'>
    >;
    warnings: StreamObjectResult<T>['warnings'];
    rawResponse?: StreamObjectResult<T>['rawResponse'];
    schema: z.Schema<T, z.ZodTypeDef, any> | Schema<T>;
    onFinish: Parameters<typeof streamObject<T>>[0]['onFinish'];
    rootSpan: Span;
    doStreamSpan: Span;
    telemetry: TelemetrySettings | undefined;
  }) {
    this.warnings = warnings;
    this.rawResponse = rawResponse;

    // initialize object promise
    this.objectPromise = new DelayedPromise<T>();

    // initialize usage promise
    const { resolve: resolveUsage, promise: usagePromise } =
      createResolvablePromise<CompletionTokenUsage>();
    this.usage = usagePromise;

    // store information for onFinish callback:
    let usage: CompletionTokenUsage | undefined;
    let finishReason: LanguageModelV1FinishReason | undefined;
    let object: T | undefined;
    let error: unknown | undefined;

    // pipe chunks through a transformation stream that extracts metadata:
    let accumulatedText = '';
    let delta = '';
    let latestObject: DeepPartial<T> | undefined = undefined;
    let firstChunk = true;

    const self = this;
    this.originalStream = stream.pipeThrough(
      new TransformStream<string | ObjectStreamInputPart, ObjectStreamPart<T>>({
        async transform(chunk, controller): Promise<void> {
          // Telemetry event for first chunk:
          if (firstChunk) {
            firstChunk = false;
            doStreamSpan.addEvent('ai.stream.firstChunk');
          }

          // process partial text chunks
          if (typeof chunk === 'string') {
            accumulatedText += chunk;
            delta += chunk;

            const currentObject = parsePartialJson(
              accumulatedText,
            ) as DeepPartial<T>;

            if (!isDeepEqualData(latestObject, currentObject)) {
              latestObject = currentObject;

              controller.enqueue({
                type: 'object',
                object: currentObject,
              });

              controller.enqueue({
                type: 'text-delta',
                textDelta: delta,
              });

              delta = '';
            }

            return;
          }

          switch (chunk.type) {
            case 'finish': {
              // send final text delta:
              if (delta !== '') {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: delta,
                });
              }

              // store finish reason for telemetry:
              finishReason = chunk.finishReason;

              // store usage for promises and onFinish callback:
              usage = calculateCompletionTokenUsage(chunk.usage);

              controller.enqueue({ ...chunk, usage });

              // resolve promises that can be resolved now:
              resolveUsage(usage);

              // resolve the object promise with the latest object:
              const validationResult = safeValidateTypes({
                value: latestObject,
                schema,
              });

              if (validationResult.success) {
                object = validationResult.value;
                self.objectPromise.resolve(object);
              } else {
                error = validationResult.error;
                self.objectPromise.reject(error);
              }

              break;
            }

            default: {
              controller.enqueue(chunk);
              break;
            }
          }
        },

        // invoke onFinish callback and resolve toolResults promise when the stream is about to close:
        async flush(controller) {
          try {
            const finalUsage = usage ?? {
              promptTokens: NaN,
              completionTokens: NaN,
              totalTokens: NaN,
            };

            doStreamSpan.setAttributes(
              selectTelemetryAttributes({
                telemetry,
                attributes: {
                  'ai.finishReason': finishReason,
                  'ai.usage.promptTokens': finalUsage.promptTokens,
                  'ai.usage.completionTokens': finalUsage.completionTokens,
                  'ai.result.object': {
                    output: () => JSON.stringify(object),
                  },

                  // standardized gen-ai llm span attributes:
                  'gen_ai.usage.prompt_tokens': finalUsage.promptTokens,
                  'gen_ai.usage.completion_tokens': finalUsage.completionTokens,
                  'gen_ai.response.finish_reasons': [finishReason],
                },
              }),
            );

            // finish doStreamSpan before other operations for correct timing:
            doStreamSpan.end();

            // Add response information to the root span:
            rootSpan.setAttributes(
              selectTelemetryAttributes({
                telemetry,
                attributes: {
                  'ai.usage.promptTokens': finalUsage.promptTokens,
                  'ai.usage.completionTokens': finalUsage.completionTokens,
                  'ai.result.object': {
                    output: () => JSON.stringify(object),
                  },
                },
              }),
            );

            // call onFinish callback:
            await onFinish?.({
              usage: finalUsage,
              object,
              error,
              rawResponse,
              warnings,
            });
          } catch (error) {
            controller.error(error);
          } finally {
            rootSpan.end();
          }
        },
      }),
    );
  }

  get object(): Promise<T> {
    return this.objectPromise.value;
  }

  get partialObjectStream(): AsyncIterableStream<DeepPartial<T>> {
    return createAsyncIterableStream(this.originalStream, {
      transform(chunk, controller) {
        switch (chunk.type) {
          case 'object':
            controller.enqueue(chunk.object);
            break;

          case 'text-delta':
          case 'finish':
            break;

          case 'error':
            controller.error(chunk.error);
            break;

          default: {
            const _exhaustiveCheck: never = chunk;
            throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
          }
        }
      },
    });
  }

  get textStream(): AsyncIterableStream<string> {
    return createAsyncIterableStream(this.originalStream, {
      transform(chunk, controller) {
        switch (chunk.type) {
          case 'text-delta':
            controller.enqueue(chunk.textDelta);
            break;

          case 'object':
          case 'finish':
            break;

          case 'error':
            controller.error(chunk.error);
            break;

          default: {
            const _exhaustiveCheck: never = chunk;
            throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
          }
        }
      },
    });
  }

  get fullStream(): AsyncIterableStream<ObjectStreamPart<T>> {
    return createAsyncIterableStream(this.originalStream, {
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
    });
  }

  pipeTextStreamToResponse(
    response: ServerResponse,
    init?: { headers?: Record<string, string>; status?: number },
  ) {
    response.writeHead(init?.status ?? 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...init?.headers,
    });

    const reader = this.textStream
      .pipeThrough(new TextEncoderStream())
      .getReader();

    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          response.write(value);
        }
      } catch (error) {
        throw error;
      } finally {
        response.end();
      }
    };

    read();
  }

  toTextStreamResponse(init?: ResponseInit): Response {
    return new Response(this.textStream.pipeThrough(new TextEncoderStream()), {
      status: init?.status ?? 200,
      headers: prepareResponseHeaders(init, {
        contentType: 'text/plain; charset=utf-8',
      }),
    });
  }
}

/**
 * @deprecated Use `streamObject` instead.
 */
export const experimental_streamObject = streamObject;
