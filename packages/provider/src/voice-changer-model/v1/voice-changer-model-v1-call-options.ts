import { JSONValue } from '../../json-value/json-value';

type VoiceChangerModelV1ProviderOptions = Record<
  string,
  Record<string, JSONValue>
>;

export type VoiceChangerModelV1CallOptions = {
  /**
Audio data to transcribe.
Accepts a `Uint8Array` or `string`, where `string` is a base64 encoded audio file.
     */
  audio: Uint8Array | string;

  /**
The voice to use for the speech.
   */
  voice: string;

  /**
The IANA media type of the audio data.

@see https://www.iana.org/assignments/media-types/media-types.xhtml
   */
  mediaType: string;

  /**
Additional provider-specific options that are passed through to the provider
as body parameters.

The outer record is keyed by the provider name, and the inner
record is keyed by the provider-specific metadata key.
```ts
{
  "elevenlabs": {
    "enable_logging": false
  }
}
```
 */
  providerOptions?: VoiceChangerModelV1ProviderOptions;

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
