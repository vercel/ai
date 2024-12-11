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
