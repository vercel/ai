import { JSONArray, JSONValue } from '../../json-value';
import { VideoModelV2CallOptions } from './video-model-v2-call-options';
import { VideoModelV2CallWarning } from './video-model-v2-call-warning';

export type VideoModelV2ProviderMetadata = Record<
  string,
  {
    videos: JSONArray;
  } & JSONValue
>;

type GetMaxVideosPerCallFunction = (options: {
  modelId: string;
}) => PromiseLike<number | undefined> | number | undefined;

/**
Video generation model specification version 2.
 */
export type VideoModelV2 = {
  /**
The video model must specify which video model interface
version it implements. This will allow us to evolve the video
model interface and retain backwards compatibility. The different
implementation versions can be handled as a discriminated union
on our side.
   */
  readonly specificationVersion: 'v2';

  /**
Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
Limit of how many videos can be generated in a single API call.
Can be set to a number for a fixed limit, to undefined to use
the global limit, or a function that returns a number or undefined,
optionally as a promise.
   */
  readonly maxVideosPerCall: number | undefined | GetMaxVideosPerCallFunction;

  /**
Generates an array of videos.
   */
  doGenerate(options: VideoModelV2CallOptions): PromiseLike<{
    /**
Generated videos as base64 encoded strings or binary data.
The videos should be returned without any unnecessary conversion.
If the API returns base64 encoded strings, the videos should be returned
as base64 encoded strings. If the API returns binary data, the videos should
be returned as binary data.
     */
    videos: Array<string> | Array<Uint8Array>;

    /**
Warnings for the call, e.g. unsupported settings.
     */
    warnings: Array<VideoModelV2CallWarning>;

    /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.

The outer record is keyed by the provider name, and the inner
record is provider-specific metadata. It always includes an
`videos` key with video-specific metadata

```ts
{
  "provider": {
    "videos": ["revisedPrompt": "Revised prompt here."]
  }
}
```
      */
    providerMetadata?: VideoModelV2ProviderMetadata;

    /**
Response information for telemetry and debugging purposes.
     */
    response: {
      /**
Timestamp for the start of the generated response.
      */
      timestamp: Date;

      /**
The ID of the response model that was used to generate the response.
      */
      modelId: string;

      /**
Response headers.
      */
      headers: Record<string, string> | undefined;
    };
  }>;
};


