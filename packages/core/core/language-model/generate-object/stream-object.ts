import { PartialDeep } from 'type-fest';
import { z } from 'zod';
import { ZodSchema } from '../../schema/zod-schema';
import { isDeepEqualData } from '../../util/is-deep-equal-data';
import { parsePartialJson } from '../../util/parse-partial-json';
import { ErrorStreamPart, LanguageModel } from '../language-model';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { convertInstructionPromptToChatPrompt } from '../prompt/convert-instruction-prompt-to-chat-prompt';
import { injectJsonSchemaIntoInstructionPrompt } from './inject-json-schema-into-instruction-prompt';

/**
 * Stream an object as a partial object stream.
 */
export async function streamObject<T>({
  model,
  schema: zodSchema,
  prompt,
}: {
  model: LanguageModel;
  schema: z.Schema<T>;
  prompt: InstructionPrompt;
}): Promise<StreamObjectResult<T>> {
  const schema = new ZodSchema(zodSchema);
  const jsonSchema = schema.getJsonSchema();
  const objectMode = model.objectMode;

  let modelStream: ReadableStream<
    | {
        type: 'json-text-delta';
        textDelta: string;
      }
    | ErrorStreamPart
  >;

  switch (objectMode) {
    case 'json': {
      modelStream = await model.doStreamJsonText({
        mode: { type: 'json' },
        prompt: convertInstructionPromptToChatPrompt(
          injectJsonSchemaIntoInstructionPrompt({
            prompt,
            schema: jsonSchema,
          }),
        ),
      });

      break;
    }

    case 'tool': {
      modelStream = await model.doStreamJsonText({
        mode: {
          type: 'tool',
          tool: {
            name: 'json',
            description: 'Respond with a JSON object.',
            parameters: jsonSchema,
          },
        },
        prompt: convertInstructionPromptToChatPrompt(prompt),
      });

      break;
    }

    default: {
      const _exhaustiveCheck: never = objectMode;
      throw new Error(`Unsupported objectMode: ${_exhaustiveCheck}`);
    }
  }

  return new StreamObjectResult(modelStream);
}

export class StreamObjectResult<T> {
  readonly objectStream: AsyncIterable<
    PartialDeep<T, { recurseIntoArrays: true }>
  >;

  constructor(
    modelStream: ReadableStream<
      { type: 'json-text-delta'; textDelta: string } | ErrorStreamPart
    >,
  ) {
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

              if (value.type === 'json-text-delta') {
                accumulatedText += value.textDelta;

                const currentObject = parsePartialJson(
                  accumulatedText,
                ) as PartialDeep<T, { recurseIntoArrays: true }>;

                if (!isDeepEqualData(latestObject, currentObject)) {
                  latestObject = currentObject;

                  return { value: currentObject, done: false };
                }
              }
            }
          },
        };
      },
    };
  }
}
