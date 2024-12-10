/**
The result of a `generateImage` call.
It contains the images and additional information.
 */
export interface GenerateImageResult {
  /**
The first image that was generated.
   */
  readonly image: string;

  /**
The images that were generated (base64 encoded).
     */
  readonly images: Array<string>;
}
