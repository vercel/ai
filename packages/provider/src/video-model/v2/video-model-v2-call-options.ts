import { SharedV2ProviderOptions } from '../../shared';

export type VideoModelV2CallOptions = {
  /**
  Prompt for the video generation.
   */
  prompt: string;

  /**
  Number of videos to generate.
   */
  n: number;

  /**
  Resolution of the videos to generate.
  Must have the format `{width}x{height}`.
  `undefined` will use the provider's default resolution.
   */
  resolution: `${number}x${number}` | undefined;

  /**
  Aspect ratio of the videos to generate.
  Must have the format `{width}:{height}`.
  `undefined` will use the provider's default aspect ratio.
   */
  aspectRatio: `${number}:${number}` | undefined;

  /**
  Duration of the generated video in seconds.
  `undefined` will use the provider's default duration.
   */
  durationSeconds: number | undefined;

  /**
  Frames per second of the generated video.
  `undefined` will use the provider's default FPS.
   */
  fps: number | undefined;

  /**
  Seed for the generation.
  `undefined` will use the provider's default seed.
   */
  seed: number | string | undefined;

  /**
  Additional provider-specific options that are passed through to the provider
  as body parameters.

  The outer record is keyed by the provider name, and the inner
  record is keyed by the provider-specific metadata key.
  ```ts
  {
    "openai": {
      "style": "cinematic"
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


