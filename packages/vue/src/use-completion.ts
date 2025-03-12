import type {
  JSONValue,
  RequestOptions,
  UseCompletionOptions,
} from '@ai-sdk/ui-utils';
import { callCompletionApi } from '@ai-sdk/ui-utils';
import swrv from 'swrv';
import type { Ref } from 'vue';
import { ref, unref } from 'vue';

export type { UseCompletionOptions };

export type UseCompletionHelpers = {
  /** The current completion result */
  completion: Ref<string>;
  /** The error object of the API request */
  error: Ref<undefined | Error>;
  /**
   * Send a new prompt to the API endpoint and update the completion state.
   */
  complete: (
    prompt: string,
    options?: RequestOptions,
  ) => Promise<string | null | undefined>;
  /**
   * Abort the current API request but keep the generated tokens.
   */
  stop: () => void;
  /**
   * Update the `completion` state locally.
   */
  setCompletion: (completion: string) => void;
  /** The current value of the input */
  input: Ref<string>;
  /**
   * Form submission handler to automatically reset input and append a user message
   * @example
   * ```jsx
   * <form @submit="handleSubmit">
   *  <input @change="handleInputChange" v-model="input" />
   * </form>
   * ```
   */
  handleSubmit: (event?: { preventDefault?: () => void }) => void;
  /** Whether the API request is in progress */
  isLoading: Ref<boolean | undefined>;

  /** Additional data added on the server via StreamData */
  data: Ref<JSONValue[] | undefined>;
};

let uniqueId = 0;

// @ts-expect-error - some issues with the default export of useSWRV
const useSWRV = (swrv.default as (typeof import('swrv'))['default']) || swrv;
const store: Record<string, any> = {};

export function useCompletion({
  api = '/api/completion',
  id,
  initialCompletion = '',
  initialInput = '',
  credentials,
  headers,
  body,
  streamProtocol,
  onResponse,
  onFinish,
  onError,
  fetch,
}: UseCompletionOptions = {}): UseCompletionHelpers {
  // Generate an unique id for the completion if not provided.
  const completionId = id || `completion-${uniqueId++}`;

  const key = `${api}|${completionId}`;
  const { data, mutate: originalMutate } = useSWRV<string>(
    key,
    () => store[key] || initialCompletion,
  );

  const { data: isLoading, mutate: mutateLoading } = useSWRV<boolean>(
    `${completionId}-loading`,
    null,
  );

  isLoading.value ??= false;

  const { data: streamData, mutate: mutateStreamData } = useSWRV<
    JSONValue[] | undefined
  >(`${completionId}-data`, null);

  // Force the `data` to be `initialCompletion` if it's `undefined`.
  data.value ||= initialCompletion;

  const mutate = (data: string) => {
    store[key] = data;
    return originalMutate();
  };

  // Because of the `initialData` option, the `data` will never be `undefined`.
  const completion = data as Ref<string>;

  const error = ref<undefined | Error>(undefined);

  let abortController: AbortController | null = null;

  async function triggerRequest(prompt: string, options?: RequestOptions) {
    const existingData = (streamData.value ?? []) as JSONValue[];
    return callCompletionApi({
      api,
      prompt,
      credentials,
      headers: {
        ...headers,
        ...options?.headers,
      },
      body: {
        ...unref(body),
        ...options?.body,
      },
      streamProtocol,
      setCompletion: mutate,
      setLoading: loading => mutateLoading(() => loading),
      setError: err => {
        error.value = err;
      },
      setAbortController: controller => {
        abortController = controller;
      },
      onResponse,
      onFinish,
      onError,
      onData: data => {
        mutateStreamData(() => [...existingData, ...(data ?? [])]);
      },
      fetch,
    });
  }

  const complete: UseCompletionHelpers['complete'] = async (
    prompt,
    options,
  ) => {
    return triggerRequest(prompt, options);
  };

  const stop = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  const setCompletion = (completion: string) => {
    mutate(completion);
  };

  const input = ref(initialInput);

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    const inputValue = input.value;
    return inputValue ? complete(inputValue) : undefined;
  };

  return {
    completion,
    complete,
    error,
    stop,
    setCompletion,
    input,
    handleSubmit,
    isLoading,
    data: streamData,
  };
}
