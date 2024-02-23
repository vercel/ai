import { PartialDeep } from 'type-fest';
import { Schema } from '../../schema/schema';
import { isDeepEqualData } from '../../util/is-deep-equal-data';
import { parsePartialJson } from '../../util/parse-partial-json';
import { LanguageModel, LanguageModelErrorStreamPart } from '../language-model';
import { LanguageModelPrompt } from '../prompt';

/**
 * Stream an object as a partial object stream.
 */
export async function streamObject<T>({
  model,
  schema,
  prompt,
}: {
  model: LanguageModel;
  schema: Schema<T>;
  prompt: LanguageModelPrompt;
}): Promise<StreamObjectResult<T>> {
  const modelStream = await model.doStreamJsonText({
    schema,
    prompt,
  });

  return new StreamObjectResult(modelStream);
}

export class StreamObjectResult<T> {
  readonly objectStream: AsyncIterable<
    PartialDeep<T, { recurseIntoArrays: true }>
  >;

  constructor(
    modelStream: ReadableStream<
      | { type: 'json-text-delta'; textDelta: string }
      | LanguageModelErrorStreamPart
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
