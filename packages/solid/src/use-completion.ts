import {
  CompletionRequestOptions,
  UseCompletionOptions as AiUseCompletionOptions,
  callCompletionApi,
} from 'ai';
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  Setter,
  type JSX,
  type Accessor,
} from 'solid-js';
import { useSwr } from 'solid-swr';
import { throttle } from './throttle';
import { createSwrKey } from './util/create-swr-key';

export type UseCompletionHelpers = {
  /** The current completion result */
  completion: Accessor<string>;
  /**
   * Send a new prompt to the API endpoint and update the completion state.
   */
  complete: (
    prompt: string,
    options?: CompletionRequestOptions,
  ) => Promise<string | null | undefined>;
  /** The error object of the API request */
  error: Accessor<undefined | Error>;
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
  /** setState-powered method to update the input value */
  setInput: Setter<string>;
  /**
   * An input/textarea-ready onChange handler to control the value of the input
   * @example
   * ```jsx
   * <input onChange={handleInputChange} value={input} />
   * ```
   */
  handleInputChange: (event?: { target: { value: string } }) => void;

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
  isLoading: Accessor<boolean>;
};

export type UseCompletionOptions = Omit<AiUseCompletionOptions, 'id'> & {
  id?: Accessor<string>;
};

export function useCompletion({
  api = '/api/completion',
  id: idAccessor,
  initialCompletion = '',
  initialInput = '',
  credentials,
  headers,
  body,
  streamProtocol = 'data',
  fetch,
  onFinish,
  onError,
  experimental_throttle: throttleWaitMs,
}: UseCompletionOptions & {
  /**
   * Custom throttle wait in ms for the completion and data updates.
   * Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;
} = {}): UseCompletionHelpers {
  // Generate an unique id for the completion if not provided.
  const hookId = createUniqueId();
  const completionId = createMemo(() => idAccessor?.() ?? hookId);

  // eslint-disable-next-line solid/reactivity -- The key is not reactive, but requires using createMemo to access the data
  const {
    v: completionData,
    mutate,
    revalidate,
  } = useSwr<string, string>(createSwrKey(completionId, api));
  const completion = createMemo(
    () => completionData().data ?? initialCompletion,
  );

  // eslint-disable-next-line solid/reactivity -- The key is not reactive, but requires using createMemo to access the data
  const { v: isLoadingData, mutate: mutateLoading } = useSwr<boolean, string>(
    createSwrKey(completionId, 'loading'),
  );
  const isLoading = createMemo(() => isLoadingData()?.data ?? false);

  const [error, setError] = createSignal<undefined | Error>(undefined);

  // Abort controller to cancel the current API call.
  const [abortController, setAbortController] =
    createSignal<AbortController | null>(null);

  let extraMetadataRef: {
    credentials: RequestCredentials | undefined;
    headers: Record<string, string> | Headers | undefined;
    body: object | undefined;
  } = {
    credentials,
    headers,
    body,
  };

  createEffect(() => {
    extraMetadataRef = {
      credentials,
      headers,
      body,
    };
  });

  const triggerRequest = async (
    prompt: string,
    options?: CompletionRequestOptions,
  ) =>
    callCompletionApi({
      api,
      prompt,
      credentials: extraMetadataRef.credentials,
      headers: { ...extraMetadataRef.headers, ...options?.headers },
      body: {
        ...extraMetadataRef.body,
        ...options?.body,
      },
      streamProtocol,
      fetch,
      // throttle streamed ui updates:
      setCompletion: throttle(
        (completion: string) => mutate(completion),
        throttleWaitMs,
      ),
      setLoading: mutateLoading,
      setError,
      setAbortController,
      onFinish,
      onError,
    });

  const stop = () => {
    const ac = abortController();
    if (ac) {
      ac.abort();
      setAbortController(null);
    }
  };

  const setCompletion = (completion: string) => {
    mutate(completion);
  };

  const complete = async (
    prompt: string,
    options?: CompletionRequestOptions,
  ) => {
    return triggerRequest(prompt, options);
  };

  const [input, setInput] = createSignal(initialInput);

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    return input ? complete(input()) : undefined;
  };

  const handleInputChange = (event?: { target: { value: string } }) => {
    setInput(event?.target?.value ?? '');
  };

  return {
    completion,
    complete,
    error,
    setCompletion,
    stop,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
  };
}
