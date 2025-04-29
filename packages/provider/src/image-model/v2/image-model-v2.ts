import { SharedV2ProviderMetadata } from '../../shared';
import { ImageModelV2CallOptions } from './image-model-v2-call-options';
import { ImageModelV2CallWarning } from './image-model-v2-call-warning';

/**
Image generation model specification version 2.
 */
export type ImageModelV2 = {
  /**
The image model must specify which image model interface
version it implements. This will allow us to evolve the image
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
Limit of how many images can be generated in a single API call.
If undefined, we will max generate one image per call.
   */
  readonly maxImagesPerCall: number | undefined;

  /**
Generates an array of images.
   */
  doGenerate(options: ImageModelV2CallOptions): PromiseLike<{
    /**
Generated images as base64 encoded strings or binary data.
The images should be returned without any unnecessary conversion.
If the API returns base64 encoded strings, the images should be returned
as base64 encoded strings. If the API returns binary data, the images should
be returned as binary data.
     */
    images: Array<string> | Array<Uint8Array>;

    /**
Warnings for the call, e.g. unsupported settings.
     */
    warnings: Array<ImageModelV2CallWarning>;

    /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.

The outer record is keyed by the provider name, and the inner
record is an array provider-specific metadata, one per image.

```ts
{
  "openai": [{
    "revisedPrompt": "Revised prompt here."
  }]
}
```
      */
    providerMetadata?: Array<Record<string, SharedV2ProviderMetadata>>;

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
