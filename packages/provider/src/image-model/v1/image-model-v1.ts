/**
Image generation model specification version 1.

VALUE is the type of the values that the model can embed.
This will allow us to go beyond text embeddings in the future,
e.g. to support image embeddings
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
