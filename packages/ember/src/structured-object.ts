import { trackedObject } from '@ember/reactive/collections';
import {
  generateId,
  isAbortError,
  normalizeHeaders,
  safeValidateTypes,
  type FetchFunction,
  type FlexibleSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import {
  asSchema,
  isDeepEqualData,
  parsePartialJson,
  type DeepPartial,
} from 'ai';
import { linkToParent, splitArguments } from './link-to-parent';

export type StructuredObjectOptions<
  SCHEMA extends FlexibleSchema,
  RESULT = InferSchema<SCHEMA>,
> = {
  /**
   * The API endpoint. It should stream JSON that matches the schema as chunked text.
   */
  api: string;

  /**
   * A schema that defines the shape of the complete object.
   */
  schema: SCHEMA;

  /**
   * A unique identifier. If not provided, a random one will be generated.
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

  /**
   * The credentials mode to be used for the fetch request.
   * Possible values are: 'omit', 'same-origin', 'include'.
   * Defaults to 'same-origin'.
   */
  credentials?: RequestCredentials;
};

/**
 * Streams a JSON object from an API endpoint
 * and exposes the partial object as it arrives.
 *
 * `object`, `error`, and `loading` are tracked.
 *
 * Pass a parent (usually the component) as the first argument
 * to abort the request when the parent is destroyed:
 *
 *   recipe = new StructuredObject(this, { api: '/api/recipe', schema });
 */
export class StructuredObject<
  SCHEMA extends FlexibleSchema,
  RESULT = InferSchema<SCHEMA>,
  INPUT = unknown,
> {
  readonly options: StructuredObjectOptions<SCHEMA, RESULT>;
  readonly id: string;

  /**
   * `request` is the abort controller of the request in flight.
   *
   * `loading` reads it instead of keeping a second flag in sync,
   * and a finished older request cannot end the loading state of a newer one.
   */
  readonly #state: {
    object: DeepPartial<RESULT> | undefined;
    error: Error | undefined;
    request: AbortController | undefined;
  };

  constructor(options: StructuredObjectOptions<SCHEMA, RESULT>);
  constructor(parent: object, options: StructuredObjectOptions<SCHEMA, RESULT>);
  constructor(
    parentOrOptions: object | StructuredObjectOptions<SCHEMA, RESULT>,
    maybeOptions?: StructuredObjectOptions<SCHEMA, RESULT>,
  ) {
    const { parent, options } = splitArguments(
      arguments.length,
      parentOrOptions,
      maybeOptions,
    );

    this.options = options as StructuredObjectOptions<SCHEMA, RESULT>;
    this.id = this.options.id ?? generateId();
    this.#state = trackedObject({
      object: this.options.initialValue,
      error: undefined as Error | undefined,
      request: undefined as AbortController | undefined,
    });

    linkToParent(this, parent, () => {
      this.stop();
    });
  }

  /**
   * The current value for the generated object. Updated as the API streams JSON chunks.
   */
  get object(): DeepPartial<RESULT> | undefined {
    return this.#state.object;
  }

  /** The error object of the API request. */
  get error(): Error | undefined {
    return this.#state.error;
  }

  /**
   * Flag that indicates whether an API request is in progress.
   */
  get loading(): boolean {
    return this.#state.request !== undefined;
  }

  /**
   * Abort the current request immediately, keep the current partial object if any.
   */
  stop = () => {
    const request = this.#state.request;

    if (request !== undefined) {
      this.#state.request = undefined;
      request.abort();
    }
  };

  /**
   * Calls the API with the provided input as JSON body.
   */
  submit = async (input: INPUT) => {
    this.stop();

    const abortController = new AbortController();
    const isCurrent = () => this.#state.request === abortController;

    this.#state.object = undefined;
    this.#state.error = undefined;
    this.#state.request = abortController;

    try {
      const actualFetch = this.options.fetch ?? fetch;
      const response = await actualFetch(this.options.api, {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          normalizeHeaders(this.options.headers),
        ),
        credentials: this.options.credentials,
        signal: abortController.signal,
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(
          (await response.text()) || 'Failed to fetch the response.',
        );
      }

      if (response.body == null) {
        throw new Error('The response body is empty.');
      }

      let accumulatedText = '';
      let latestObject: DeepPartial<RESULT> | undefined = undefined;

      await response.body.pipeThrough(new TextDecoderStream()).pipeTo(
        new WritableStream<string>({
          write: async chunk => {
            if (abortController.signal.aborted) {
              throw new DOMException('Stream aborted', 'AbortError');
            }

            accumulatedText += chunk;

            const { value } = await parsePartialJson(accumulatedText);
            const currentObject = value as DeepPartial<RESULT>;

            if (!isDeepEqualData(latestObject, currentObject)) {
              latestObject = currentObject;
              this.#state.object = currentObject;
            }
          },

          close: async () => {
            if (isCurrent()) {
              this.#state.request = undefined;
            }

            if (this.options.onFinish != null) {
              const validationResult = await safeValidateTypes({
                value: latestObject,
                schema: asSchema(this.options.schema),
              });

              this.options.onFinish(
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

      this.options.onError?.(coalescedError);

      if (isCurrent()) {
        this.#state.request = undefined;
        this.#state.error = coalescedError;
      }
    }
  };

  /**
   * Clears the object state.
   */
  clear = () => {
    this.stop();
    this.#state.object = undefined;
    this.#state.error = undefined;
  };
}
