import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const nonEmptyStringSchema = z.string().min(1);

type XaiVideoBaseOptions = {
  pollIntervalMs?: number | null;
  pollTimeoutMs?: number | null;
  resolution?: '480p' | '720p' | null;
  [key: string]: unknown;
};

/**
 * Provider options for xAI video generation.
 *
 * The mode-specific fields (`videoUrl`, `extensionUrl`, `referenceImageUrls`)
 * are mutually exclusive — only one can be set per request:
 *
 * - `videoUrl`           → video editing   (`POST /v1/videos/edits`)
 * - `extensionUrl`       → video extension (`POST /v1/videos/extensions`)
 * - `referenceImageUrls` → reference-to-video generation (`POST /v1/videos/generations`)
 * - none of the above    → text-to-video or image-to-video (`POST /v1/videos/generations`)
 */
export type XaiVideoModelOptions = XaiVideoBaseOptions &
  (
    | {
        /** Source video URL to edit. Mutually exclusive with `extensionUrl` and `referenceImageUrls`. */
        videoUrl: string;
        extensionUrl?: undefined;
        referenceImageUrls?: undefined;
      }
    | {
        /** Source video URL to extend from its last frame. Mutually exclusive with `videoUrl` and `referenceImageUrls`. */
        extensionUrl: string;
        videoUrl?: undefined;
        referenceImageUrls?: undefined;
      }
    | {
        /**
         * Reference image URLs (or base64 data URIs) for reference-to-video (R2V) generation.
         * Up to 7 images. Mutually exclusive with `videoUrl` and `extensionUrl`.
         */
        referenceImageUrls: [string, ...string[]];
        videoUrl?: undefined;
        extensionUrl?: undefined;
      }
    | {
        videoUrl?: undefined;
        extensionUrl?: undefined;
        referenceImageUrls?: undefined;
      }
  );

export const xaiVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        pollIntervalMs: z.number().positive().nullish(),
        pollTimeoutMs: z.number().positive().nullish(),
        resolution: z.enum(['480p', '720p']).nullish(),
        videoUrl: nonEmptyStringSchema.optional(),
        extensionUrl: nonEmptyStringSchema.optional(),
        referenceImageUrls: z
          .array(nonEmptyStringSchema)
          .min(1)
          .max(7)
          .optional(),
      })
      .passthrough(),
  ),
);
