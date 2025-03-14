import { ImageGenerationWarning } from '../types/image-model';
import { ImageModelResponseMetadata } from '../types/image-model-response-metadata';
import { GeneratedImage } from './generated-image';

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
