import { JSONValue } from '../../json-value/json-value';

/**
Image generation model specification version 1.
 */
export type ImageModelV1 = {
  /**
The image model must specify which image model interface
version it implements. This will allow us to evolve the image
model interface and retain backwards compatibility. The different
implementation versions can be handled as a discriminated union
on our side.
   */
  readonly specificationVersion: 'v1';

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
  doGenerate(options: {
    /**
Prompt for the image generation.
     */
    prompt: string;

    /**
Number of images to generate.
     */
    n: number;

    /**
Size of the images to generate.
Must have the format `{width}x{height}`.
`undefined` will use the provider's default size.
     */
    size: `${number}x${number}` | undefined;

    /**
Aspect ratio of the images to generate.
Must have the format `{width}:{height}`.
`undefined` will use the provider's default aspect ratio.
     */
    aspectRatio: `${number}:${number}` | undefined;

    /**
Seed for the image generation.
`undefined` will use the provider's default seed.
     */
    seed: number | undefined;

    /**
Additional provider-specific options that are passed through to the provider
as body parameters.

The outer record is keyed by the provider name, and the inner
record is keyed by the provider-specific metadata key.
```ts
{
  "openai": {
    "style": "vivid"
  }
}
```
     */
    providerOptions: Record<string, Record<string, JSONValue>>;

    /**
Abort signal for cancelling the operation.
     */
    abortSignal?: AbortSignal;

    /**
  Additional HTTP headers to be sent with the request.
  Only applicable for HTTP-based providers.
     */
    headers?: Record<string, string | undefined>;
  }): PromiseLike<{
    /**
Generated images as base64 encoded strings or binary data.
The images should be returned without any unnecessary conversion.
If the API returns base64 encoded strings, the images should be returned
as base64 encoded strings. If the API returns binary data, the images should
be returned as binary data.
     */
    images: Array<string> | Array<Uint8Array>;
  }>;
};
