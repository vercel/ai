import { ImageModelV1, JSONValue } from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';
import { prepareRetries } from '../prompt/prepare-retries';
import { ImageGenerationWarning } from '../types/image-model';
import { GeneratedImage, GenerateImageResult } from './generate-image-result';
import { NoImageGeneratedError } from '../../errors/no-image-generated-error';
import { ImageModelResponseMetadata } from '../types/image-model-response-metadata';

/**
Generates images using an image model.

@param model - The image model to use.
@param prompt - The prompt that should be used to generate the image.
@param n - Number of images to generate. Default: 1.
@param size - Size of the images to generate. Must have the format `{width}x{height}`.
@param aspectRatio - Aspect ratio of the images to generate. Must have the format `{width}:{height}`.
@param seed - Seed for the image generation.
@param providerOptions - Additional provider-specific options that are passed through to the provider
as body parameters.
@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the generated images.
 */
export async function generateImage({
  model,
  prompt,
  n = 1,
  size,
  aspectRatio,
  seed,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  _internal = {
    currentDate: () => new Date(),
  },
}: {
  /**
The image model to use.
     */
  model: ImageModelV1;

  /**
The prompt that should be used to generate the image.
   */
  prompt: string;

  /**
Number of images to generate.
   */
  n?: number;

  /**
Size of the images to generate. Must have the format `{width}x{height}`. If not provided, the default size will be used.
   */
  size?: `${number}x${number}`;

  /**
Aspect ratio of the images to generate. Must have the format `{width}:{height}`. If not provided, the default aspect ratio will be used.
   */
  aspectRatio?: `${number}:${number}`;

  /**
Seed for the image generation. If not provided, the default seed will be used.
   */
  seed?: number;

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
  providerOptions?: Record<string, Record<string, JSONValue>>;

  /**
Maximum number of retries per embedding model call. Set to 0 to disable retries.

@default 2
   */
  maxRetries?: number;

  /**
Abort signal.
 */
  abortSignal?: AbortSignal;

  /**
Additional headers to include in the request.
Only applicable for HTTP-based providers.
 */
  headers?: Record<string, string>;

  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    currentDate?: () => Date;
  };
}): Promise<GenerateImageResult> {
  const { retry } = prepareRetries({ maxRetries: maxRetriesArg });

  // default to 1 if the model has not specified limits on
  // how many images can be generated in a single call
  const maxImagesPerCall = model.maxImagesPerCall ?? 1;

  // parallelize calls to the model:
  const callCount = Math.ceil(n / maxImagesPerCall);
  const callImageCounts = Array.from({ length: callCount }, (_, i) => {
    if (i < callCount - 1) {
      return maxImagesPerCall;
    }

    const remainder = n % maxImagesPerCall;
    return remainder === 0 ? maxImagesPerCall : remainder;
  });
  const results = await Promise.all(
    callImageCounts.map(async callImageCount =>
      retry(() =>
        model.doGenerate({
          prompt,
          n: callImageCount,
          abortSignal,
          headers,
          size,
          aspectRatio,
          seed,
          providerOptions: providerOptions ?? {},
        }),
      ),
    ),
  );

  // collect result images, warnings, and response metadata
  const images: Array<DefaultGeneratedImage> = [];
  const warnings: Array<ImageGenerationWarning> = [];
  const responses: Array<ImageModelResponseMetadata> = [];
  for (const result of results) {
    images.push(
      ...result.images.map(image => new DefaultGeneratedImage({ image })),
    );
    warnings.push(...result.warnings);
    responses.push(result.response);
  }

  if (!images.length) {
    throw new NoImageGeneratedError({ responses });
  }

  return new DefaultGenerateImageResult({ images, warnings, responses });
}

class DefaultGenerateImageResult implements GenerateImageResult {
  readonly images: Array<GeneratedImage>;
  readonly warnings: Array<ImageGenerationWarning>;
  readonly responses: Array<ImageModelResponseMetadata>;

  constructor(options: {
    images: Array<DefaultGeneratedImage>;
    warnings: Array<ImageGenerationWarning>;
    responses: Array<ImageModelResponseMetadata>;
  }) {
    this.images = options.images;
    this.warnings = options.warnings;
    this.responses = options.responses;
  }

  get image() {
    return this.images[0];
  }
}

class DefaultGeneratedImage implements GeneratedImage {
  private base64Data: string | undefined;
  private uint8ArrayData: Uint8Array | undefined;

  constructor({ image }: { image: string | Uint8Array }) {
    const isUint8Array = image instanceof Uint8Array;

    this.base64Data = isUint8Array ? undefined : image;
    this.uint8ArrayData = isUint8Array ? image : undefined;
  }

  // lazy conversion with caching to avoid unnecessary conversion overhead:
  get base64() {
    if (this.base64Data == null) {
      this.base64Data = convertUint8ArrayToBase64(this.uint8ArrayData!);
    }
    return this.base64Data;
  }

  // lazy conversion with caching to avoid unnecessary conversion overhead:
  get uint8Array() {
    if (this.uint8ArrayData == null) {
      this.uint8ArrayData = convertBase64ToUint8Array(this.base64Data!);
    }
    return this.uint8ArrayData;
  }
}
