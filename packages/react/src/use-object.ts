import { isAbortError } from '@ai-sdk/provider-utils';
import {
  DeepPartial,
  FetchFunction,
  isDeepEqualData,
  parsePartialJson,
} from '@ai-sdk/ui-utils';
import { useCallback, useId, useRef, useState } from 'react';
import useSWR from 'swr';
import z from 'zod';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export type Experimental_UseObjectOptions<RESULT> = {
  /**
   * The API endpoint. It should stream JSON that matches the schema as chunked text.
   */
  api: string;

  /**
   * A Zod schema that defines the shape of the complete object.
   */
  schema: z.Schema<RESULT, z.ZodTypeDef, any>;

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

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;

  /**
Callback that is called when the stream has finished.
     */
  onFinish?: (event: {
    /**
The generated object (typed according to the schema).
Can be undefined if the final object does not match the schema.
   */
    object: RESULT | undefined;

    /**
Optional error object. This is e.g. a TypeValidationError when the final object does not match the schema.
 */
    error: Error | undefined;
  }) => Promise<void> | void;

  /**
   * Callback function to be called when an error is encountered.
   */
  onError?: (error: Error) => void;
};

export type Experimental_UseObjectHelpers<RESULT, INPUT> = {
  /**
   * @deprecated Use `submit` instead.
   */
  setInput: (input: INPUT) => void;

  /**
   * Calls the API with the provided input as JSON body.
   */
  submit: (input: INPUT) => void;

  /**
   * The current value for the generated object. Updated as the API streams JSON chunks.
   */
  object: DeepPartial<RESULT> | undefined;

  /**
   * The error object of the API request if any.
   */
  error: undefined | unknown;

  /**
   * Flag that indicates whether an API request is in progress.
   */
  isLoading: boolean;

  /**
   * Abort the current request immediately, keep the current partial object if any.
   */
  stop: () => void;
};

function useObject<RESULT, INPUT = any>({
  api,
  id,
  schema, // required, in the future we will use it for validation
  initialValue,
  fetch,
  onError,
  onFinish,
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

  const [error, setError] = useState<undefined | unknown>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  // Abort controller to cancel the current API call.
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    try {
      abortControllerRef.current?.abort();
    } catch (ignored) {
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  const submit = async (input: INPUT) => {
    try {
      mutate(undefined); // reset the data
      setIsLoading(true);
      setError(undefined);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const actualFetch = fetch ?? getOriginalFetch();
      const response = await actualFetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(
          (await response.text()) ?? 'Failed to fetch the response.',
        );
      }

      if (response.body == null) {
        throw new Error('The response body is empty.');
      }

      let accumulatedText = '';
      let latestObject: DeepPartial<RESULT> | undefined = undefined;

      await response.body.pipeThrough(new TextDecoderStream()).pipeTo(
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

          close() {
            setIsLoading(false);
            abortControllerRef.current = null;

            if (onFinish != null) {
              const validationResult = schema.safeParse(latestObject);
              onFinish(
                validationResult.success
                  ? { object: validationResult.data, error: undefined }
                  : { object: undefined, error: validationResult.error },
              );
            }
          },
        }),
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (onError && error instanceof Error) {
        onError(error);
      }

      setError(error);
    }
  };

  return {
    setInput: submit, // Deprecated
    submit,
    object: data,
    error,
    isLoading,
    stop,
  };
}

export const experimental_useObject = useObject;
