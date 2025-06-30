import { SharedV2ProviderOptions } from '../../shared';

/**
Data content. Can either be a base64-encoded string, a Uint8Array, an ArrayBuffer, or a Buffer.
 */
export type DataContent = string | Uint8Array | ArrayBuffer | Buffer;

export type ImageInput = {
  /**
Image data. Can either be:

- data: a base64-encoded string, a Uint8Array, an ArrayBuffer, or a Buffer  
- URL: a URL that points to the image
   */
  image: DataContent | URL;

  /**
Optional IANA media type of the image.

@see https://www.iana.org/assignments/media-types/media-types.xhtml
   */
  mediaType?: string;
};

export type ImageModelV2CallOptions = {
  /**
Prompt for the image generation or edit.
     */
  prompt: string;

  /**
Image(s) to edit. Array of ImageInput objects with image data and optional media type.
Only used for image editing operations.
     */
  images?: Array<ImageInput>;

  /**
Optional mask image whose fully transparent areas indicate where the image should be edited.
Must be a valid PNG file with the same dimensions as the image.
Can be a base64-encoded string, a Uint8Array, an ArrayBuffer, or a Buffer.
Only used for image editing operations.
 */
  mask?: DataContent;

  /**
Number of images to generate.
 */
  n: number;

  /**
Size of the images to generate.
Must have the format `{width}x{height}`.
`undefined` will use the provider's default size.
 */
  size: `${number}x${number}` | undefined;

  /**
Aspect ratio of the images to generate.
Must have the format `{width}:{height}`.
`undefined` will use the provider's default aspect ratio.
 */
  aspectRatio: `${number}:${number}` | undefined;

  /**
Seed for the image generation.
`undefined` will use the provider's default seed.
 */
  seed: number | undefined;

  /**
Additional provider-specific options that are passed through to the provider
as body parameters.

The outer record is keyed by the provider name, and the inner
record is keyed by the provider-specific metadata key.
```ts
{
  "openai": {
    "style": "vivid"
  }
}
```
 */
  providerOptions: SharedV2ProviderOptions;

  /**
Abort signal for cancelling the operation.
 */
  abortSignal?: AbortSignal;

  /**
Additional HTTP headers to be sent with the request.
Only applicable for HTTP-based providers.
 */
  headers?: Record<string, string | undefined>;
};
