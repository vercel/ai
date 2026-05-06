import type { GenerateImageResult } from './generate-image-result';
import { generateImage } from './generate-image';

export { generateImage } from './generate-image';
export type { GenerateImageResult } from './generate-image-result';

// deprecated exports

/**
 * @deprecated Use `generateImage` instead.
 */
const experimental_generateImage = generateImage;
export { experimental_generateImage };

/**
 * @deprecated Use `GenerateImageResult` instead.
 */
type Experimental_GenerateImageResult = GenerateImageResult;
export type { Experimental_GenerateImageResult };
