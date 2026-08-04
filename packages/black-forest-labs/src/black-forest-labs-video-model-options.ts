import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  blackForestLabsVideoAspectRatios,
  blackForestLabsVideoResolutions,
} from './black-forest-labs-video-settings';

/**
 * A single FLUX 3 keyframe: either an image on its own, or an
 * `[seconds, image]` pair that pins the image to that second of the clip.
 */
export const blackForestLabsVideoKeyframeSchema = z.union([
  z.string(),
  z.tuple([z.number(), z.string()]),
]);

export const blackForestLabsVideoProviderOptions = z.object({
  /**
   * Output resolution tier. Takes precedence over the top-level `resolution`,
   * which is expressed as `{width}x{height}` and has to be mapped onto a tier.
   */
  resolution: z.enum(blackForestLabsVideoResolutions).optional(),

  /**
   * Aspect ratio of the generated video. Takes precedence over the top-level
   * `aspectRatio`, and unlike it can be set to `auto`.
   */
  aspectRatio: z.enum(blackForestLabsVideoAspectRatios).optional(),

  /**
   * Keyframes for image-to-video generation, for the shapes the top-level
   * `image` and `frameImages` options cannot express: more than two images, or
   * images pinned to a specific second. Takes precedence over both.
   *
   * One image opens the clip, two open and close it, and with more the extras
   * are spaced evenly in between. Three or more plain images require an
   * explicit `duration`.
   */
  keyframes: z.array(blackForestLabsVideoKeyframeSchema).optional(),

  /**
   * Moderation strictness from 0 (strictest) to 4. Defaults to 2. Sexual
   * content is capped at 3 and hate content at 2 regardless of the request,
   * and any request carrying conditioning media is capped at 2.
   */
  safetyTolerance: z.number().int().min(0).max(4).optional(),

  /**
   * Render a fast, lower-quality preview instead of the finished video.
   * Defaults to `false`.
   */
  draft: z.boolean().optional(),

  /**
   * Encrypted draft-cache bundle from a prior `draft` generation, which
   * switches the request to draft-enhance mode: the bundle is replayed at full
   * quality.
   *
   * Either the base64-encoded `.bin` downloaded from the draft's `draftCache`
   * URL, or that URL itself while it is still in its expiry window.
   */
  draftCache: z.string().optional(),

  /**
   * Model version to pin. Only `latest` is available today.
   */
  version: z.string().optional(),

  /**
   * Interval in milliseconds between status polls. Defaults to 2000.
   */
  pollIntervalMillis: z.number().int().positive().optional(),

  /**
   * Overall timeout in milliseconds for polling before giving up. Defaults to
   * 600000 (10 minutes).
   */
  pollTimeoutMillis: z.number().int().positive().optional(),
});

export const blackForestLabsVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(blackForestLabsVideoProviderOptions),
);

export type BlackForestLabsVideoModelOptions = InferSchema<
  typeof blackForestLabsVideoModelOptionsSchema
>;
