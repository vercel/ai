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
Size of the images to generate. Must have the format `{width}x{height}`.
     */
    size: `${number}x${number}` | undefined;

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
Generated images as base64 encoded strings.
     */
    images: Array<string>;
  }>;
};
