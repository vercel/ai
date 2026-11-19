import { trackedObject } from '@ember/reactive/collections';
import { normalizeHeaders } from '@ai-sdk/provider-utils';
import {
  callCompletionApi,
  generateId,
  type CompletionRequestOptions,
  type UseCompletionOptions,
} from 'ai';
import { linkToParent, splitArguments } from './link-to-parent';

export type CompletionOptions<BODY extends object = object> = Readonly<
  UseCompletionOptions<BODY>
>;

/**
 * Text completion with tracked `completion`, `input`, `error`, and `loading`.
 *
 * Pass a parent (usually the component) as the first argument
 * to abort the request when the parent is destroyed:
 *
 *   completion = new Completion(this, { api: '/api/completion' });
 */
export class Completion<BODY extends object = object> {
  readonly #options: CompletionOptions<BODY>;

  readonly id: string;
  readonly api: string;
  readonly streamProtocol: 'data' | 'text';

  /**
   * `loading` and `error` are written by `callCompletionApi` from `ai`,
   * which owns the request lifecycle.
   */
  readonly #state: {
    input: string;
    completion: string;
    error: Error | undefined;
    loading: boolean;
  };

  #abortController: AbortController | null = null;

  constructor(options?: CompletionOptions<NoInfer<BODY>>);
  constructor(parent: object, options: CompletionOptions<NoInfer<BODY>>);
  constructor(
    parentOrOptions?: object | CompletionOptions<NoInfer<BODY>>,
    maybeOptions?: CompletionOptions<NoInfer<BODY>>,
  ) {
    const { parent, options = {} } = splitArguments(
      arguments.length,
      parentOrOptions,
      maybeOptions,
    );

    this.#options = options;
    this.id = options.id ?? generateId();
    this.api = options.api ?? '/api/completion';
    this.streamProtocol = options.streamProtocol ?? 'data';
    this.#state = trackedObject({
      input: options.initialInput ?? '',
      completion: options.initialCompletion ?? '',
      error: undefined as Error | undefined,
      loading: false,
    });

    linkToParent(this, parent, () => {
      this.#abortController?.abort();
    });
  }

  /** The current completion result. Writable. */
  get completion(): string {
    return this.#state.completion;
  }
  set completion(value: string) {
    this.#state.completion = value;
  }

  /** The current value of the input. Writable, so an input handler can set it. */
  get input(): string {
    return this.#state.input;
  }
  set input(value: string) {
    this.#state.input = value;
  }

  /** The error object of the API request. */
  get error(): Error | undefined {
    return this.#state.error;
  }

  /** Flag that indicates whether an API request is in progress. */
  get loading(): boolean {
    return this.#state.loading;
  }

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   *
   * `callCompletionApi` sees the abort and sets `loading` back to `false`.
   */
  stop = () => {
    this.#abortController?.abort();
  };

  /**
   * Send a new prompt to the API endpoint and update the completion state.
   */
  complete = async (prompt: string, options?: CompletionRequestOptions<BODY>) =>
    this.#triggerRequest(prompt, options);

  /** Form submission handler that sends the current input. */
  handleSubmit = async (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();

    if (this.input) {
      await this.complete(this.input);
    }
  };

  #triggerRequest = async (
    prompt: string,
    options?: CompletionRequestOptions<BODY>,
  ) => {
    return callCompletionApi({
      api: this.api,
      prompt,
      credentials: this.#options.credentials,
      headers: Object.assign(
        {},
        normalizeHeaders(this.#options.headers),
        normalizeHeaders(options?.headers),
      ),
      body: Object.assign({}, this.#options.body, options?.body),
      streamProtocol: this.streamProtocol,
      fetch: this.#options.fetch,
      setCompletion: completion => {
        this.#state.completion = completion;
      },
      setLoading: loading => {
        this.#state.loading = loading;
      },
      setError: error => {
        this.#state.error = error;
      },
      setAbortController: abortController => {
        this.#abortController = abortController;
      },
      getAbortController: () => this.#abortController,
      onFinish: this.#options.onFinish,
      onError: this.#options.onError,
    });
  };
}
