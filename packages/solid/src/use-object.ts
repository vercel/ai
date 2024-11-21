import {
  FetchFunction,
  isAbortError,
  safeValidateTypes,
} from '@ai-sdk/provider-utils';
import {
  asSchema,
  DeepPartial,
  isDeepEqualData,
  parsePartialJson,
  Schema,
} from '@ai-sdk/ui-utils';
import { Accessor, createMemo, createSignal, createUniqueId } from 'solid-js';
import z from 'zod';
import { convertToAccessorOptions } from './utils/convert-to-accessor-options';
import { ReactiveLRU } from './utils/reactive-lru';

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
  schema: z.Schema<RESULT, z.ZodTypeDef, any> | Schema<RESULT>;

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

  /**
   * Additional HTTP headers to be included in the request.
   */
  headers?: Record<string, string> | Headers;
};

export type Experimental_UseObjectHelpers<RESULT, INPUT> = {
  /**
   * Calls the API with the provided input as JSON body.
   */
  submit: (input: INPUT) => void;

  /**
   * The current value for the generated object. Updated as the API streams JSON chunks.
   */
  object: Accessor<DeepPartial<RESULT> | undefined>;

  /**
   * The error object of the API request if any.
   */
  error: Accessor<Error | undefined>;

  /**
   * Flag that indicates whether an API request is in progress.
   */
  isLoading: Accessor<boolean>;

  /**
   * Abort the current request immediately, keep the current partial object if any.
   */
  stop: () => void;
};

const objectCache = new ReactiveLRU<string, DeepPartial<any>>();

function useObject<RESULT, INPUT = any>(
  rawUseObjectOptions:
    | Experimental_UseObjectOptions<RESULT>
    | Accessor<Experimental_UseObjectOptions<RESULT>>,
): Experimental_UseObjectHelpers<RESULT, INPUT> {
  const useObjectOptions = createMemo(() =>
    convertToAccessorOptions(rawUseObjectOptions),
  );

  const api = createMemo(() => useObjectOptions().api?.() ?? '/api/object');
  // Generate an unique id for the completion if not provided.
  const idKey = createMemo(
    () => useObjectOptions().id?.() ?? `object-${createUniqueId()}`,
  );

  const data = createMemo(
    () =>
      (objectCache.get(idKey()) ?? useObjectOptions().initialValue?.()) as
        | DeepPartial<RESULT>
        | undefined,
  );

  const mutate = (value: DeepPartial<RESULT> | undefined) => {
    objectCache.set(idKey(), value);
  };

  const [error, setError] = createSignal<Error>();
  const [isLoading, setIsLoading] = createSignal(false);

  // Abort controller to cancel the current API call.
  let abortControllerRef: AbortController | null = null;

  const stop = () => {
    try {
      abortControllerRef?.abort();
    } catch (ignored) {
    } finally {
      setIsLoading(false);
      abortControllerRef = null;
    }
  };

  const submit = async (input: INPUT) => {
    try {
      mutate(undefined); // reset the data
      setIsLoading(true);
      setError(undefined);

      const abortController = new AbortController();
      abortControllerRef = abortController;

      const actualFetch = fetch ?? getOriginalFetch();
      const response = await actualFetch(useObjectOptions().api(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...useObjectOptions().headers?.(),
        },
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

            const { value } = parsePartialJson(accumulatedText);
            const currentObject = value as DeepPartial<RESULT>;

            if (!isDeepEqualData(latestObject, currentObject)) {
              latestObject = currentObject;

              mutate(currentObject);
            }
          },

          close() {
            setIsLoading(false);
            abortControllerRef = null;

            const onFinish = useObjectOptions().onFinish?.();
            if (onFinish != null) {
              const validationResult = safeValidateTypes({
                value: latestObject,
                schema: asSchema(useObjectOptions().schema()),
              });

              onFinish(
                validationResult.success
                  ? { object: validationResult.value, error: undefined }
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

      const onError = useObjectOptions().onError?.();
      if (onError && error instanceof Error) {
        onError(error);
      }

      setIsLoading(false);
      setError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  return {
    submit,
    object: data,
    error,
    isLoading,
    stop,
  };
}

export const experimental_useObject = useObject;
