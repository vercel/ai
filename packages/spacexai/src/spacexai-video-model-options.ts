import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const nonEmptyStringSchema = z.string().min(1);
const resolutionSchema = z.enum(['480p', '720p', '1080p']);
const modeSchema = z.enum(['edit-video', 'extend-video', 'reference-to-video']);

export type SpaceXAIVideoMode = z.infer<typeof modeSchema>;
type SpaceXAIVideoResolution = z.infer<typeof resolutionSchema>;

interface SpaceXAIVideoSharedOptions {
  pollIntervalMs?: number | null;
  pollTimeoutMs?: number | null;
  resolution?: SpaceXAIVideoResolution | null;
}

interface SpaceXAIVideoUserOptions {
  /**
   * A unique identifier representing the end user, for abuse monitoring.
   */
  user?: string;
}

interface SpaceXAIVideoEditModeOptions
  extends SpaceXAIVideoSharedOptions, SpaceXAIVideoUserOptions {
  /**
   * Select edit-video mode explicitly for best autocomplete and narrowing.
   */
  mode: 'edit-video';
  /** Source video URL to edit. */
  videoUrl: string;
}

interface SpaceXAIVideoExtendModeOptions extends SpaceXAIVideoSharedOptions {
  /**
   * Select extend-video mode explicitly for best autocomplete and narrowing.
   */
  mode: 'extend-video';
  /** Source video URL to extend from its last frame. */
  videoUrl: string;
}

interface SpaceXAIVideoReferenceToVideoOptions
  extends SpaceXAIVideoSharedOptions, SpaceXAIVideoUserOptions {
  /**
   * Select reference-to-video mode explicitly for best autocomplete and narrowing.
   */
  mode: 'reference-to-video';
  /** Reference image URLs (1-7) for R2V generation. */
  referenceImageUrls: string[];
  /**
   * Preset voice ids (up to 3) that give the subject a voice.
   */
  referenceVoiceIds?: string[];
}

interface SpaceXAIVideoGenerationOptions
  extends SpaceXAIVideoSharedOptions, SpaceXAIVideoUserOptions {
  mode?: undefined;
  videoUrl?: undefined;
  referenceImageUrls?: undefined;
}

interface SpaceXAILegacyEditVideoOptions
  extends SpaceXAIVideoSharedOptions, SpaceXAIVideoUserOptions {
  /**
   * Legacy backward-compatible shape: omitting `mode` while providing
   * `videoUrl` behaves like edit-video.
   */
  mode?: undefined;
  videoUrl: string;
}

interface SpaceXAILegacyReferenceToVideoOptions
  extends SpaceXAIVideoSharedOptions, SpaceXAIVideoUserOptions {
  /**
   * Legacy backward-compatible shape: omitting `mode` while providing
   * `referenceImageUrls` behaves like reference-to-video.
   */
  mode?: undefined;
  referenceImageUrls: string[];
  /**
   * Preset voice ids (up to 3) that give the subject a voice.
   */
  referenceVoiceIds?: string[];
}

/**
 * Provider options for xAI video generation.
 *
 * Use the `mode` option to select the operation:
 *
 * - `'edit-video'`         + `videoUrl`           -- video editing   (`POST /v1/videos/edits`)
 * - `'extend-video'`       + `videoUrl`           -- video extension (`POST /v1/videos/extensions`)
 * - `'reference-to-video'` + `referenceImageUrls` -- R2V generation  (`POST /v1/videos/generations`)
 * - no `mode`                                     -- standard generation from text prompts or image input
 *
 * Runtime remains backward compatible with legacy auto-detected provider
 * options, but the public TypeScript type is intentionally explicit so editors
 * can suggest valid modes and flag invalid field combinations.
 */
export type SpaceXAIVideoModelOptions =
  | SpaceXAIVideoGenerationOptions
  | SpaceXAIVideoEditModeOptions
  | SpaceXAIVideoExtendModeOptions
  | SpaceXAIVideoReferenceToVideoOptions
  | SpaceXAILegacyEditVideoOptions
  | SpaceXAILegacyReferenceToVideoOptions;

// ── Runtime schemas ───────────────────────────────────────────────────
const baseFields = {
  pollIntervalMs: z.number().positive().nullish(),
  pollTimeoutMs: z.number().positive().nullish(),
  resolution: resolutionSchema.nullish(),
};

const runtimeSchema = z.looseObject({
  mode: modeSchema.optional(),
  videoUrl: nonEmptyStringSchema.optional(),
  referenceImageUrls: z.array(nonEmptyStringSchema).min(1).max(7).optional(),
  referenceVoiceIds: z.array(nonEmptyStringSchema).max(3).optional(),
  user: z.string().optional(),
  ...baseFields,
});

export type SpaceXAIParsedVideoModelOptions = z.infer<typeof runtimeSchema>;

export const spacexaiVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(runtimeSchema),
);
