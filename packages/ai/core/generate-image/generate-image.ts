import { ImageModelV1, JSONValue } from '@ai-sdk/provider';
import { prepareRetries } from '../prompt/prepare-retries';
import { GeneratedImage, GenerateImageResult } from './generate-image-result';
import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

/**
Generates images using an image model.

@param model - The image model to use.
@param prompt - The prompt that should be used to generate the image.
@param n - Number of images to generate. Default: 1.
@param size - Size of the images to generate. Must have the format `{width}x{height}`.
@param aspectRatio - Aspect ratio of the images to generate. Must have the format `{width}:{height}`.
@param seed - Seed for the image generation. Set to `'random'` to use a random seed.
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
  n,
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
Seed for the image generation. Set to `'random'` to use a random seed. If not provided, the default seed will be used.
   */
  seed?: number | 'random';

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
}): Promise<GenerateImageResult> {
  const { retry } = prepareRetries({ maxRetries: maxRetriesArg });

  const { images } = await retry(() =>
    model.doGenerate({
      prompt,
      n: n ?? 1,
      abortSignal,
      headers,
      size,
      aspectRatio,
      seed,
      providerOptions: providerOptions ?? {},
    }),
  );

  return new DefaultGenerateImageResult({ images });
}

class DefaultGenerateImageResult implements GenerateImageResult {
  readonly images: Array<GeneratedImage>;

  constructor(options: { images: Array<string> | Array<Uint8Array> }) {
    this.images = options.images.map(image => {
      const isUint8Array = image instanceof Uint8Array;
      return {
        base64: isUint8Array ? convertUint8ArrayToBase64(image) : image,
        uint8Array: isUint8Array ? image : convertBase64ToUint8Array(image),
      };
    });
  }

  get image() {
    return this.images[0];
  }
}
