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

const blackForestLabsTimedVideoKeyframeSchema = z.tuple([
  z.number().min(0).max(20),
  z.string(),
]);

export const blackForestLabsVideoKeyframesSchema = z.union([
  z.array(z.string()).min(1).max(10),
  z
    .array(blackForestLabsTimedVideoKeyframeSchema)
    .min(1)
    .max(10)
    .refine(
      keyframes =>
        keyframes.every(
          (keyframe, index) =>
            index === 0 || keyframe[0] > keyframes[index - 1][0],
        ),
      { message: 'Timed keyframes must be in chronological order.' },
    ),
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
  keyframes: blackForestLabsVideoKeyframesSchema.optional(),

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
  version: z.literal('latest').optional(),
});

export const blackForestLabsVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(blackForestLabsVideoProviderOptions),
);

export type BlackForestLabsVideoModelOptions = InferSchema<
  typeof blackForestLabsVideoModelOptionsSchema
>;
