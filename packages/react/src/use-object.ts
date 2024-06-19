import {
  DeepPartial,
  isDeepEqualData,
  parsePartialJson,
} from '@ai-sdk/ui-utils';
import { useId } from 'react';
import useSWR from 'swr';
import z from 'zod';

export type Experimental_UseObjectOptions<RESULT> = {
  /**
   * The API endpoint. It should stream JSON that matches the schema as chunked text.
   */
  api: string;

  /**
   * A Zod schema that defines the shape of the complete object.
   */
  schema: z.Schema<RESULT>;

  /**
   * An unique identifier. If not provided, a random one will be
   * generated. When provided, the `useObject` hook with the same `id` will
   * have shared states across components.
   */
  id?: string;

  /**
   * An optional value for the initial object.
   */
  initialValue?: DeepPartial<RESULT>;
};

export type Experimental_UseObjectHelpers<RESULT, INPUT> = {
  /**
   * Calls the API with the provided input as JSON body.
   */
  setInput: (input: INPUT) => void;

  /**
   * The current value for the generated object. Updated as the API streams JSON chunks.
   */
  object: DeepPartial<RESULT> | undefined;
};

function useObject<RESULT, INPUT = any>({
  api,
  id,
  schema, // required, in the future we will use it for validation
  initialValue,
}: Experimental_UseObjectOptions<RESULT>): Experimental_UseObjectHelpers<
  RESULT,
  INPUT
> {
  // Generate an unique id if not provided.
  const hookId = useId();
  const completionId = id ?? hookId;

  // Store the completion state in SWR, using the completionId as the key to share states.
  const { data, mutate } = useSWR<DeepPartial<RESULT>>(
    [api, completionId],
    null,
    { fallbackData: initialValue },
  );

  return {
    async setInput(input) {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      let accumulatedText = '';
      let latestObject: DeepPartial<RESULT> | undefined = undefined;

      response.body!.pipeThrough(new TextDecoderStream()).pipeTo(
        new WritableStream<string>({
          write(chunk) {
            accumulatedText += chunk;

            const currentObject = parsePartialJson(
              accumulatedText,
            ) as DeepPartial<RESULT>;

            if (!isDeepEqualData(latestObject, currentObject)) {
              latestObject = currentObject;

              mutate(currentObject);
            }
          },
        }),
      );
    },
    object: data,
  };
}

export const experimental_useObject = useObject;
