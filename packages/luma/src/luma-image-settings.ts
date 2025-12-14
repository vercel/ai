// https://luma.ai/models?type=image
export type LumaImageModelId = 'photon-1' | 'photon-flash-1' | (string & {});

/**
The type of image reference to use when providing input images.

- `image_ref`: Guide generation using reference images (up to 4). Default.
- `style_ref`: Apply a specific style from reference image(s).
- `character_ref`: Create consistent characters from reference images (up to 4).
- `modify_image_ref`: Transform a single input image with prompt guidance.
 */
export type LumaReferenceType =
  | 'image_ref'
  | 'style_ref'
  | 'character_ref'
  | 'modify_image_ref';

/**
Per-image configuration for Luma image references.
 */
export interface LumaImageConfig {
  /**
  The weight of this image's influence on the generation.
  - For `image_ref`: Higher weight = closer to reference (default: 0.85)
  - For `style_ref`: Higher weight = stronger style influence (default: 0.8)
  - For `modify_image_ref`: Higher weight = closer to input, lower = more creative (default: 1.0)
  Note: Not applicable to `character_ref`.
   */
  weight?: number;
}

/**
Configuration settings for Luma image generation.

Since the Luma API processes images through an asynchronous queue system, these
settings allow you to tune the polling behavior when waiting for image
generation to complete.
 */
export interface LumaImageSettings {
  /**
Override the polling interval in milliseconds (default 500). This controls how
frequently the API is checked for completed images while they are being
processed in Luma's queue.
   */
  pollIntervalMillis?: number;

  /**
Override the maximum number of polling attempts (default 120). Since image
generation is queued and processed asynchronously, this limits how long to wait
for results before timing out.
   */
  maxPollAttempts?: number;

  /**
The type of image reference to use when providing input images via `prompt.images`.
Default is `image_ref`.

- `image_ref`: Guide generation using reference images (up to 4)
- `style_ref`: Apply a specific style from reference image(s)
- `character_ref`: Create consistent characters from reference images (up to 4)
- `modify_image_ref`: Transform a single input image with prompt guidance
   */
  referenceType?: LumaReferenceType;

  /**
Per-image configuration array. Each entry corresponds to an image in `prompt.images`.
Allows setting individual weights for each reference image.

Example:
```ts
providerOptions: {
  luma: {
    referenceType: 'image_ref',
    images: [
      { weight: 0.9 },
      { weight: 0.5 },
    ],
  },
}
```
   */
  images?: LumaImageConfig[];
}
