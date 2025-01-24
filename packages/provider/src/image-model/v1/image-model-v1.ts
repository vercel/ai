import { ImageModelV1CallOptions } from './image-model-v1-call-options';
import { ImageModelV1CallWarning } from './image-model-v1-call-warning';

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
  doGenerate(options: ImageModelV1CallOptions): PromiseLike<{
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
    warnings: Array<ImageModelV1CallWarning>;

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
