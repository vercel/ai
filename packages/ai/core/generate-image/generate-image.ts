import { ImageModelV1, JSONValue } from '@ai-sdk/provider';
import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';
import { prepareRetries } from '../prompt/prepare-retries';
import { GeneratedImage, GenerateImageResult } from './generate-image-result';

/**
Generates images using an image model.

@param model - The image model to use.
@param prompt - The prompt that should be used to generate the image.
@param n - Number of images to generate. Default: 1.
@param size - Size of the images to generate. Must have the format `{width}x{height}`.
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
Size of the images to generate. Must have the format `{width}x{height}`.
   */
  size?: `${number}x${number}`;

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
      providerOptions: providerOptions ?? {},
    }),
  );

  return new DefaultGenerateImageResult({ base64Images: images });
}

class DefaultGenerateImageResult implements GenerateImageResult {
  readonly images: Array<GeneratedImage>;

  constructor(options: { base64Images: Array<string> }) {
    this.images = options.base64Images.map(base64 => ({
      base64,
      get uint8Array() {
        return convertBase64ToUint8Array(this.base64);
      },
    }));
  }

  get image() {
    return this.images[0];
  }
}
