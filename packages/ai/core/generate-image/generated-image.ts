import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';

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

export class DefaultGeneratedImage implements GeneratedImage {
  private base64Data: string | undefined;
  private uint8ArrayData: Uint8Array | undefined;

  constructor({ image }: { image: string | Uint8Array }) {
    const isUint8Array = image instanceof Uint8Array;

    this.base64Data = isUint8Array ? undefined : image;
    this.uint8ArrayData = isUint8Array ? image : undefined;
  }

  // lazy conversion with caching to avoid unnecessary conversion overhead:
  get base64() {
    if (this.base64Data == null) {
      this.base64Data = convertUint8ArrayToBase64(this.uint8ArrayData!);
    }
    return this.base64Data;
  }

  // lazy conversion with caching to avoid unnecessary conversion overhead:
  get uint8Array() {
    if (this.uint8ArrayData == null) {
      this.uint8ArrayData = convertBase64ToUint8Array(this.base64Data!);
    }
    return this.uint8ArrayData;
  }
}
