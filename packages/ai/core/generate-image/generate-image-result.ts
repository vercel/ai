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
The first image that was generated, as a Uint8Array.
   */
  readonly imageAsUint8Array: Uint8Array;

  /**
The images that were generated (base64 encoded).
     */
  readonly images: Array<string>;

  /**
The images that were generated as Uint8Array objects.
   */
  readonly imagesAsUint8Arrays: Array<Uint8Array>;
}
