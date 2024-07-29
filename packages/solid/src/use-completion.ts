import type {
  FetchFunction,
  JSONValue,
  RequestOptions,
  UseCompletionOptions,
} from '@ai-sdk/ui-utils';
import { callCompletionApi } from '@ai-sdk/ui-utils';
import {
  Accessor,
  JSX,
  Setter,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
} from 'solid-js';
import { createStore } from 'solid-js/store';

export type { UseCompletionOptions };

export type UseCompletionHelpers = {
  /** The current completion result */
  completion: Accessor<string>;
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

  /** An input/textarea-ready onChange handler to control the value of the input */
  handleInputChange: JSX.ChangeEventHandlerUnion<
    HTMLInputElement | HTMLTextAreaElement,
    Event
  >;
  /**
   * Form submission handler to automatically reset input and append a user message
   * @example
   * ```jsx
   * <form onSubmit={handleSubmit}>
   *  <input value={input()} />
   * </form>
   * ```
   */
  handleSubmit: (event?: { preventDefault?: () => void }) => void;
  /** Whether the API request is in progress */
  isLoading: Accessor<boolean>;
  /** Additional data added on the server via StreamData */
  data: Accessor<JSONValue[] | undefined>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;
};

const [store, setStore] = createStore<Record<string, string>>({});

export function useCompletion(
  rawUseCompletionOptions:
    | UseCompletionOptions
    | Accessor<UseCompletionOptions> = {},
): UseCompletionHelpers {
  const useCompletionOptions = createMemo(() =>
    convertToAccessorOptions(rawUseCompletionOptions),
  );

  const api = createMemo(
    () => useCompletionOptions().api?.() ?? '/api/completion',
  );
  // Generate an unique id for the completion if not provided.
  const idKey = createMemo(
    () => useCompletionOptions().id?.() ?? `completion-${createUniqueId()}`,
  );
  const completionKey = createMemo(() => `${api()}|${idKey()}|completion`);

  const completion = createMemo(
    () =>
      store[completionKey()] ?? useCompletionOptions().initialCompletion?.(),
  );

  const mutate = (data: string) => {
    setStore(completionKey(), data);
  };

  const [error, setError] = createSignal<undefined | Error>(undefined);
  const [streamData, setStreamData] = createSignal<JSONValue[] | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = createSignal(false);

  const [abortController, setAbortController] =
    createSignal<AbortController | null>(null);

  let extraMetadata = {
    credentials: useCompletionOptions().credentials?.(),
    headers: useCompletionOptions().headers?.(),
    body: useCompletionOptions().body?.(),
  };
  createEffect(() => {
    extraMetadata = {
      credentials: useCompletionOptions().credentials?.(),
      headers: useCompletionOptions().headers?.(),
      body: useCompletionOptions().body?.(),
    };
  });

  const complete: UseCompletionHelpers['complete'] = async (
    prompt: string,
    options?: RequestOptions,
  ) => {
    const existingData = streamData() ?? [];
    return callCompletionApi({
      api: api(),
      prompt,
      credentials: useCompletionOptions().credentials?.(),
      headers: { ...extraMetadata.headers, ...options?.headers },
      body: {
        ...extraMetadata.body,
        ...options?.body,
      },
      // streamMode is deprecated, use streamProtocol instead:
      streamProtocol:
        useCompletionOptions().streamProtocol?.() ??
        useCompletionOptions().streamMode?.() === 'text'
          ? 'text'
          : undefined,
      setCompletion: mutate,
      setLoading: setIsLoading,
      setError,
      setAbortController,
      onResponse: useCompletionOptions().onResponse?.(),
      onFinish: useCompletionOptions().onFinish?.(),
      onError: useCompletionOptions().onError?.(),
      onData: data => {
        setStreamData([...existingData, ...(data ?? [])]);
      },
      fetch: useCompletionOptions().fetch?.(),
    });
  };

  const stop = () => {
    if (abortController()) {
      abortController()!.abort();
    }
  };

  const setCompletion = (completion: string) => {
    mutate(completion);
  };

  const [input, setInput] = createSignal(
    useCompletionOptions().initialInput?.() ?? '',
  );

  const handleInputChange: UseCompletionHelpers['handleInputChange'] =
    event => {
      setInput(event.target.value);
    };

  const handleSubmit: UseCompletionHelpers['handleSubmit'] = event => {
    event?.preventDefault?.();

    const inputValue = input();
    return inputValue ? complete(inputValue) : undefined;
  };

  return {
    completion,
    complete,
    error,
    stop,
    setCompletion,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    data: streamData,
  };
}

/**
 * Handle reactive and non-reactive useChatOptions
 */
function convertToAccessorOptions(
  options: UseCompletionOptions | Accessor<UseCompletionOptions>,
) {
  const resolvedOptions = typeof options === 'function' ? options() : options;

  return Object.entries(resolvedOptions).reduce(
    (reactiveOptions, [key, value]) => {
      reactiveOptions[key as keyof UseCompletionOptions] = createMemo(
        () => value,
      ) as any;
      return reactiveOptions;
    },
    {} as {
      [K in keyof UseCompletionOptions]: Accessor<UseCompletionOptions[K]>;
    },
  );
}
