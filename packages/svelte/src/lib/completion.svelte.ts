import {
  generateId,
  type UseCompletionOptions,
  type JSONValue,
  type RequestOptions,
  callCompletionApi,
} from "@ai-sdk/ui-utils";
import { SvelteMap } from "svelte/reactivity";

export type CompletionOptions = Readonly<UseCompletionOptions>;

export class Completion {
  readonly #options: CompletionOptions = {};
  readonly #api = $derived(this.#options.api ?? "/api/completion");
  readonly #id = $derived(this.#options.id ?? generateId());
  readonly #streamProtocol = $derived(this.#options.streamProtocol ?? "data");
  #error = $state<Error>();
  #loading = $state(false);
  #abortController: AbortController | undefined;
  #completions = new SvelteMap<string, string>();

  /** The current completion result */
  get completion(): string {
    return this.#completions.get(this.#id) ?? "";
  }
  set completion(value: string) {
    this.#completions.set(this.#id, value);
  }

  /**
   * Additional data added on the server via StreamData.
   *
   * This is writable, so you can use it to transform or clear the chat data.
   */
  data = $state<JSONValue[]>([]);

  /** The error object of the API request */
  get error() {
    return this.#error;
  }

  /** The current value of the input. Writable, so it can be bound to form inputs. */
  input = $state<string>()!;

  /**
   * Flag that indicates whether an API request is in progress.
   */
  get loading() {
    return this.#loading;
  }

  constructor(options: CompletionOptions = {}) {
    this.#options = options;
    this.completion = options.initialCompletion ?? "";
    this.input = options.initialInput ?? "";
  }

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop = () => {
    try {
      this.#abortController?.abort();
    } catch {
      // ignore
    } finally {
      this.#loading = false;
      this.#abortController = undefined;
    }
  };

  /**
   * Send a new prompt to the API endpoint and update the completion state.
   */
  complete = async (prompt: string, options?: RequestOptions) =>
    this.#triggerRequest(prompt, options);

  /** Form submission handler to automatically reset input and call the completion API */
  handleSubmit = async (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (this.input) {
      await this.complete(this.input);
    }
  };

  #triggerRequest = async (prompt: string, options?: RequestOptions) => {
    return callCompletionApi({
      api: this.#api,
      prompt,
      credentials: this.#options.credentials,
      headers: { ...this.#options.headers, ...options?.headers },
      body: {
        ...this.#options.body,
        ...options?.body,
      },
      streamProtocol: this.#streamProtocol,
      fetch: this.#options.fetch,
      // throttle streamed ui updates:
      setCompletion: (completion) => {
        this.completion = completion;
      },
      onData: (data) => {
        this.data.push(...data);
      },
      setLoading: (loading) => {
        this.#loading = loading;
      },
      setError: (error) => {
        this.#error = error;
      },
      setAbortController: (abortController) => {
        this.#abortController = abortController ?? undefined;
      },
      onResponse: this.#options.onResponse,
      onFinish: this.#options.onFinish,
      onError: this.#options.onError,
    });
  };
}
