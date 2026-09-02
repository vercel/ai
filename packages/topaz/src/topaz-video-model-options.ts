import { z } from 'zod/v4';

/**
 * Metadata about the input video.
 *
 * Topaz requires this on `POST /video/` before the upload happens, and the AI
 * SDK does not inspect media files (no provider package ships a demuxer), so
 * whatever cannot be derived from the bytes has to be supplied here.
 *
 * `size` and `container` are derived from the input file and are not part of
 * this object. `duration`, `frameRate` and the resolution are read from the
 * `duration`, `fps` and `resolution` call options when those are set, so this
 * object only needs to cover the gaps.
 */
export const topazVideoSourceSchema = z.object({
  /**
   * Width of the input video in pixels. Falls back to the width of the
   * `resolution` call option.
   */
  width: z.number().int().positive().optional(),

  /**
   * Height of the input video in pixels. Falls back to the height of the
   * `resolution` call option.
   */
  height: z.number().int().positive().optional(),

  /**
   * Duration of the input video in seconds. Falls back to the `duration` call
   * option.
   */
  duration: z.number().positive().optional(),

  /**
   * Frame rate of the input video. Falls back to the `fps` call option.
   */
  frameRate: z.number().positive().optional(),

  /**
   * Total number of frames in the input video. Derived from
   * `duration * frameRate` when omitted, which is only correct for
   * constant-frame-rate input - set it explicitly for variable-frame-rate
   * sources.
   */
  frameCount: z.number().int().positive().optional(),

  /**
   * Container of the input video. Detected from the input file's media type
   * when omitted.
   */
  container: z.enum(['mp4', 'mov', 'mkv']).optional(),
});

export type TopazVideoSource = z.infer<typeof topazVideoSourceSchema>;

/**
 * Output settings for the enhanced video. Anything omitted defaults to the
 * corresponding source value.
 */
export const topazVideoOutputSchema = z.object({
  /**
   * Width of the output video in pixels. Defaults to the source width.
   */
  width: z.number().int().positive().optional(),

  /**
   * Height of the output video in pixels. Defaults to the source height.
   */
  height: z.number().int().positive().optional(),

  /**
   * Frame rate of the output video. Defaults to the source frame rate.
   */
  frameRate: z.number().positive().optional(),

  /**
   * Audio codec of the output video. Defaults to `AAC`.
   */
  audioCodec: z.enum(['AAC', 'AC3', 'PCM']).optional(),

  /**
   * How to handle the input audio track. Defaults to `Copy`.
   */
  audioTransfer: z.enum(['Copy', 'Convert', 'None']).optional(),

  /**
   * Container of the output video. Defaults to the source container.
   */
  container: z.enum(['mp4', 'mov', 'mkv']).optional(),

  /**
   * Dynamic compression level applied to the output.
   */
  dynamicCompressionLevel: z.string().optional(),
});

export type TopazVideoOutput = z.infer<typeof topazVideoOutputSchema>;

/**
 * Provider options for Topaz video models.
 *
 * @see https://developer.topazlabs.com/video-models/proteus/proteus-1
 * @see https://developer.topazlabs.com/video-models/starlight/starlight-precise-2.6
 */
export const topazVideoModelOptionsSchema = z.object({
  source: topazVideoSourceSchema.optional(),
  output: topazVideoOutputSchema.optional(),

  /**
   * Extra `filters[]` entries to send alongside the model's own filter, e.g. a
   * frame-interpolation filter. Each entry must include a `model` key.
   */
  additionalFilters: z.array(z.record(z.string(), z.unknown())).optional(),

  /**
   * Escape hatch for filter settings this package does not model yet. Merged
   * into the model's filter entry, taking precedence over the typed options
   * below.
   */
  filter: z.record(z.string(), z.unknown()).optional(),

  // ---------------------------------------------------------------------------
  // Proteus (`proteus`)
  // ---------------------------------------------------------------------------

  /** Proteus: how the input frames are encoded. */
  videoType: z
    .enum(['Progressive', 'Interlaced', 'ProgressiveInterlaced'])
    .optional(),

  /** Proteus: parameter estimation mode. */
  auto: z.enum(['Auto', 'Manual', 'Relative']).optional(),

  /** Proteus: field order for interlaced input. */
  fieldOrder: z.enum(['TopFirst', 'BottomFirst', 'Auto']).optional(),

  /** Proteus: focus-fix strength. */
  focusFixLevel: z.enum(['None', 'Normal', 'Strong']).optional(),

  /** Proteus: compression artifact removal, -1 to 1. */
  compression: z.number().min(-1).max(1).optional(),

  /** Proteus: detail recovery, -1 to 1. */
  details: z.number().min(-1).max(1).optional(),

  /** Proteus: pre-processing noise reduction, 0 to 0.1. */
  prenoise: z.number().min(0).max(0.1).optional(),

  /** Proteus: noise reduction, -1 to 1. */
  noise: z.number().min(-1).max(1).optional(),

  /** Proteus: halo suppression, -1 to 1. */
  halo: z.number().min(-1).max(1).optional(),

  /** Proteus: pre-processing blur, -1 to 1. */
  preblur: z.number().min(-1).max(1).optional(),

  /** Proteus: sharpening, -1 to 1. */
  blur: z.number().min(-1).max(1).optional(),

  /** Proteus: grain amount, 0 to 0.1. */
  grain: z.number().min(0).max(0.1).optional(),

  /** Proteus: grain sigma, 0 to 1. */
  grainSigma: z.number().min(0).max(1).optional(),

  /** Proteus: grain size, 0 to 5. */
  grainSize: z.number().min(0).max(5).optional(),

  /** Proteus: grain model. */
  grainType: z.enum(['silverRich', 'gaussian', 'grey']).optional(),

  /** Proteus: original detail recovery, 0 to 1. */
  recoverOriginalDetailValue: z.number().min(0).max(1).optional(),

  // ---------------------------------------------------------------------------
  // Starlight Precise (`starlight-precise-2.6`)
  // ---------------------------------------------------------------------------

  /** Starlight: sharpening applied to the output, 1.0 to 5.0. Defaults to 5.0. */
  sharpness: z.number().min(1).max(5).optional(),

  /** Starlight: output bit depth. */
  videoBitDepth: z.number().int().positive().optional(),

  /** Starlight: output video codec. */
  videoCodec: z.enum(['ffv1', 'prores', 'vp9']).optional(),

  /** Starlight: output chroma subsampling profile. */
  videoProfile: z.enum(['420', '422', '444']).optional(),

  /** Starlight: whether to watermark the output. Defaults to `false`. */
  watermark: z.boolean().optional(),
});

export type TopazVideoModelOptions = z.infer<
  typeof topazVideoModelOptionsSchema
>;

/**
 * Option keys that are structural rather than filter settings, so they are not
 * forwarded into the `filters[]` entry.
 */
export const TOPAZ_NON_FILTER_OPTION_KEYS = [
  'source',
  'output',
  'additionalFilters',
  'filter',
] as const satisfies ReadonlyArray<keyof TopazVideoModelOptions>;
