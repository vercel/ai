import type {
  JSONValue,
  RequestOptions,
  UseCompletionOptions,
} from '@ai-sdk/ui-utils';
import { callCompletionApi } from '@ai-sdk/ui-utils';
import { Readable, Writable, derived, get, writable } from 'svelte/store';

export type { UseCompletionOptions };

export type UseCompletionHelpers = {
  /** The current completion result */
  completion: Readable<string>;
  /** The error object of the API request */
  error: Readable<undefined | Error>;
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
  input: Writable<string>;
  /**
   * Form submission handler to automatically reset input and append a user message
   * @example
   * ```jsx
   * <form onSubmit={handleSubmit}>
   *  <input onChange={handleInputChange} value={input} />
   * </form>
   * ```
   */
  handleSubmit: (event?: { preventDefault?: () => void }) => void;
  /** Whether the API request is in progress */
  isLoading: Readable<boolean | undefined>;

  /** Additional data added on the server via StreamData */
  data: Readable<JSONValue[] | undefined>;
};

let uniqueId = 0;

const store = writable<Record<string, string>>({});

export function useCompletion({
  api = '/api/completion',
  id,
  initialCompletion = '',
  initialInput = '',
  credentials,
  headers,
  body,
  streamProtocol = 'data',
  onResponse,
  onFinish,
  onError,
  fetch,
}: UseCompletionOptions = {}): UseCompletionHelpers {
  // Generate an unique id for the completion if not provided.
  const completionId = id || `completion-${uniqueId++}`;

  const key = `${api}|${completionId}`;
  const data = derived([store], ([$store]) => $store[key] ?? initialCompletion);

  const streamData = writable<JSONValue[] | undefined>(undefined);

  const loading = writable<boolean>(false);

  const mutate = (data: string) => {
    store.update(value => {
      value[key] = data;
      return value;
    });
  };

  // Because of the `fallbackData` option, the `data` will never be `undefined`.
  const completion = data;

  const error = writable<undefined | Error>(undefined);

  let abortController: AbortController | null = null;

  const complete: UseCompletionHelpers['complete'] = async (
    prompt: string,
    options?: RequestOptions,
  ) => {
    const existingData = get(streamData);
    return callCompletionApi({
      api,
      prompt,
      credentials,
      headers: {
        ...headers,
        ...options?.headers,
      },
      body: {
        ...body,
        ...options?.body,
      },
      streamProtocol,
      setCompletion: mutate,
      setLoading: loadingState => loading.set(loadingState),
      setError: err => error.set(err),
      setAbortController: controller => {
        abortController = controller;
      },
      onResponse,
      onFinish,
      onError,
      onData(data) {
        streamData.set([...(existingData || []), ...(data || [])]);
      },
      fetch,
    });
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

  const input = writable(initialInput);

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();

    const inputValue = get(input);
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
    isLoading: loading,
    data: streamData,
  };
}
