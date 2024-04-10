import { Accessor, Resource, Setter, createSignal } from 'solid-js';
import { useSWRStore } from 'solid-swr-store';
import { createSWRStore } from 'swr-store';
import { callCompletionApi } from '../shared/call-completion-api';
import type {
  JSONValue,
  RequestOptions,
  UseCompletionOptions,
} from '../shared/types';

export type { UseCompletionOptions };

export type UseCompletionHelpers = {
  /** The current completion result */
  completion: Resource<string>;
  /** The error object of the API request */
  error: Accessor<undefined | Error>;
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
  input: Accessor<string>;
  /** Signal Setter to update the input value */
  setInput: Setter<string>;
  /**
   * Form submission handler to automatically reset input and append a user message
   * @example
   * ```jsx
   * <form onSubmit={handleSubmit}>
   *  <input value={input()} />
   * </form>
   * ```
   */
  handleSubmit: (e: any) => void;
  /** Whether the API request is in progress */
  isLoading: Accessor<boolean>;
  /** Additional data added on the server via StreamData */
  data: Accessor<JSONValue[] | undefined>;
};

let uniqueId = 0;

const store: Record<string, any> = {};
const completionApiStore = createSWRStore<any, string[]>({
  get: async (key: string) => {
    return store[key] ?? [];
  },
});

export function useCompletion({
  api = '/api/completion',
  id,
  initialCompletion = '',
  initialInput = '',
  credentials,
  headers,
  body,
  onResponse,
  onFinish,
  onError,
}: UseCompletionOptions = {}): UseCompletionHelpers {
  // Generate an unique id for the completion if not provided.
  const completionId = id || `completion-${uniqueId++}`;

  const key = `${api}|${completionId}`;
  const data = useSWRStore(completionApiStore, () => [key], {
    initialData: initialCompletion,
  });

  const mutate = (data: string) => {
    store[key] = data;
    return completionApiStore.mutate([key], {
      data,
      status: 'success',
    });
  };

  // Because of the `initialData` option, the `data` will never be `undefined`.
  const completion = data as Resource<string>;

  const [error, setError] = createSignal<undefined | Error>(undefined);
  const [streamData, setStreamData] = createSignal<JSONValue[] | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = createSignal(false);

  let abortController: AbortController | null = null;

  const complete: UseCompletionHelpers['complete'] = async (
    prompt: string,
    options?: RequestOptions,
  ) => {
    const existingData = streamData() ?? [];
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
      setCompletion: mutate,
      setLoading: setIsLoading,
      setError,
      setAbortController: controller => {
        abortController = controller;
      },
      onResponse,
      onFinish,
      onError,
      onData: data => {
        setStreamData([...existingData, ...(data ?? [])]);
      },
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

  const [input, setInput] = createSignal(initialInput);

  const handleSubmit = (e: any) => {
    e.preventDefault();
    const inputValue = input();
    if (!inputValue) return;
    return complete(inputValue);
  };

  return {
    completion,
    complete,
    error,
    stop,
    setCompletion,
    input,
    setInput,
    handleSubmit,
    isLoading,
    data: streamData,
  };
}
