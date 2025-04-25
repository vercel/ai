import {
  JSONValue,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider';
import { createIdGenerator } from '@ai-sdk/provider-utils';
import { ServerResponse } from 'http';
import { z } from 'zod';
import { NoObjectGeneratedError } from '../../errors/no-object-generated-error';
import { DelayedPromise } from '../../util/delayed-promise';
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
import { CallWarning, LanguageModel } from '../types/language-model';
import { LanguageModelRequestMetadata } from '../types/language-model-request-metadata';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { ProviderMetadata, ProviderOptions } from '../types/provider-metadata';
import {
  LanguageModelUsage,
  calculateLanguageModelUsage,
} from '../types/usage';
import {
  DeepPartial,
  Schema,
  isDeepEqualData,
  parsePartialJson,
} from '../util';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { createStitchableStream } from '../util/create-stitchable-stream';
import { now as originalNow } from '../util/now';
import { prepareOutgoingHttpHeaders } from '../util/prepare-outgoing-http-headers';
import { prepareResponseHeaders } from '../util/prepare-response-headers';
import { writeToServerResponse } from '../util/write-to-server-response';
import { OutputStrategy, getOutputStrategy } from './output-strategy';
import { ObjectStreamPart, StreamObjectResult } from './stream-object-result';
import { validateObjectGenerationInput } from './validate-object-generation-input';

const originalGenerateId = createIdGenerator({ prefix: 'aiobj', size: 24 });

/**
Callback that is set using the `onError` option.

@param event - The event that is passed to the callback.
 */
export type StreamObjectOnErrorCallback = (event: {
  error: unknown;
}) => Promise<void> | void;

/**
Callback that is set using the `onFinish` option.

@param event - The event that is passed to the callback.
 */
export type StreamObjectOnFinishCallback<RESULT> = (event: {
  /**
The token usage of the generated response.
*/
  usage: LanguageModelUsage;

  /**
The generated object. Can be undefined if the final object does not match the schema.
*/
  object: RESULT | undefined;

  /**
Optional error object. This is e.g. a TypeValidationError when the final object does not match the schema.
*/
  error: unknown | undefined;

  /**
Response metadata.
 */
  response: LanguageModelResponseMetadata;

  /**
Warnings from the model provider (e.g. unsupported settings).
*/
  warnings?: CallWarning[];

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
*/
  providerMetadata: ProviderMetadata | undefined;
}) => Promise<void> | void;

export function streamObject<
  RESULT extends SCHEMA extends z.Schema
    ? Output extends 'array'
      ? Array<z.infer<SCHEMA>>
      : z.infer<SCHEMA>
    : SCHEMA extends Schema<infer T>
      ? Output extends 'array'
        ? Array<T>
        : T
      : never,
  SCHEMA extends z.Schema | Schema = z.Schema<JSONValue>,
  Output extends 'object' | 'array' | 'no-schema' = 'object',
>(
  options: Omit<CallSettings, 'stopSequences'> &
    Prompt &
    (Output extends 'no-schema'
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
Callback that is invoked when an error occurs during streaming.
You can use it to log errors.
The stream processing will pause until the callback promise is resolved.
     */
      onError?: StreamObjectOnErrorCallback;

      /**
Callback that is called when the LLM response and the final object validation are finished.
*/
      onFinish?: StreamObjectOnFinishCallback<RESULT>;

      /**
       * Internal. For test use only. May change without notice.
       */
      _internal?: {
        generateId?: () => string;
        currentDate?: () => Date;
        now?: () => number;
      };
    },
): StreamObjectResult<
  Output extends 'array' ? RESULT : DeepPartial<RESULT>,
  Output extends 'array' ? RESULT : RESULT,
  Output extends 'array'
    ? RESULT extends Array<infer U>
      ? AsyncIterableStream<U>
      : never
    : never
> {
  const {
    model,
    output = 'object',
    system,
    prompt,
    messages,
    maxRetries,
    abortSignal,
    headers,
    experimental_telemetry: telemetry,
    providerOptions,
    onError,
    onFinish,
    _internal: {
      generateId = originalGenerateId,
      currentDate = () => new Date(),
      now = originalNow,
    } = {},
    ...settings
  } = options;

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
  });

  const outputStrategy = getOutputStrategy({ output, schema: inputSchema });

  return new DefaultStreamObjectResult({
    model,
    telemetry,
    headers,
    settings,
    maxRetries,
    abortSignal,
    outputStrategy,
    system,
    prompt,
    messages,
    schemaName,
    schemaDescription,
    providerOptions,
    onError,
    onFinish,
    generateId,
    currentDate,
    now,
  });
}

