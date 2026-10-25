import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';
import type { JSONObject } from '@ai-sdk/provider';

function isUint8Array(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array ||
    (typeof value === 'object' &&
      value !== null &&
      (value.constructor?.name === 'Uint8Array' ||
        Object.prototype.toString.call(value) === '[object Uint8Array]'))
  );
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer ||
    (typeof value === 'object' &&
      value !== null &&
      (value.constructor?.name === 'ArrayBuffer' ||
        Object.prototype.toString.call(value) === '[object ArrayBuffer]'))
  );
}

/**
 * A generated file.
 */
export interface GeneratedFile {
  /**
   * File as a base64 encoded string.
   */
  readonly base64: string;

  /**
   * File as a Uint8Array.
   */
  readonly uint8Array: Uint8Array;

  /**
   * The IANA media type of the file.
   *
   * @see https://www.iana.org/assignments/media-types/media-types.xhtml
   */
  readonly mediaType: string;

  /**
   * Provider-specific metadata for this file.
   */
  readonly providerMetadata?: Record<string, JSONObject>;
}

/**
 * @deprecated Use `GeneratedFile` instead. This alias will be removed in v8.
 */
export type Experimental_GeneratedImage = GeneratedFile;

export class DefaultGeneratedFile implements GeneratedFile {
  private base64Data: string | undefined;
  private uint8ArrayData: Uint8Array | undefined;

  readonly mediaType: string;
  readonly providerMetadata?: Record<string, JSONObject>;

  constructor({
    data,
    mediaType,
    providerMetadata,
  }: {
    data: string | Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, JSONObject>;
  }) {
    if (isUint8Array(data)) {
      this.base64Data = undefined;
      this.uint8ArrayData =
        data instanceof Uint8Array
          ? data
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else if (isArrayBuffer(data)) {
      this.base64Data = undefined;
      this.uint8ArrayData = new Uint8Array(data);
    } else {
      this.base64Data = data;
      this.uint8ArrayData = undefined;
    }
    this.mediaType = mediaType;
    this.providerMetadata = providerMetadata;
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

export class DefaultGeneratedFileWithType extends DefaultGeneratedFile {
  readonly type = 'file';
}
