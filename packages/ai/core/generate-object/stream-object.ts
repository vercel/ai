import {
  JSONValue,
  LanguageModelV1CallOptions,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import {
  DeepPartial,
  Schema,
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
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import { validatePrompt } from '../prompt/validate-prompt';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { CallWarning, LanguageModel, ProviderMetadata } from '../types';
import {
  CompletionTokenUsage,
  calculateCompletionTokenUsage,
} from '../types/token-usage';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { prepareResponseHeaders } from '../util/prepare-response-headers';
import { injectJsonInstruction } from './inject-json-instruction';
import { OutputStrategy, getOutputStrategy } from './output-strategy';
import {
  ObjectStreamInputPart,
  ObjectStreamPart,
  StreamObjectResult,
} from './stream-object-result';
import { validateObjectGenerationInput } from './validate-object-generation-input';

type OnFinishCallback<RESULT> = (event: {
  /**
The token usage of the generated response.
*/
  usage: CompletionTokenUsage;

  /**
The generated object. Can be undefined if the final object does not match the schema.
*/
  object: RESULT | undefined;

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

  /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
*/
  experimental_providerMetadata: ProviderMetadata | undefined;
}) => Promise<void> | void;

/**
Generate a structured, typed object for a given prompt and schema using a language model.

This function streams the output. If you do not want to stream the output, use `generateObject` instead.

@return
A result object for accessing the partial object stream and additional information.
 */
export async function streamObject<OBJECT>(
  options: Omit<CallSettings, 'stopSequences'> &
    Prompt & {
      output?: 'object' | undefined;

      /**
The language model to use.
     */
      model: LanguageModel;

      /**
The schema of the object that the model should generate.
 */
      schema: z.Schema<OBJECT, z.ZodTypeDef, any> | Schema<OBJECT>;

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
      onFinish?: OnFinishCallback<OBJECT>;
    },
): Promise<StreamObjectResult<DeepPartial<OBJECT>, OBJECT, never>>;
/**
Generate an array with structured, typed elements for a given prompt and element schema using a language model.

This function streams the output. If you do not want to stream the output, use `generateObject` instead.

@return
A result object for accessing the partial object stream and additional information.
 */
export async function streamObject<ELEMENT>(
  options: Omit<CallSettings, 'stopSequences'> &
    Prompt & {
      output: 'array';

      /**
The language model to use.
     */
      model: LanguageModel;

      /**
The element schema of the array that the model should generate.
 */
      schema: z.Schema<ELEMENT, z.ZodTypeDef, any> | Schema<ELEMENT>;

      /**
Optional name of the array that should be generated.
Used by some providers for additional LLM guidance, e.g.
via tool or schema name.
     */
      schemaName?: string;

      /**
Optional description of the array that should be generated.
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
      onFinish?: OnFinishCallback<Array<ELEMENT>>;
    },
): Promise<
  StreamObjectResult<
    Array<ELEMENT>,
    Array<ELEMENT>,
    AsyncIterableStream<ELEMENT>
  >
>;
/**
Generate JSON with any schema for a given prompt using a language model.

This function streams the output. If you do not want to stream the output, use `generateObject` instead.

@return
A result object for accessing the partial object stream and additional information.
 */
export async function streamObject(
  options: Omit<CallSettings, 'stopSequences'> &
    Prompt & {
      output: 'no-schema';

      /**
The language model to use.
     */
      model: LanguageModel;

      /**
The mode to use for object generation. Must be "json" for no-schema output.
     */
      mode?: 'json';

      /**
Optional telemetry configuration (experimental).
     */
      experimental_telemetry?: TelemetrySettings;

      /**
Callback that is called when the LLM response and the final object validation are finished.
     */
      onFinish?: OnFinishCallback<JSONValue>;
    },
): Promise<StreamObjectResult<JSONValue, JSONValue, never>>;
export async function streamObject<SCHEMA, PARTIAL, RESULT, ELEMENT_STREAM>({
  model,
  schema: inputSchema,
  schemaName,
  schemaDescription,
  mode,
  output = 'object',
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
     * The expected structure of the output.
     *
     * - 'object': Generate a single object that conforms to the schema.
     * - 'array': Generate an array of objects that conform to the schema.
     * - 'no-schema': Generate any JSON object. No schema is specified.
     *
     * Default is 'object' if not specified.
     */
    output?: 'object' | 'array' | 'no-schema';

    model: LanguageModel;
    schema?: z.Schema<SCHEMA, z.ZodTypeDef, any> | Schema<SCHEMA>;
    schemaName?: string;
    schemaDescription?: string;
    mode?: 'auto' | 'json' | 'tool';
    experimental_telemetry?: TelemetrySettings;
    onFinish?: (event: {
      usage: CompletionTokenUsage;
      object: RESULT | undefined;
      error: unknown | undefined;
      rawResponse?: {
        headers?: Record<string, string>;
      };
      warnings?: CallWarning[];
      experimental_providerMetadata: ProviderMetadata | undefined;
    }) => Promise<void> | void;
  }): Promise<StreamObjectResult<PARTIAL, RESULT, ELEMENT_STREAM>> {
  validateObjectGenerationInput({
    output,
    mode,
    schema: inputSchema,
    schemaName,
    schemaDescription,
  });

  const outputStrategy = getOutputStrategy({ output, schema: inputSchema });

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

  const tracer = getTracer({ isEnabled: telemetry?.isEnabled ?? false });

  const retry = retryWithExponentialBackoff({ maxRetries });

  return recordSpan({
    name: 'ai.streamObject',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: 'ai.streamObject',
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
          const validatedPrompt = validatePrompt({
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
          });

          callOptions = {
            mode: {
              type: 'object-json',
              schema: outputStrategy.jsonSchema,
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
          const validatedPrompt = validatePrompt({
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
                parameters: outputStrategy.jsonSchema!,
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
        startTimestamp,
      } = await retry(() =>
        recordSpan({
          name: 'ai.streamObject.doStream',
          attributes: selectTelemetryAttributes({
            telemetry,
            attributes: {
              ...assembleOperationName({
                operationId: 'ai.streamObject.doStream',
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
            startTimestamp: performance.now(), // get before the call
            doStreamSpan,
            result: await model.doStream(callOptions),
          }),
        }),
      );

      return new DefaultStreamObjectResult<PARTIAL, RESULT, ELEMENT_STREAM>({
        outputStrategy,
        stream: stream.pipeThrough(new TransformStream(transformer)),
        warnings,
        rawResponse,
        onFinish,
        rootSpan,
        doStreamSpan,
        telemetry,
        startTimestamp,
      });
    },
  });
}

class DefaultStreamObjectResult<PARTIAL, RESULT, ELEMENT_STREAM>
  implements StreamObjectResult<PARTIAL, RESULT, ELEMENT_STREAM>
{
  private readonly originalStream: ReadableStream<ObjectStreamPart<PARTIAL>>;
  private readonly objectPromise: DelayedPromise<RESULT>;

  readonly warnings: StreamObjectResult<
    PARTIAL,
    RESULT,
    ELEMENT_STREAM
  >['warnings'];
  readonly usage: StreamObjectResult<PARTIAL, RESULT, ELEMENT_STREAM>['usage'];
  readonly experimental_providerMetadata: StreamObjectResult<
    PARTIAL,
    RESULT,
    ELEMENT_STREAM
  >['experimental_providerMetadata'];
  readonly rawResponse: StreamObjectResult<
    PARTIAL,
    RESULT,
    ELEMENT_STREAM
  >['rawResponse'];
  readonly outputStrategy: OutputStrategy<PARTIAL, RESULT, ELEMENT_STREAM>;

  constructor({
    stream,
    warnings,
    rawResponse,
    outputStrategy,
    onFinish,
    rootSpan,
    doStreamSpan,
    telemetry,
    startTimestamp,
  }: {
    stream: ReadableStream<
      string | Omit<LanguageModelV1StreamPart, 'text-delta'>
    >;
    warnings: StreamObjectResult<PARTIAL, RESULT, ELEMENT_STREAM>['warnings'];
    rawResponse?: StreamObjectResult<
      PARTIAL,
      RESULT,
      ELEMENT_STREAM
    >['rawResponse'];
    outputStrategy: OutputStrategy<PARTIAL, RESULT, ELEMENT_STREAM>;
    onFinish: OnFinishCallback<RESULT> | undefined;
    rootSpan: Span;
    doStreamSpan: Span;
    telemetry: TelemetrySettings | undefined;
    startTimestamp: number; // performance.now() timestamp
  }) {
    this.warnings = warnings;
    this.rawResponse = rawResponse;
    this.outputStrategy = outputStrategy;

    // initialize object promise
    this.objectPromise = new DelayedPromise<RESULT>();

    // initialize usage promise
    const { resolve: resolveUsage, promise: usagePromise } =
      createResolvablePromise<CompletionTokenUsage>();
    this.usage = usagePromise;

    // initialize experimental_providerMetadata promise
    const {
      resolve: resolveProviderMetadata,
      promise: providerMetadataPromise,
    } = createResolvablePromise<ProviderMetadata | undefined>();
    this.experimental_providerMetadata = providerMetadataPromise;

    // store information for onFinish callback:
    let usage: CompletionTokenUsage | undefined;
    let finishReason: LanguageModelV1FinishReason | undefined;
    let providerMetadata: ProviderMetadata | undefined;
    let object: RESULT | undefined;
    let error: unknown | undefined;

    // pipe chunks through a transformation stream that extracts metadata:
    let accumulatedText = '';
    let delta = '';

    // Keep track of raw parse result before type validation, since e.g. Zod might
    // change the object by mapping properties.
    let latestObjectJson: JSONValue | undefined = undefined;
    let latestObject: PARTIAL | undefined = undefined;
    let firstChunk = true;

    const self = this;
    this.originalStream = stream.pipeThrough(
      new TransformStream<
        string | ObjectStreamInputPart,
        ObjectStreamPart<PARTIAL>
      >({
        async transform(chunk, controller): Promise<void> {
          // Telemetry event for first chunk:
          if (firstChunk) {
            const msToFirstChunk = performance.now() - startTimestamp;

            firstChunk = false;

            doStreamSpan.addEvent('ai.stream.firstChunk', {
              'ai.stream.msToFirstChunk': msToFirstChunk,
            });

            doStreamSpan.setAttributes({
              'ai.stream.msToFirstChunk': msToFirstChunk,
            });
          }

          // process partial text chunks
          if (typeof chunk === 'string') {
            accumulatedText += chunk;
            delta += chunk;

            const { value: currentObjectJson, state: parseState } =
              parsePartialJson(accumulatedText);

            if (
              currentObjectJson !== undefined &&
              !isDeepEqualData(latestObjectJson, currentObjectJson)
            ) {
              const validationResult = outputStrategy.validatePartialResult({
                value: currentObjectJson,
                parseState,
              });

              if (
                validationResult.success &&
                !isDeepEqualData(latestObject, validationResult.value)
              ) {
                // inside inner check to correctly parse the final element in array mode:
                latestObjectJson = currentObjectJson;
                latestObject = validationResult.value;

                controller.enqueue({
                  type: 'object',
                  object: latestObject,
                });

                controller.enqueue({
                  type: 'text-delta',
                  textDelta: delta,
                });

                delta = '';
              }
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

              // store usage and metadata for promises and onFinish callback:
              usage = calculateCompletionTokenUsage(chunk.usage);
              providerMetadata = chunk.providerMetadata;

              controller.enqueue({ ...chunk, usage });

              // resolve promises that can be resolved now:
              resolveUsage(usage);
              resolveProviderMetadata(providerMetadata);

              // resolve the object promise with the latest object:
              const validationResult =
                outputStrategy.validateFinalResult(latestObjectJson);

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
              experimental_providerMetadata: providerMetadata,
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

  get object(): Promise<RESULT> {
    return this.objectPromise.value;
  }

  get partialObjectStream(): AsyncIterableStream<PARTIAL> {
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

  get elementStream(): ELEMENT_STREAM {
    return this.outputStrategy.createElementStream(this.originalStream);
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

  get fullStream(): AsyncIterableStream<ObjectStreamPart<PARTIAL>> {
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
