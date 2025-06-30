import { ImageModelV2, ImageModelV2ProviderMetadata, ImageInput, DataContent } from '@ai-sdk/provider';
import { NoImageGeneratedError } from '../../src/error/no-image-generated-error';
import {
  detectMediaType,
  imageMediaTypeSignatures,
} from '../../src/util/detect-media-type';
import { prepareRetries } from '../../src/util/prepare-retries';
import {
  DefaultGeneratedFile,
  GeneratedFile,
} from '../generate-text/generated-file';
import { ImageGenerationWarning } from '../types/image-model';
import { ImageModelResponseMetadata } from '../types/image-model-response-metadata';
import { GenerateImageResult } from './generate-image-result';
import { ProviderOptions } from '@ai-sdk/provider-utils';

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
  images,
  mask,
  n = 1,
  maxImagesPerCall,
  size,
  aspectRatio,
  seed,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
}: {
  /**
The image model to use.
     */
  model: ImageModelV2;

  /**
The prompt that should be used to generate or edit the image.
   */
  prompt: string;

  /**
Optional image(s) to edit. When provided, the model will edit these images instead of generating new ones.
Array of ImageInput objects with image data and optional media type.
   */
  images?: Array<ImageInput>;

  /**
Optional mask image whose fully transparent areas indicate where the image should be edited.
Must be a valid PNG file with the same dimensions as the image.
Can be a base64-encoded string, a Uint8Array, an ArrayBuffer, or a Buffer.
   */
  mask?: DataContent;

  /**
Number of images to generate or edit.
   */
  n?: number;

  /**
Number of images to generate.
   */
  maxImagesPerCall?: number;

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
  providerOptions?: ProviderOptions;

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
}): Promise<GenerateImageResult> {
  const { retry } = prepareRetries({ maxRetries: maxRetriesArg });

  // default to 1 if the model has not specified limits on
  // how many images can be generated in a single call
  const maxImagesPerCallWithDefault =
    maxImagesPerCall ?? (await invokeModelMaxImagesPerCall(model)) ?? 1;

  // parallelize calls to the model:
  const callCount = Math.ceil(n / maxImagesPerCallWithDefault);
  const callImageCounts = Array.from({ length: callCount }, (_, i) => {
    if (i < callCount - 1) {
      return maxImagesPerCallWithDefault;
    }

    const remainder = n % maxImagesPerCallWithDefault;
    return remainder === 0 ? maxImagesPerCallWithDefault : remainder;
  });

  const results = await Promise.all(
    callImageCounts.map(async callImageCount =>
      retry(() =>
        model.doGenerate({
          prompt,
          images,
          mask,
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
  const resultImages: Array<DefaultGeneratedFile> = [];
  const warnings: Array<ImageGenerationWarning> = [];
  const responses: Array<ImageModelResponseMetadata> = [];
  const providerMetadata: ImageModelV2ProviderMetadata = {};
  for (const result of results) {
    resultImages.push(
      ...result.images.map(
        image =>
          new DefaultGeneratedFile({
            data: image,
            mediaType:
              detectMediaType({
                data: image,
                signatures: imageMediaTypeSignatures,
              }) ?? 'image/png',
          }),
      ),
    );
    warnings.push(...result.warnings);

    if (result.providerMetadata) {
      for (const [providerName, metadata] of Object.entries<{
        images: unknown;
      }>(result.providerMetadata)) {
        providerMetadata[providerName] ??= { images: [] };
        providerMetadata[providerName].images.push(
          ...result.providerMetadata[providerName].images,
        );
      }
    }

    responses.push(result.response);
  }

  if (!resultImages.length) {
    throw new NoImageGeneratedError({ responses });
  }

  return new DefaultGenerateImageResult({ images: resultImages, warnings, responses, providerMetadata });
}

class DefaultGenerateImageResult implements GenerateImageResult {
  readonly images: Array<GeneratedFile>;
  readonly warnings: Array<ImageGenerationWarning>;
  readonly responses: Array<ImageModelResponseMetadata>;
  readonly providerMetadata: ImageModelV2ProviderMetadata;

  constructor(options: {
    images: Array<GeneratedFile>;
    warnings: Array<ImageGenerationWarning>;
    responses: Array<ImageModelResponseMetadata>;
    providerMetadata: ImageModelV2ProviderMetadata;
  }) {
    this.images = options.images;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata;
  }

  get image() {
    return this.images[0];
  }
}

async function invokeModelMaxImagesPerCall(model: ImageModelV2) {
  const isFunction = model.maxImagesPerCall instanceof Function;

  if (!isFunction) {
    return model.maxImagesPerCall;
  }

  return model.maxImagesPerCall({
    modelId: model.modelId,
  });
}
