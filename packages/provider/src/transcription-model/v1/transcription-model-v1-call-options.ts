import { JSONValue } from '../../json-value/json-value';

type TranscriptionModelV1ProviderOptions = Record<
  string,
  Record<string, JSONValue>
>;

export type TranscriptionModelV1CallOptions = {
  /**
Audio data to transcribe.
     */
  audio: Uint8Array | string;

  /**
Additional provider-specific options that are passed through to the provider
as body parameters.

The outer record is keyed by the provider name, and the inner
record is keyed by the provider-specific metadata key.
```ts
{
"openai": {
"timestampGranularities": ["word"]
}
}
```
 */
  providerOptions?: TranscriptionModelV1ProviderOptions;

  /**
Abort signal for cancelling the operation.
 */
  abortSignal?: AbortSignal;

  /**
Additional HTTP headers to be sent with the request.
Only applicable for HTTP-based providers.
 */
  headers?: Record<string, string | undefined>;
};
