import {
  LanguageModelV1CallOptions,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import {
  DeepPartial,
  isDeepEqualData,
  parsePartialJson,
} from '@ai-sdk/ui-utils';
import { z } from 'zod';
import { TokenUsage, calculateTokenUsage } from '../generate-text/token-usage';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getValidatedPrompt } from '../prompt/get-validated-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import { CallWarning, FinishReason, LanguageModel, LogProbs } from '../types';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { convertZodToJSONSchema } from '../util/convert-zod-to-json-schema';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { injectJsonSchemaIntoSystem } from './inject-json-schema-into-system';
import { prepareResponseHeaders } from '../util/prepare-response-headers';

/**
Generate a structured, typed object for a given prompt and schema using a language model.

This function streams the output. If you do not want to stream the output, use `generateObject` instead.

@param model - The language model to use.

@param schema - The schema of the object that the model should generate.
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

@return
A result object for accessing the partial object stream and additional information.
 */
export async function streamObject<T>({
  model,
  schema,
  mode,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
  onFinish,
  ...settings
}: CallSettings &
  Prompt & {
    /**
The language model to use.
     */
    model: LanguageModel;

    /**
The schema of the object that the model should generate.
 */
    schema: z.Schema<T>;

    /**
The mode to use for object generation.

The Zod schema is converted in a JSON schema and used in one of the following ways

- 'auto': The provider will choose the best mode for the model.
- 'tool': A tool with the JSON schema as parameters is is provided and the provider is instructed to use it.
- 'json': The JSON schema and a instruction is injected into the prompt. If the provider supports JSON mode, it is enabled.
- 'grammar': The provider is instructed to converted the JSON schema into a provider specific grammar and use it to select the output tokens.

Please note that most providers do not support all modes.

Default and recommended: 'auto' (best mode for the model).
     */
    mode?: 'auto' | 'json' | 'tool' | 'grammar';

    /**
Callback that is called when the LLM response and the final object validation are finished.
     */
    onFinish?: (event: {
      /**
The token usage of the generated response.
*/
      usage: TokenUsage;

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
  }): Promise<StreamObjectResult<T>> {
  const retry = retryWithExponentialBackoff({ maxRetries });
  const jsonSchema = convertZodToJSONSchema(schema);

  // use the default provider mode when the mode is set to 'auto' or unspecified
  if (mode === 'auto' || mode == null) {
    mode = model.defaultObjectGenerationMode;
  }

  let callOptions: LanguageModelV1CallOptions;
  let transformer: Transformer<LanguageModelV1StreamPart>;

  switch (mode) {
    case 'json': {
      const validatedPrompt = getValidatedPrompt({
        system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
        prompt,
        messages,
      });

      callOptions = {
        mode: { type: 'object-json' },
        ...prepareCallSettings(settings),
        inputFormat: validatedPrompt.type,
        prompt: convertToLanguageModelPrompt(validatedPrompt),
        abortSignal,
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

    case 'grammar': {
      const validatedPrompt = getValidatedPrompt({
        system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
        prompt,
        messages,
      });

      callOptions = {
        mode: { type: 'object-grammar', schema: jsonSchema },
        ...prepareCallSettings(settings),
        inputFormat: validatedPrompt.type,
        prompt: convertToLanguageModelPrompt(validatedPrompt),
        abortSignal,
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
            name: 'json',
            description: 'Respond with a JSON object.',
            parameters: jsonSchema,
          },
        },
        ...prepareCallSettings(settings),
        inputFormat: validatedPrompt.type,
        prompt: convertToLanguageModelPrompt(validatedPrompt),
        abortSignal,
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
      throw new Error('Model does not have a default object generation mode.');
    }

    default: {
      const _exhaustiveCheck: never = mode;
      throw new Error(`Unsupported mode: ${_exhaustiveCheck}`);
    }
  }

  const result = await retry(() => model.doStream(callOptions));

  return new StreamObjectResult({
    stream: result.stream.pipeThrough(new TransformStream(transformer)),
    warnings: result.warnings,
    rawResponse: result.rawResponse,
    schema,
    onFinish,
  });
}

export type ObjectStreamInputPart =
  | {
      type: 'error';
      error: unknown;
    }
  | {
      type: 'finish';
      finishReason: FinishReason;
      logprobs?: LogProbs;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    };

export type ObjectStreamPart<T> =
  | ObjectStreamInputPart
  | {
      type: 'object';
      object: DeepPartial<T>;
      delta: string;
    };

/**
The result of a `streamObject` call that contains the partial object stream and additional information.
 */
export class StreamObjectResult<T> {
  private readonly originalStream: ReadableStream<ObjectStreamPart<T>>;

  /**
Warnings from the model provider (e.g. unsupported settings)
   */
  readonly warnings: CallWarning[] | undefined;

  /**
The generated object (typed according to the schema). Resolved when the response is finished.
   */
  readonly object: Promise<T>;

  /**
The token usage of the generated response. Resolved when the response is finished.
   */
  readonly usage: Promise<TokenUsage>;

  /**
Optional raw response data.
   */
  rawResponse?: {
    /**
Response headers.
 */
    headers?: Record<string, string>;
  };

  constructor({
    stream,
    warnings,
    rawResponse,
    schema,
    onFinish,
  }: {
    stream: ReadableStream<string | ObjectStreamInputPart>;
    warnings: CallWarning[] | undefined;
    rawResponse?: {
      headers?: Record<string, string>;
    };
    schema: z.Schema<T>;
    onFinish: Parameters<typeof streamObject<T>>[0]['onFinish'];
  }) {
    this.warnings = warnings;
    this.rawResponse = rawResponse;

    // initialize object promise
    let resolveObject: (value: T | PromiseLike<T>) => void;
    let rejectObject: (reason?: any) => void;
    this.object = new Promise<T>((resolve, reject) => {
      resolveObject = resolve;
      rejectObject = reject;
    });

    // initialize usage promise
    let resolveUsage: (value: TokenUsage | PromiseLike<TokenUsage>) => void;
    this.usage = new Promise<TokenUsage>(resolve => {
      resolveUsage = resolve;
    });

    // store information for onFinish callback:
    let usage: TokenUsage | undefined;
    let object: T | undefined;
    let error: unknown | undefined;

    // pipe chunks through a transformation stream that extracts metadata:
    let accumulatedText = '';
    let delta = '';
    let latestObject: DeepPartial<T> | undefined = undefined;

    this.originalStream = stream.pipeThrough(
      new TransformStream<string | ObjectStreamInputPart, ObjectStreamPart<T>>({
        async transform(chunk, controller): Promise<void> {
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
                delta,
              });

              delta = '';
            }

            return;
          }

          switch (chunk.type) {
            case 'finish': {
              // store usage for promises and onFinish callback:
              usage = calculateTokenUsage(chunk.usage);

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
                resolveObject(object);
              } else {
                error = validationResult.error;
                rejectObject(error);
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
            // call onFinish callback:
            await onFinish?.({
              usage: usage ?? {
                promptTokens: NaN,
                completionTokens: NaN,
                totalTokens: NaN,
              },
              object,
              error,
              rawResponse,
              warnings,
            });
          } catch (error) {
            controller.error(error);
          }
        },
      }),
    );
  }

  get partialObjectStream(): AsyncIterableStream<DeepPartial<T>> {
    return createAsyncIterableStream(this.originalStream, {
      transform(chunk, controller) {
        switch (chunk.type) {
          case 'object':
            controller.enqueue(chunk.object);
            break;

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
          case 'object':
            controller.enqueue(chunk.delta);
            break;

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

  /**
Creates a simple text stream response.
Each text delta is encoded as UTF-8 and sent as a separate chunk.
Non-text-delta events are ignored.

@param init Optional headers and status code.
   */
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
