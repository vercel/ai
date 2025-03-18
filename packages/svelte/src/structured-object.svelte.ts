import {
  generateId,
  isAbortError,
  safeValidateTypes,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import {
  asSchema,
  isDeepEqualData,
  parsePartialJson,
  type DeepPartial,
  type Schema,
} from '@ai-sdk/ui-utils';
import { type z } from 'zod';
import {
  getStructuredObjectContext,
  hasStructuredObjectContext,
  KeyedStructuredObjectStore,
  type StructuredObjectStore,
} from './structured-object-context.svelte.js';

export type Experimental_StructuredObjectOptions<RESULT> = {
  /**
   * The API endpoint. It should stream JSON that matches the schema as chunked text.
   */
  api: string;

  /**
   * A Zod schema that defines the shape of the complete object.
   */
  schema: z.Schema<RESULT, z.ZodTypeDef, unknown> | Schema<RESULT>;

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
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  /**
   * Callback that is called when the stream has finished.
   */
  onFinish?: (event: {
    /**
     * The generated object (typed according to the schema).
     * Can be undefined if the final object does not match the schema.
     */
    object: RESULT | undefined;

    /**
     * Optional error object. This is e.g. a TypeValidationError when the final object does not match the schema.
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

export class StructuredObject<RESULT, INPUT = unknown> {
  #options: Experimental_StructuredObjectOptions<RESULT> =
    {} as Experimental_StructuredObjectOptions<RESULT>;
  readonly #id = $derived(this.#options.id ?? generateId());
  readonly #keyedStore = $state<KeyedStructuredObjectStore>()!;
  readonly #store = $derived(
    this.#keyedStore.get(this.#id),
  ) as StructuredObjectStore<RESULT>;
  #abortController: AbortController | undefined;

  /**
   * The current value for the generated object. Updated as the API streams JSON chunks.
   */
  get object(): DeepPartial<RESULT> | undefined {
    return this.#store.object;
  }
  set #object(value: DeepPartial<RESULT> | undefined) {
    this.#store.object = value;
  }

  /** The error object of the API request */
  get error() {
    return this.#store.error;
  }

  /**
   * Flag that indicates whether an API request is in progress.
   */
  get loading() {
    return this.#store.loading;
  }

  constructor(options: Experimental_StructuredObjectOptions<RESULT>) {
    if (hasStructuredObjectContext()) {
      this.#keyedStore = getStructuredObjectContext();
    } else {
      this.#keyedStore = new KeyedStructuredObjectStore();
    }
    this.#options = options;
    this.#object = options.initialValue;
  }

  /**
   * Abort the current request immediately, keep the current partial object if any.
   */
  stop = () => {
    try {
      this.#abortController?.abort();
    } catch {
      // ignore
    } finally {
      this.#store.loading = false;
      this.#abortController = undefined;
    }
  };

  /**
   * Calls the API with the provided input as JSON body.
   */
  submit = async (input: INPUT) => {
    try {
      this.#store.object = undefined; // reset the data
      this.#store.loading = true;
      this.#store.error = undefined;

      const abortController = new AbortController();
      this.#abortController = abortController;

      const actualFetch = this.#options.fetch ?? fetch;
      const response = await actualFetch(this.#options.api, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.#options.headers,
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
          write: chunk => {
            if (abortController?.signal.aborted) {
              throw new DOMException('Stream aborted', 'AbortError');
            }
            accumulatedText += chunk;

            const { value } = parsePartialJson(accumulatedText);
            const currentObject = value as DeepPartial<RESULT>;

            if (!isDeepEqualData(latestObject, currentObject)) {
              latestObject = currentObject;

              this.#store.object = currentObject;
            }
          },

          close: () => {
            this.#store.loading = false;
            this.#abortController = undefined;

            if (this.#options.onFinish != null) {
              const validationResult = safeValidateTypes({
                value: latestObject,
                schema: asSchema(this.#options.schema),
              });

              this.#options.onFinish(
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

      const coalescedError =
        error instanceof Error ? error : new Error(String(error));
      if (this.#options.onError) {
        this.#options.onError(coalescedError);
      }

      this.#store.loading = false;
      this.#store.error = coalescedError;
    }
  };
}
