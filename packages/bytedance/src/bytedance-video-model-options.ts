import { z } from 'zod/v4';
import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';

export type ByteDanceVideoModelOptions = {
  /**
   * Whether to add a watermark to the generated video.
   */
  watermark?: boolean | null;

  /**
   * Whether to generate audio for the video.
   */
  generateAudio?: boolean | null;

  /**
   * Whether to keep the camera fixed (no camera movement).
   */
  cameraFixed?: boolean | null;

  /**
   * Whether to return the last frame of the generated video.
   */
  returnLastFrame?: boolean | null;

  /**
   * Service tier to use for generation.
   *
   * - `"default"`: Standard generation tier.
   * - `"flex"`: Flexible (lower-priority) tier with potentially reduced cost.
   */
  serviceTier?: 'default' | 'flex' | null;

  /**
   * Whether to generate in draft mode (faster, lower quality preview).
   */
  draft?: boolean | null;

  /**
   * URL of an image to use as the last frame of the generated video.
   */
  lastFrameImage?: string | null;

  /**
   * URLs of reference images to guide the generated video style.
   */
  referenceImages?: string[] | null;

  /**
   * URLs of reference videos to guide the generated video style.
   */
  referenceVideos?: string[] | null;

  /**
   * URLs of reference audio to use in the generated video.
   */
  referenceAudio?: string[] | null;

  /**
   * Polling interval in milliseconds for checking generation status.
   * Defaults to 3000 (3 seconds).
   */
  pollIntervalMs?: number | null;

  /**
   * Maximum time in milliseconds to wait for generation to complete.
   * Defaults to 300000 (5 minutes).
   */
  pollTimeoutMs?: number | null;

  [key: string]: unknown;
};

export const byteDanceVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        watermark: z.boolean().nullish(),
        generateAudio: z.boolean().nullish(),
        cameraFixed: z.boolean().nullish(),
        returnLastFrame: z.boolean().nullish(),
        serviceTier: z.enum(['default', 'flex']).nullish(),
        draft: z.boolean().nullish(),
        lastFrameImage: z.string().nullish(),
        referenceImages: z.array(z.string()).nullish(),
        referenceVideos: z.array(z.string()).nullish(),
        referenceAudio: z.array(z.string()).nullish(),
        pollIntervalMs: z.number().positive().nullish(),
        pollTimeoutMs: z.number().positive().nullish(),
      })
      .passthrough(),
  ),
);

/**
 * @deprecated Use {@link ByteDanceVideoModelOptions} instead.
 */
export type ByteDanceVideoProviderOptions = ByteDanceVideoModelOptions;

/**
 * @deprecated Use {@link byteDanceVideoModelOptionsSchema} instead.
 */
export const byteDanceVideoProviderOptionsSchema =
  byteDanceVideoModelOptionsSchema;
