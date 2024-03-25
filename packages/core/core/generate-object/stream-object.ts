import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1CallWarning,
  LanguageModelV1StreamPart,
} from '../../ai-model-specification';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getInputFormat } from '../prompt/get-input-format';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { DeepPartial } from '../util/deep-partial';
import { isDeepEqualData } from '../util/is-deep-equal-data';
import { parsePartialJson } from '../util/parse-partial-json';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { injectJsonSchemaIntoSystem } from './inject-json-schema-into-system';

/**
 * Stream an object as a partial object stream.
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
    model: LanguageModelV1;
    schema: z.Schema<T>;
    mode?: 'auto' | 'json' | 'tool' | 'grammar';
  }): Promise<StreamObjectResult<T>> {
  const retry = retryWithExponentialBackoff({ maxRetries });
  const jsonSchema = zodToJsonSchema(schema);

  // use the default provider mode when the mode is set to 'auto' or unspecified
  if (mode === 'auto' || mode == null) {
    mode = model.defaultObjectGenerationMode;
  }

  let callOptions: LanguageModelV1CallOptions;
  let transformer: Transformer<LanguageModelV1StreamPart>;

  switch (mode) {
    case 'json': {
      callOptions = {
        mode: { type: 'object-json' },
        ...prepareCallSettings(settings),
        inputFormat: getInputFormat({ prompt, messages }),
        prompt: convertToLanguageModelPrompt({
          system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
          prompt,
          messages,
        }),
        abortSignal,
      };

      transformer = {
        transform: (chunk, controller) => {
          switch (chunk.type) {
            case 'text-delta':
              controller.enqueue(chunk.textDelta);
              break;
            case 'error':
              controller.enqueue(chunk);
              break;
          }
        },
      };

      break;
    }

    case 'grammar': {
      callOptions = {
        mode: { type: 'object-grammar', schema: jsonSchema },
        ...settings,
        inputFormat: getInputFormat({ prompt, messages }),
        prompt: convertToLanguageModelPrompt({
          system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
          prompt,
          messages,
        }),
        abortSignal,
      };

      transformer = {
        transform: (chunk, controller) => {
          switch (chunk.type) {
            case 'text-delta':
              controller.enqueue(chunk.textDelta);
              break;
            case 'error':
              controller.enqueue(chunk);
              break;
          }
        },
      };

      break;
    }

    case 'tool': {
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
        inputFormat: getInputFormat({ prompt, messages }),
        prompt: convertToLanguageModelPrompt({ system, prompt, messages }),
        abortSignal,
      };

      transformer = {
        transform(chunk, controller) {
          switch (chunk.type) {
            case 'tool-call-delta':
              controller.enqueue(chunk.argsTextDelta);
              break;
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

export class StreamObjectResult<T> {
  private readonly originalStream: ReadableStream<string | ErrorStreamPart>;

  readonly warnings: LanguageModelV1CallWarning[] | undefined;

  constructor({
    stream,
    warnings,
  }: {
    stream: ReadableStream<string | ErrorStreamPart>;
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
}

export type ErrorStreamPart = { type: 'error'; error: unknown };
