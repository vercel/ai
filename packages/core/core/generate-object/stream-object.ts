import { PartialDeep } from 'type-fest';
import { z } from 'zod';
import {
  ErrorStreamPart,
  LanguageModel,
  LanguageModelStreamPart,
} from '../language-model';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { Prompt } from '../prompt/prompt';
import { ZodSchema } from '../schema/zod-schema';
import { isDeepEqualData } from '../util/is-deep-equal-data';
import { parsePartialJson } from '../util/parse-partial-json';
import { injectJsonSchemaIntoSystem } from './inject-json-schema-into-system';
import { getInputFormat } from '../prompt/get-input-format';

/**
 * Stream an object as a partial object stream.
 */
export async function streamObject<T>({
  model,
  schema: zodSchema,
  mode,
  system,
  prompt,
  messages,
  ...settings
}: CallSettings &
  Prompt & {
    model: LanguageModel;
    schema: z.Schema<T>;
    mode?: 'auto' | 'json' | 'tool' | 'grammar';
  }): Promise<StreamObjectResult<T>> {
  const schema = new ZodSchema(zodSchema);
  const jsonSchema = schema.getJsonSchema();

  let modelStream: ReadableStream<string | ErrorStreamPart>;

  // use the default provider mode when the mode is set to 'auto' or unspecified
  if (mode === 'auto' || mode == null) {
    mode = model.defaultObjectGenerationMode;
  }

  switch (mode) {
    case 'json': {
      const { stream, warnings } = await model.doStream({
        mode: { type: 'object-json' },
        ...settings,
        inputFormat: getInputFormat({ prompt, messages }),
        prompt: convertToLanguageModelPrompt({
          system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
          prompt,
          messages,
        }),
      });

      // TODO remove duplication
      modelStream = stream.pipeThrough(
        new TransformStream<LanguageModelStreamPart, string | ErrorStreamPart>({
          transform(chunk, controller) {
            switch (chunk.type) {
              case 'text-delta':
                controller.enqueue(chunk.textDelta);
                break;
              case 'error':
                controller.enqueue(chunk);
                break;
            }
          },
        }),
      );

      break;
    }

    case 'grammar': {
      const { stream, warnings } = await model.doStream({
        mode: { type: 'object-grammar', schema: jsonSchema },
        ...settings,
        inputFormat: getInputFormat({ prompt, messages }),
        prompt: convertToLanguageModelPrompt({
          system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
          prompt,
          messages,
        }),
      });

      // TODO remove duplication
      modelStream = stream.pipeThrough(
        new TransformStream<LanguageModelStreamPart, string | ErrorStreamPart>({
          transform(chunk, controller) {
            switch (chunk.type) {
              case 'text-delta':
                controller.enqueue(chunk.textDelta);
                break;
              case 'error':
                controller.enqueue(chunk);
                break;
            }
          },
        }),
      );

      break;
    }

    case 'tool': {
      const { stream, warnings } = await model.doStream({
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
      });

      modelStream = stream.pipeThrough(
        new TransformStream<LanguageModelStreamPart, string | ErrorStreamPart>({
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
        }),
      );

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

  return new StreamObjectResult(modelStream);
}

export class StreamObjectResult<T> {
  readonly objectStream: AsyncIterable<
    PartialDeep<T, { recurseIntoArrays: true }>
  >;

  constructor(modelStream: ReadableStream<string | ErrorStreamPart>) {
    let accumulatedText = '';
    let latestObject: PartialDeep<T, { recurseIntoArrays: true }> | undefined =
      undefined;

    this.objectStream = {
      [Symbol.asyncIterator](): AsyncIterator<
        PartialDeep<T, { recurseIntoArrays: true }>
      > {
        const reader = modelStream.getReader();
        return {
          next: async () => {
            // loops until a text delta is found or the stream is finished:
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                return { value: null, done: true };
              }

              if (typeof value === 'string') {
                accumulatedText += value;

                const currentObject = parsePartialJson(
                  accumulatedText,
                ) as PartialDeep<T, { recurseIntoArrays: true }>;

                if (!isDeepEqualData(latestObject, currentObject)) {
                  latestObject = currentObject;

                  return { value: currentObject, done: false };
                }
              }

              // TODO handle error parts
            }
          },
        };
      },
    };
  }
}
