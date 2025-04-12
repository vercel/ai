import { JSONValue } from '../../json-value/json-value';

type IsolationModelV1ProviderOptions = Record<
  string,
  Record<string, JSONValue>
>;

export type IsolationModelV1CallOptions = {
  /**
   * Audio to isolate.
   */
  audio: string;

  /**
   * Additional provider-specific options that are passed through to the provider
   * as body parameters.
   *
   * The outer record is keyed by the provider name, and the inner
   * record is keyed by the provider-specific metadata key.
   * ```ts
   * {
   *   "openai": {}
   * }
   * ```
   */
  providerOptions?: IsolationModelV1ProviderOptions;

  /**
   * Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string | undefined>;
};
