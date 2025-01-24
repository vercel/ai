import { ImageGenerationWarning } from '../types/image-model';
import { ImageModelResponseMetadata } from '../types/image-model-response-metadata';

/**
The result of a `generateImage` call.
It contains the images and additional information.
 */
export interface GenerateImageResult {
  /**
The first image that was generated.
   */
  readonly image: GeneratedImage;

  /**
The images that were generated.
     */
  readonly images: Array<GeneratedImage>;

  /**
Warnings for the call, e.g. unsupported settings.
     */
  readonly warnings: Array<ImageGenerationWarning>;

  /**
Response metadata from the provider. There may be multiple responses if we made multiple calls to the model.
   */
  readonly responses: Array<ImageModelResponseMetadata>;
}

export interface GeneratedImage {
  /**
Image as a base64 encoded string.
   */
  readonly base64: string;

  /**
Image as a Uint8Array.
   */
  readonly uint8Array: Uint8Array;
}
