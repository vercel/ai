import {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1CallWarning,
  LanguageModelV1LogProbs,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import { z } from 'zod';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getValidatedPrompt } from '../prompt/get-validated-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { convertZodToJSONSchema } from '../util/convert-zod-to-json-schema';
import { DeepPartial } from '../util/deep-partial';
import { isDeepEqualData } from '../util/is-deep-equal-data';
import { parsePartialJson } from '../util/parse-partial-json';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { injectJsonSchemaIntoSystem } from './inject-json-schema-into-system';

/**
Generate a structured, typed object for a given prompt and schema using a language model.

This function streams the output. If you do not want to stream the output, use `experimental_generateObject` instead.

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
export async function experimental_streamObject<T>({
  model,
  schema,
  mode,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
  ...settings
}: CallSettings &
  Prompt & {
    /**
The language model to use.
     */
    model: LanguageModelV1;

    /**
The schema of the object that the model should generate.
 */
    schema: z.Schema<T>;

    /**
The mode to use for object generation. Not all models support all modes.

Default and recommended: 'auto' (best mode for the model).
 */
    mode?: 'auto' | 'json' | 'tool' | 'grammar';
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
            case 'log-probs':
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
        ...settings,
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
            case 'log-probs':
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
        ...settings,
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
            case 'log-probs':
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
  });
}

/**
The result of a `streamObject` call that contains the partial object stream and additional information.
 */
export class StreamObjectResult<T> {
  private readonly originalStream: ReadableStream<string | LogprobsStreamPart | ErrorStreamPart>;

  /**
Warnings from the model provider (e.g. unsupported settings)
   */
  readonly warnings: LanguageModelV1CallWarning[] | undefined;

  constructor({
    stream,
    warnings,
  }: {
    stream: ReadableStream<string | LogprobsStreamPart | ErrorStreamPart>;
    warnings: LanguageModelV1CallWarning[] | undefined;
  }) {
    this.originalStream = stream;
    this.warnings = warnings;
  }

  get partialObjectStream(): AsyncIterableStream<DeepPartial<T>> {
    let accumulatedText = '';
    let latestObject: DeepPartial<T> | undefined = undefined;

    return createAsyncIterableStream(this.originalStream, {
      transform(chunk, controller) {
        if (typeof chunk === 'string') {
          accumulatedText += chunk;

          const currentObject = parsePartialJson(
            accumulatedText,
          ) as DeepPartial<T>;

          if (!isDeepEqualData(latestObject, currentObject)) {
            latestObject = currentObject;

            controller.enqueue(currentObject);
          }
        }

        if (typeof chunk === 'object' && chunk.type === 'error') {
          throw chunk.error;
        }
      },
    });
  }

  get partialLogprobsStream(): AsyncIterableStream<LanguageModelV1LogProbs> {

    return createAsyncIterableStream(this.originalStream, {
      transform(chunk, controller) {
        if (typeof chunk === 'object' && chunk.type === 'log-probs') {
          controller.enqueue(chunk.logprobs)
        }
      },
    });
  }
}

export type ErrorStreamPart = { type: 'error'; error: unknown };

export type LogprobsStreamPart = { type: 'log-probs'; logprobs: LanguageModelV1LogProbs };