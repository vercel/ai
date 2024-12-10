import { ImageModelV1 } from '@ai-sdk/provider';
import { prepareRetries } from '../prompt/prepare-retries';
import { GenerateImageResult } from './generate-image-result';

/**
Embed a value using an embedding model. The type of the value is defined by the embedding model.

@param model - The embedding model to use.
@param value - The value that should be embedded.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the embedding, the value, and additional information.
 */
export async function generateImage({
  model,
  prompt,
  n,
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
    }),
  );

  return new DefaultGenerateImageResult({ images });
}

class DefaultGenerateImageResult implements GenerateImageResult {
  readonly images: GenerateImageResult['images'];

  constructor(options: { images: GenerateImageResult['images'] }) {
    this.images = options.images;
  }
}