class DefaultStreamObjectResult<PARTIAL, RESULT, ELEMENT_STREAM>
  implements StreamObjectResult<PARTIAL, RESULT, ELEMENT_STREAM>
{
  private readonly objectPromise = new DelayedPromise<RESULT>();
  private readonly usagePromise = new DelayedPromise<LanguageModelUsage>();
  private readonly providerMetadataPromise = new DelayedPromise<
    ProviderMetadata | undefined
  >();
  private readonly warningsPromise = new DelayedPromise<
    CallWarning[] | undefined
  >();
  private readonly requestPromise =
    new DelayedPromise<LanguageModelRequestMetadata>();
  private readonly responsePromise =
    new DelayedPromise<LanguageModelResponseMetadata>();

  private readonly baseStream: ReadableStream<ObjectStreamPart<PARTIAL>>;

  private readonly outputStrategy: OutputStrategy<
    PARTIAL,
    RESULT,
    ELEMENT_STREAM
  >;

  constructor({
    model,
    headers,
    telemetry,
    settings,
    maxRetries: maxRetriesArg,
    abortSignal,
    outputStrategy,
    system,
    prompt,
    messages,
    schemaName,
    schemaDescription,
    providerOptions,
    onError,
    onFinish,
    generateId,
    currentDate,
    now,
  }: {
    model: LanguageModel;
    telemetry: TelemetrySettings | undefined;
    headers: Record<string, string | undefined> | undefined;
    settings: Omit<CallSettings, 'abortSignal' | 'headers'>;
    maxRetries: number | undefined;
    abortSignal: AbortSignal | undefined;
    outputStrategy: OutputStrategy<PARTIAL, RESULT, ELEMENT_STREAM>;
    system: Prompt['system'];
    prompt: Prompt['prompt'];
    messages: Prompt['messages'];
    schemaName: string | undefined;
    schemaDescription: string | undefined;
    providerOptions: ProviderOptions | undefined;
    onError: StreamObjectOnErrorCallback | undefined;
    onFinish: StreamObjectOnFinishCallback<RESULT> | undefined;
    generateId: () => string;
    currentDate: () => Date;
    now: () => number;
  }) {
    const { maxRetries, retry } = prepareRetries({
      maxRetries: maxRetriesArg,
    });

    const callSettings = prepareCallSettings(settings);

    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model,
      telemetry,
      headers,
      settings: { ...callSettings, maxRetries },
    });

    const tracer = getTracer(telemetry);
    const self = this;

    const stitchableStream =
      createStitchableStream<ObjectStreamPart<PARTIAL>>();

    const eventProcessor = new TransformStream<
      ObjectStreamPart<PARTIAL>,
      ObjectStreamPart<PARTIAL>
    >({
      transform(chunk, controller) {
        controller.enqueue(chunk);

        if (chunk.type === 'error') {
          onError?.({ error: chunk.error });
        }
      },
    });

    this.baseStream = stitchableStream.stream.pipeThrough(eventProcessor);

    recordSpan({
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
        },
      }),
      tracer,
      endWhenDone: false,
      fn: async rootSpan => {
        const standardizedPrompt = await standardizePrompt({
          prompt: { system, prompt, messages },
          tools: undefined,
        });

        const callOptions = {
          responseFormat: {
            type: 'json' as const,
            schema: outputStrategy.jsonSchema,
            name: schemaName,
            description: schemaDescription,
          },
          ...prepareCallSettings(settings),
          inputFormat: standardizedPrompt.type,
          prompt: await convertToLanguageModelPrompt({
            prompt: standardizedPrompt,
            supportedUrls: await model.getSupportedUrls(),
          }),
          providerOptions,
          abortSignal,
          headers,
        };

        const transformer: Transformer<
          LanguageModelV2StreamPart,
          ObjectStreamInputPart
        > = {
          transform: (chunk, controller) => {
            switch (chunk.type) {
              case 'text':
                controller.enqueue(chunk.text);
                break;
              case 'response-metadata':
              case 'finish':
              case 'error':
                controller.enqueue(chunk);
                break;
            }
          },
        };

        const {
          result: { stream, response, request },
          doStreamSpan,
          startTimestampMs,
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
            endWhenDone: false,
            fn: async doStreamSpan => ({
              startTimestampMs: now(),
              doStreamSpan,
              result: await model.doStream(callOptions),
            }),
          }),
        );

        self.requestPromise.resolve(request ?? {});

        // store information for onFinish callback:
        let warnings: LanguageModelV2CallWarning[] | undefined;
        let usage: LanguageModelUsage | undefined;
        let finishReason: LanguageModelV2FinishReason | undefined;
        let providerMetadata: ProviderMetadata | undefined;
        let object: RESULT | undefined;
        let error: unknown | undefined;

        // pipe chunks through a transformation stream that extracts metadata:
        let accumulatedText = '';
        let textDelta = '';
        let fullResponse: {
          id: string;
          timestamp: Date;
          modelId: string;
        } = {
          id: generateId(),
          timestamp: currentDate(),
          modelId: model.modelId,
        };

        // Keep track of raw parse result before type validation, since e.g. Zod might
        // change the object by mapping properties.
        let latestObjectJson: JSONValue | undefined = undefined;
        let latestObject: PARTIAL | undefined = undefined;
        let isFirstChunk = true;
        let isFirstDelta = true;

        const transformedStream = stream
          .pipeThrough(new TransformStream(transformer))
          .pipeThrough(
            new TransformStream<
              string | ObjectStreamInputPart,
              ObjectStreamPart<PARTIAL>
            >({
              async transform(chunk, controller): Promise<void> {
                if (
                  typeof chunk === 'object' &&
                  chunk.type === 'stream-start'
                ) {
                  warnings = chunk.warnings;
                  return; // stream start chunks are sent immediately and do not count as first chunk
                }

                // Telemetry event for first chunk:
                if (isFirstChunk) {
                  const msToFirstChunk = now() - startTimestampMs;

                  isFirstChunk = false;

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
                  textDelta += chunk;

                  const { value: currentObjectJson, state: parseState } =
                    await parsePartialJson(accumulatedText);

                  if (
                    currentObjectJson !== undefined &&
                    !isDeepEqualData(latestObjectJson, currentObjectJson)
                  ) {
                    const validationResult =
                      await outputStrategy.validatePartialResult({
                        value: currentObjectJson,
                        textDelta,
                        latestObject,
                        isFirstDelta,
                        isFinalDelta: parseState === 'successful-parse',
                      });

                    if (
                      validationResult.success &&
                      !isDeepEqualData(
                        latestObject,
                        validationResult.value.partial,
                      )
                    ) {
                      // inside inner check to correctly parse the final element in array mode:
                      latestObjectJson = currentObjectJson;
                      latestObject = validationResult.value.partial;

                      controller.enqueue({
                        type: 'object',
                        object: latestObject,
                      });

                      controller.enqueue({
                        type: 'text-delta',
                        textDelta: validationResult.value.textDelta,
                      });

                      textDelta = '';
                      isFirstDelta = false;
                    }
                  }

                  return;
                }

                switch (chunk.type) {
                  case 'response-metadata': {
                    fullResponse = {
                      id: chunk.id ?? fullResponse.id,
                      timestamp: chunk.timestamp ?? fullResponse.timestamp,
                      modelId: chunk.modelId ?? fullResponse.modelId,
                    };
                    break;
                  }

                  case 'finish': {
                    // send final text delta:
                    if (textDelta !== '') {
                      controller.enqueue({ type: 'text-delta', textDelta });
                    }

                    // store finish reason for telemetry:
                    finishReason = chunk.finishReason;

                    // store usage and metadata for promises and onFinish callback:
                    usage = calculateLanguageModelUsage(chunk.usage);
                    providerMetadata = chunk.providerMetadata;

                    controller.enqueue({
                      ...chunk,
                      usage,
                      response: fullResponse,
                    });

                    // resolve promises that can be resolved now:
                    self.usagePromise.resolve(usage);
                    self.providerMetadataPromise.resolve(providerMetadata);
                    self.responsePromise.resolve({
                      ...fullResponse,
                      headers: response?.headers,
                    });

                    // resolve the object promise with the latest object:
                    const validationResult =
                      await outputStrategy.validateFinalResult(
                        latestObjectJson,
                        {
                          text: accumulatedText,
                          response: fullResponse,
                          usage,
                        },
                      );

                    if (validationResult.success) {
                      object = validationResult.value;
                      self.objectPromise.resolve(object);
                    } else {
                      error = new NoObjectGeneratedError({
                        message:
                          'No object generated: response did not match schema.',
                        cause: validationResult.error,
                        text: accumulatedText,
                        response: fullResponse,
                        usage,
                        finishReason,
                      });
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
                        'ai.response.finishReason': finishReason,
                        'ai.response.object': {
                          output: () => JSON.stringify(object),
                        },
                        'ai.response.id': fullResponse.id,
                        'ai.response.model': fullResponse.modelId,
                        'ai.response.timestamp':
                          fullResponse.timestamp.toISOString(),

                        'ai.usage.promptTokens': finalUsage.promptTokens,
                        'ai.usage.completionTokens':
                          finalUsage.completionTokens,

                        // standardized gen-ai llm span attributes:
                        'gen_ai.response.finish_reasons': [finishReason],
                        'gen_ai.response.id': fullResponse.id,
                        'gen_ai.response.model': fullResponse.modelId,
                        'gen_ai.usage.input_tokens': finalUsage.promptTokens,
                        'gen_ai.usage.output_tokens':
                          finalUsage.completionTokens,
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
                        'ai.usage.completionTokens':
                          finalUsage.completionTokens,
                        'ai.response.object': {
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
                    response: {
                      ...fullResponse,
                      headers: response?.headers,
                    },
                    warnings,
                    providerMetadata,
                  });
                } catch (error) {
                  controller.enqueue({ type: 'error', error });
                } finally {
                  rootSpan.end();
                }
              },
            }),
          );

        stitchableStream.addStream(transformedStream);
      },
    })
      .catch(error => {
        // add an empty stream with an error to break the stream:
        stitchableStream.addStream(
          new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'error', error });
              controller.close();
            },
          }),
        );
      })
      .finally(() => {
        stitchableStream.close();
      });

    this.outputStrategy = outputStrategy;
  }

  get object() {
    return this.objectPromise.value;
  }

  get usage() {
    return this.usagePromise.value;
  }

  get providerMetadata() {
    return this.providerMetadataPromise.value;
  }

  get warnings() {
    return this.warningsPromise.value;
  }

  get request() {
    return this.requestPromise.value;
  }

  get response() {
    return this.responsePromise.value;
  }

  get partialObjectStream(): AsyncIterableStream<PARTIAL> {
    return createAsyncIterableStream(
      this.baseStream.pipeThrough(
        new TransformStream<ObjectStreamPart<PARTIAL>, PARTIAL>({
          transform(chunk, controller) {
            switch (chunk.type) {
              case 'object':
                controller.enqueue(chunk.object);
                break;

              case 'text-delta':
              case 'finish':
              case 'error': // suppress error (use onError instead)
                break;

              default: {
                const _exhaustiveCheck: never = chunk;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          },
        }),
      ),
    );
  }

  get elementStream(): ELEMENT_STREAM {
    return this.outputStrategy.createElementStream(this.baseStream);
  }

  get textStream(): AsyncIterableStream<string> {
    return createAsyncIterableStream(
      this.baseStream.pipeThrough(
        new TransformStream<ObjectStreamPart<PARTIAL>, string>({
          transform(chunk, controller) {
            switch (chunk.type) {
              case 'text-delta':
                controller.enqueue(chunk.textDelta);
                break;

              case 'object':
              case 'finish':
              case 'error': // suppress error (use onError instead)
                break;

              default: {
                const _exhaustiveCheck: never = chunk;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          },
        }),
      ),
    );
  }

  get fullStream(): AsyncIterableStream<ObjectStreamPart<PARTIAL>> {
    return createAsyncIterableStream(this.baseStream);
  }

  pipeTextStreamToResponse(response: ServerResponse, init?: ResponseInit) {
    writeToServerResponse({
      response,
      status: init?.status,
      statusText: init?.statusText,
      headers: prepareOutgoingHttpHeaders(init?.headers, {
        contentType: 'text/plain; charset=utf-8',
      }),
      stream: this.textStream.pipeThrough(new TextEncoderStream()),
    });
  }

  toTextStreamResponse(init?: ResponseInit): Response {
    return new Response(this.textStream.pipeThrough(new TextEncoderStream()), {
      status: init?.status ?? 200,
      headers: prepareResponseHeaders(init?.headers, {
        contentType: 'text/plain; charset=utf-8',
      }),
    });
  }
}

export type ObjectStreamInputPart =
  | string
  | {
      type: 'stream-start';
      warnings: LanguageModelV2CallWarning[];
    }
  | {
      type: 'error';
      error: unknown;
    }
  | {
      type: 'response-metadata';
      id?: string;
      timestamp?: Date;
      modelId?: string;
    }
  | {
      type: 'finish';
      finishReason: LanguageModelV2FinishReason;
      usage: LanguageModelV2Usage;
      providerMetadata?: SharedV2ProviderMetadata;
    };
