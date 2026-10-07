import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Containers Topaz accepts for the input video.
 */
export const topazSourceContainers = [
  '3gp',
  'avi',
  'dv',
  'flv',
  'm1v',
  'm2t',
  'm2ts',
  'm2v',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'mts',
  'mxf',
  'ser',
  'ts',
  'vob',
  'webm',
  'wmv',
] as const;

/**
 * Containers Topaz can produce for the enhanced video.
 */
export const topazOutputContainers = [
  'mp4',
  'mov',
  'mkv',
  'avi',
  'webm',
] as const;

/**
 * Metadata about the input video.
 *
 * Starlight models require `width`, `height`, `duration` and `frameRate`
 * (Topaz prices them from these values), and for other models they let Topaz
 * estimate the cost before it has the video. The AI SDK does not inspect
 * media files, so the values come from the caller. Setting any of them
 * requires all four.
 */
export const topazVideoSourceSchema = z.object({
  /**
   * Width of the input video in pixels.
   */
  width: z.number().int().positive().optional(),

  /**
   * Height of the input video in pixels.
   */
  height: z.number().int().positive().optional(),

  /**
   * Duration of the input video in seconds.
   */
  duration: z.number().positive().optional(),

  /**
   * Frame rate of the input video.
   */
  frameRate: z.number().positive().optional(),

  /**
   * Total number of frames in the input video. Derived from
   * `duration * frameRate` when omitted, which is only correct for
   * constant-frame-rate input, so set it explicitly for variable-frame-rate
   * sources.
   */
  frameCount: z.number().int().positive().optional(),

  /**
   * Container of the input video. Detected from the input file's media type
   * or URL extension when omitted.
   */
  container: z.enum(topazSourceContainers).optional(),
});

export type TopazVideoSource = z.infer<typeof topazVideoSourceSchema>;

/**
 * Output settings for the enhanced video.
 */
export const topazVideoOutputSchema = z.object({
  /**
   * Width of the output video in pixels. Takes precedence over the
   * `resolution` call option.
   */
  width: z.number().int().positive().optional(),

  /**
   * Height of the output video in pixels. Takes precedence over the
   * `resolution` call option.
   */
  height: z.number().int().positive().optional(),

  /**
   * Frame rate of the output video. Takes precedence over the `fps` call
   * option. Topaz only changes the frame rate when a frame-interpolation
   * filter is present.
   */
  frameRate: z.number().positive().optional(),

  /**
   * Audio codec of the output video. Defaults to `AAC`.
   */
  audioCodec: z.enum(['AAC', 'AC3', 'PCM']).optional(),

  /**
   * Audio bitrate, e.g. `192k`. Topaz uses the codec default when omitted.
   */
  audioBitrate: z.string().optional(),

  /**
   * How to handle the input audio track. Defaults to `Copy`.
   */
  audioTransfer: z.enum(['Copy', 'Convert', 'None']).optional(),

  /**
   * Video encoder. Topaz defaults to `H265`. `ProRes` forces a `mov`
   * container, `AV1` and `VP9` force `mp4`.
   */
  videoEncoder: z.enum(['AV1', 'H264', 'H265', 'ProRes', 'VP9']).optional(),

  /**
   * Encoder profile, e.g. `Main10` for H265 or `422 HQ` for ProRes. Topaz uses
   * the encoder's default profile when omitted.
   */
  videoProfile: z.string().optional(),

  /**
   * Constant bitrate, e.g. `20m`. Required for `VP9`. Mutually exclusive with
   * `dynamicCompressionLevel`.
   */
  videoBitrate: z.string().optional(),

  /**
   * Automatic constant-quality compression level. Topaz defaults to `High`
   * unless `videoBitrate` is set.
   */
  dynamicCompressionLevel: z.enum(['Low', 'Mid', 'High']).optional(),

  /**
   * Center-crop to fit the output dimensions.
   */
  cropToFit: z.boolean().optional(),

  /**
   * Container of the output video. Defaults to the input container when Topaz
   * can produce it, otherwise `mp4`.
   */
  container: z.enum(topazOutputContainers).optional(),
});

export type TopazVideoOutput = z.infer<typeof topazVideoOutputSchema>;

/**
 * Provider options for Topaz video models.
 *
 * @see https://developer.topazlabs.com/video-models/proteus/proteus-1
 * @see https://developer.topazlabs.com/video-models/starlight/starlight-precise-2.6
 */
export const topazVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
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
      grainType: z.enum(['silver_rich', 'gaussian', 'grey']).optional(),

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
    }),
  ),
);

export type TopazVideoModelOptions = InferSchema<
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
