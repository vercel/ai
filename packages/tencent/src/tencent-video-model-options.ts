import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Provider-specific options for Tencent video generation, passed as
 * `providerOptions.tencent`.
 *
 * Options apply to TokenHub Kling models (`kling-video-*`), VOD AIGC models
 * (`vod/<ModelName>/<ModelVersion>`), or both, as noted on each option. An
 * option that does not apply to the selected model is ignored with a warning.
 */
export type TencentVideoModelOptions = {
  /**
   * Output resolution tier, sent as-is. Takes precedence over the top-level
   * `resolution`.
   *
   * TokenHub Kling: `720p`, `1080p`, `4k`. VOD: e.g. `720P`, `1080P`, `2K`,
   * `4K` depending on the model. Both backends.
   */
  resolution?: string;

  /**
   * TokenHub Kling: audio track mode. `native` generates audio, `original`
   * keeps the audio of a reference video (omni and motion control), `off`
   * disables audio. Takes precedence over the top-level `generateAudio`.
   */
  audio?: 'native' | 'original' | 'off';

  /**
   * TokenHub Kling: whether a multi-shot prompt produces multi-shot output.
   * Supported by `kling-video-v3` and `kling-video-v3-omni`.
   */
  multiShot?: boolean;

  /**
   * TokenHub Kling motion control: whether the character orientation follows
   * the image reference or the motion reference video. Required by the API
   * for motion control models.
   */
  characterOrientation?: 'image' | 'video';

  /**
   * TokenHub Kling: custom elements (subjects) created through the TokenHub
   * element API. `id` is required by motion control models and lets the
   * prompt reference the element.
   */
  elements?: Array<{ elementId: string; id?: string }>;

  /**
   * TokenHub Kling omni: voices to use, referenced in the prompt as `@id`.
   */
  voices?: Array<{ voiceId: string; id: string }>;

  /**
   * How reference videos from `inputReferences` are used. `feature` uses
   * them as a feature reference, `base` as a video to edit. Defaults to
   * `feature`. TokenHub Kling omni and VOD Kling.
   */
  referenceVideoType?: 'feature' | 'base';

  /**
   * Whether to add a watermark (TokenHub `watermark_info`, VOD `LogoAdd`).
   * Both backends.
   */
  watermark?: boolean;

  /**
   * TokenHub Kling: custom task ID, unique within the account.
   */
  externalTaskId?: string;

  /**
   * VOD: prompt describing what the model should avoid.
   */
  negativePrompt?: string;

  /**
   * VOD: whether to optimize the prompt automatically.
   */
  enhancePrompt?: boolean;

  /**
   * VOD: where input files are stored. Tencent defaults to `Mainland`.
   */
  inputRegion?: 'Oversea' | 'OverseaUSWest' | 'Mainland';

  /**
   * VOD: scenario type, e.g. `motion_control`, `avatar_i2v` or `lip_sync`
   * for Kling.
   */
  sceneType?: string;

  /**
   * VOD: whether people and faces may be generated.
   */
  personGeneration?: 'AllowAdult' | 'Disallowed';

  /**
   * VOD: whether to run a compliance check on the input.
   */
  inputComplianceCheck?: boolean;

  /**
   * VOD: whether to run a compliance check on the output.
   */
  outputComplianceCheck?: boolean;

  /**
   * VOD: whether to upscale output with video enhancement. Tencent enables
   * enhancement by default when the resolution exceeds what the model
   * renders natively.
   */
  enhanceSwitch?: boolean;

  /**
   * VOD: whether to run the task in off-peak mode.
   */
  offPeak?: boolean;

  /**
   * VOD: deduplication identifier. A request that repeats an identifier used
   * within the last three days fails.
   */
  sessionId?: string;

  /**
   * VOD: context string passed through to callbacks.
   */
  sessionContext?: string;

  /**
   * VOD: task priority from -10 to 10.
   */
  tasksPriority?: number;

  /**
   * VOD: reserved field for model-specific parameters, sent as-is.
   */
  extInfo?: string;

  /**
   * VOD: materials registered with `CreateAigcMaterial`, referenced by their
   * `asset://` URL. VOD requires assets for images that show real people.
   * Sent after the other file inputs.
   */
  assets?: Array<{
    /** Asset URL, for example `asset://asset-…`. */
    url: string;
    /** How the asset is used. Defaults to `Reference`. */
    usage?: 'FirstFrame' | 'LastFrame' | 'Reference';
    /** Asset media category. Defaults to `Image`. */
    category?: 'Image' | 'Video' | 'Audio';
  }>;
};

export const tencentVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      resolution: z.string().optional(),
      audio: z.enum(['native', 'original', 'off']).optional(),
      multiShot: z.boolean().optional(),
      characterOrientation: z.enum(['image', 'video']).optional(),
      elements: z
        .array(z.object({ elementId: z.string(), id: z.string().optional() }))
        .optional(),
      voices: z
        .array(z.object({ voiceId: z.string(), id: z.string() }))
        .optional(),
      referenceVideoType: z.enum(['feature', 'base']).optional(),
      watermark: z.boolean().optional(),
      externalTaskId: z.string().optional(),
      negativePrompt: z.string().optional(),
      enhancePrompt: z.boolean().optional(),
      inputRegion: z.enum(['Oversea', 'OverseaUSWest', 'Mainland']).optional(),
      sceneType: z.string().optional(),
      personGeneration: z.enum(['AllowAdult', 'Disallowed']).optional(),
      inputComplianceCheck: z.boolean().optional(),
      outputComplianceCheck: z.boolean().optional(),
      enhanceSwitch: z.boolean().optional(),
      offPeak: z.boolean().optional(),
      sessionId: z.string().optional(),
      sessionContext: z.string().optional(),
      tasksPriority: z.number().int().min(-10).max(10).optional(),
      extInfo: z.string().optional(),
      assets: z
        .array(
          z.object({
            url: z.string(),
            usage: z.enum(['FirstFrame', 'LastFrame', 'Reference']).optional(),
            category: z.enum(['Image', 'Video', 'Audio']).optional(),
          }),
        )
        .optional(),
    }) satisfies z.ZodType<TencentVideoModelOptions>,
  ),
);

/** Options that only TokenHub Kling models read. */
export const TOKENHUB_ONLY_OPTIONS = [
  'audio',
  'multiShot',
  'characterOrientation',
  'elements',
  'voices',
  'externalTaskId',
] as const satisfies ReadonlyArray<keyof TencentVideoModelOptions>;

/** Options that only VOD models read. */
export const VOD_ONLY_OPTIONS = [
  'negativePrompt',
  'enhancePrompt',
  'inputRegion',
  'sceneType',
  'personGeneration',
  'inputComplianceCheck',
  'outputComplianceCheck',
  'enhanceSwitch',
  'offPeak',
  'sessionId',
  'sessionContext',
  'tasksPriority',
  'extInfo',
  'assets',
] as const satisfies ReadonlyArray<keyof TencentVideoModelOptions>;
