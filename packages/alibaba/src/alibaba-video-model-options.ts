import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type AlibabaVideoModelOptions = {
  /** Negative prompt to specify what to avoid (max 500 chars). */
  negativePrompt?: string | null;
  /** URL to audio file for audio-video sync (WAV/MP3, 3-30s, max 15MB). */
  audioUrl?: string | null;
  /** Enable prompt extension/rewriting for better generation. Defaults to true. */
  promptExtend?: boolean | null;
  /**
   * Shot type: 'single' for single-shot or 'multi' for multi-shot narrative
   * (wan2.6 and earlier; wan2.7 models describe shot structure in the prompt).
   */
  shotType?: 'single' | 'multi' | null;
  /** Whether to add watermark to generated video. Defaults to false. */
  watermark?: boolean | null;
  /**
   * Enable audio generation (wan2.6 I2V/R2V and wan3 models;
   * wan2.7 models always generate audio). Defaults to true on wan3.
   */
  audio?: boolean | null;
  /**
   * Reference URLs for reference-to-video mode (wan2.6 models).
   * Array of URLs to images (0-5) and/or videos (0-3), max 5 total.
   * Use character identifiers (character1, character2) in prompts to reference them.
   */
  referenceUrls?: string[] | null;
  /**
   * Explicit media array (wan2.7 and wan3 models). Overrides the automatic
   * mapping from `inputReferences` and `frameImages`.
   * Use `Image 1`, `Video 1`, etc. in prompts to reference media items
   * (images, videos, and audio are counted separately, in array order).
   *
   * `reference_audio`, `file`, and `link` are wan3-only and have no top-level
   * call option, so they can only be passed here. wan3 also rejects mixing
   * `reference_*`/`file`/`link` with `first_frame`/`last_frame`.
   */
  media?: Array<{
    type:
      | 'reference_image'
      | 'reference_video'
      | 'reference_audio'
      | 'first_frame'
      | 'last_frame'
      | 'file'
      | 'link';
    /** Public URL, or a `data:{mime};base64,{data}` URI for images. */
    url: string;
    /** URL to an audio file used as voice reference for this media item. */
    referenceVoice?: string | null;
  }> | null;
  /**
   * Aspect ratio (wan2.7 text-to-video and reference-to-video models, and
   * every wan3 generation). `adaptive` is wan3-only, and is its default.
   */
  ratio?: 'adaptive' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | null;
  /** Polling interval in milliseconds. Defaults to 5000 (5 seconds). */
  pollIntervalMs?: number | null;
  /** Maximum wait time in milliseconds for video generation. Defaults to 600000 (10 minutes). */
  pollTimeoutMs?: number | null;
  [key: string]: unknown;
};

export const alibabaVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.looseObject({
      negativePrompt: z.string().nullish(),
      audioUrl: z.string().nullish(),
      promptExtend: z.boolean().nullish(),
      shotType: z.enum(['single', 'multi']).nullish(),
      watermark: z.boolean().nullish(),
      audio: z.boolean().nullish(),
      referenceUrls: z.array(z.string()).nullish(),
      media: z
        .array(
          z.object({
            type: z.enum([
              'reference_image',
              'reference_video',
              'reference_audio',
              'first_frame',
              'last_frame',
              'file',
              'link',
            ]),
            url: z.string(),
            referenceVoice: z.string().nullish(),
          }),
        )
        .nullish(),
      ratio: z
        .enum(['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4'])
        .nullish(),
      pollIntervalMs: z.number().positive().nullish(),
      pollTimeoutMs: z.number().positive().nullish(),
    }),
  ),
);
