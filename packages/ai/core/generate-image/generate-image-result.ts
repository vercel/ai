import { GeneratedFile } from '../generate-text';
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
  readonly image: GeneratedFile;

  /**
The images that were generated.
     */
  readonly images: Array<GeneratedFile>;

  /**
Warnings for the call, e.g. unsupported settings.
     */
  readonly warnings: Array<ImageGenerationWarning>;

  /**
Response metadata from the provider. There may be multiple responses if we made multiple calls to the model.
   */
  readonly responses: Array<ImageModelResponseMetadata>;
}
