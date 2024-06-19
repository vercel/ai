import {
  DeepPartial,
  isDeepEqualData,
  parsePartialJson,
} from '@ai-sdk/ui-utils';
import { useId } from 'react';
import useSWR from 'swr';
import z from 'zod';

export type Experimental_UseObjectOptions<RESULT> = {
  /** The API endpoint */
  api: string;

  /**
   * An unique identifier. If not provided, a random one will be
   * generated. When provided, the `useObject` hook with the same `id` will
   * have shared states across components.
   */
  id?: string;

  schema: z.Schema<RESULT>;

  initialValue?: DeepPartial<RESULT>;
};

export type Experimental_UseObjectHelpers<RESULT, INPUT> = {
  setInput: (input: INPUT) => void;
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
