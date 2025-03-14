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
