import {
  AISDKError,
  type Experimental_VideoModelV3,
  NoSuchModelError,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  delay,
  type FetchFunction,
  getFromApi,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  type Resolvable,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { klingaiFailedResponseHandler } from './klingai-error';
import type { KlingAIVideoModelId } from './klingai-video-settings';

type KlingAIVideoMode = 't2v' | 'i2v' | 'motion-control';

/**
 * Detects the video generation mode from the model ID suffix.
 */
function detectMode(modelId: string): KlingAIVideoMode {
  if (modelId.endsWith('-t2v')) return 't2v';
  if (modelId.endsWith('-i2v')) return 'i2v';
  if (modelId.endsWith('-motion-control')) return 'motion-control';
  throw new NoSuchModelError({ modelId, modelType: 'videoModel' });
}

/**
 * Maps video generation mode to the KlingAI API endpoint path.
 */
const modeEndpointMap: Record<KlingAIVideoMode, string> = {
  t2v: '/v1/videos/text2video',
  i2v: '/v1/videos/image2video',
  'motion-control': '/v1/videos/motion-control',
};

/**
 * Derives the KlingAI API `model_name` from the SDK model ID.
 * Strips the mode suffix and converts dots to hyphens.
 *
 * Examples:
 * - 'kling-v2.6-t2v' → 'kling-v2-6'
 * - 'kling-v2.1-master-i2v' → 'kling-v2-1-master'
 * - 'kling-v1-t2v' → 'kling-v1'
 * - 'kling-v3.0-t2v' → 'kling-v3'
 */
function getApiModelName(modelId: string, mode: KlingAIVideoMode): string {
  const suffix = mode === 'motion-control' ? '-motion-control' : `-${mode}`;
  const baseName = modelId.slice(0, -suffix.length);
  return baseName.replace(/\.0$/, '').replace(/\./g, '-');
}

/**
 * Provider-specific options for KlingAI video generation.
 *
 * Not all options are supported by every model version and video mode (T2V, I2V,
 * motion control). See the KlingAI capability map for detailed compatibility:
 * https://app.klingai.com/global/dev/document-api/apiReference/model/skillsMap
 */
export type KlingAIVideoModelOptions = {
  /**
   * Video generation mode.
   *
   * - `'std'`: Standard mode — cost-effective.
   * - `'pro'`: Professional mode — higher quality but longer generation time.
   */
  mode?: 'std' | 'pro' | null;

  /**
   * Polling interval in milliseconds for checking task status.
   * Default: 5000 (5 seconds).
   */
  pollIntervalMs?: number | null;

  /**
   * Maximum time in milliseconds to wait for video generation.
   * Default: 600000 (10 minutes).
   */
  pollTimeoutMs?: number | null;

  // --- T2V and I2V options ---

  /**
   * Negative text prompt to specify what to avoid.
   * Cannot exceed 2500 characters.
   */
  negativePrompt?: string | null;

  /**
   * Whether to generate sound simultaneously when generating videos.
   * Only V2.6 and subsequent versions support this parameter,
   * and requires `mode: 'pro'`.
   */
  sound?: 'on' | 'off' | null;

  /**
   * Flexibility in video generation. The higher the value, the lower the
   * model's flexibility, and the stronger the relevance to the user's prompt.
   * Value range: [0, 1]. Kling-v2.x models do not support this parameter.
   */
  cfgScale?: number | null;

  /**
   * Camera movement control. If not specified, the model will intelligently
   * match based on the input text/images.
   */
  cameraControl?: {
    type:
      | 'simple'
      | 'down_back'
      | 'forward_up'
      | 'right_turn_forward'
      | 'left_turn_forward';
    config?: {
      horizontal?: number | null;
      vertical?: number | null;
      pan?: number | null;
      tilt?: number | null;
      roll?: number | null;
      zoom?: number | null;
    } | null;
  } | null;

  // --- I2V-specific options ---

  /**
   * End frame image for I2V start+end frame control.
   * Supports image URL or raw base64-encoded image data.
   * Requires `mode: 'pro'` for most models.
   */
  imageTail?: string | null;

  /**
   * Static brush mask image for I2V motion brush.
   * Supports image URL or raw base64-encoded image data.
   */
  staticMask?: string | null;

  /**
   * Dynamic brush configurations for I2V motion brush.
   * Up to 6 groups, each with a mask and motion trajectories.
   */
  dynamicMasks?: Array<{
    mask: string;
    trajectories: Array<{ x: number; y: number }>;
  }> | null;

  // --- v3.0 multi-shot options (T2V and I2V) ---

  /**
   * Enable multi-shot video generation (Kling v3.0+).
   * When true, the video is split into up to 6 storyboard shots
   * with individual prompts and durations.
   *
   * When multiShot is true with shotType 'customize', multiPrompt is required.
   * When multiShot is true, the main prompt parameter is ignored by the API.
   */
  multiShot?: boolean | null;

  /**
   * Storyboard method for multi-shot video generation (Kling v3.0+).
   * Required when multiShot is true.
   *
   * - `'customize'`: User-defined shots via multiPrompt.
   * - `'intelligence'`: Model auto-segments based on the main prompt.
   */
  shotType?: 'customize' | 'intelligence' | null;

  /**
   * Per-shot details for multi-shot video generation (Kling v3.0+).
   * Required when multiShot is true and shotType is 'customize'.
   *
   * Up to 6 shots. Each shot has an index, prompt (max 512 chars),
   * and duration in seconds. Shot durations must sum to the total duration.
   */
  multiPrompt?: Array<{
    index: number;
    prompt: string;
    duration: string;
  }> | null;

  // --- v3.0 element control (I2V only) ---

  /**
   * Reference elements for element control (Kling v3.0+ I2V).
   * Supports video character elements and multi-image elements.
   * Up to 3 reference elements.
   *
   * Cannot coexist with voiceList on the I2V endpoint.
   */
  elementList?: Array<{
    element_id: number;
  }> | null;

  // --- v3.0 voice control (T2V and I2V) ---

  /**
   * Voice references for voice control (Kling v3.0+).
   * Up to 2 voice references. Referenced via `<<<voice_1>>>` template
   * syntax in the prompt.
   *
   * When voiceList is used and the prompt references voice IDs,
   * sound must be set to 'on'.
   * Cannot coexist with elementList on the I2V endpoint.
   */
  voiceList?: Array<{
    voice_id: string;
  }> | null;

  // --- Motion-control-specific options ---

  /**
   * URL of the reference video. The character actions in the generated video
   * are consistent with the reference video.
   *
   * Supports .mp4/.mov, max 100MB, side lengths 340px–3850px,
   * duration 3–30 seconds (depends on `characterOrientation`).
   */
  videoUrl?: string | null;

  /**
   * Orientation of the characters in the generated video.
   *
   * - `'image'`: Same orientation as the person in the image.
   *   Reference video duration max 10 seconds.
   * - `'video'`: Same orientation as the person in the video.
   *   Reference video duration max 30 seconds.
   */
  characterOrientation?: 'image' | 'video' | null;

  /**
   * Whether to keep the original sound of the reference video.
   * Default: `'yes'`.
   */
  keepOriginalSound?: 'yes' | 'no' | null;

  /**
   * Whether to generate watermarked results simultaneously.
   */
  watermarkEnabled?: boolean | null;

  [key: string]: unknown; // For passthrough
};

const klingaiVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        mode: z.enum(['std', 'pro']).nullish(),
        pollIntervalMs: z.number().positive().nullish(),
        pollTimeoutMs: z.number().positive().nullish(),
        // T2V and I2V
        negativePrompt: z.string().nullish(),
        sound: z.enum(['on', 'off']).nullish(),
        cfgScale: z.number().nullish(),
        cameraControl: z
          .object({
            type: z.enum([
              'simple',
              'down_back',
              'forward_up',
              'right_turn_forward',
              'left_turn_forward',
            ]),
            config: z
              .object({
                horizontal: z.number().nullish(),
                vertical: z.number().nullish(),
                pan: z.number().nullish(),
                tilt: z.number().nullish(),
                roll: z.number().nullish(),
                zoom: z.number().nullish(),
              })
              .nullish(),
          })
          .nullish(),
        // v3.0 multi-shot
        multiShot: z.boolean().nullish(),
        shotType: z.enum(['customize', 'intelligence']).nullish(),
        multiPrompt: z
          .array(
            z.object({
              index: z.number(),
              prompt: z.string(),
              duration: z.string(),
            }),
          )
          .nullish(),
        // v3.0 element control (I2V)
        elementList: z
          .array(
            z.object({
              element_id: z.number(),
            }),
          )
          .nullish(),
        // v3.0 voice control
        voiceList: z
          .array(
            z.object({
              voice_id: z.string(),
            }),
          )
          .nullish(),
        // I2V-specific
        imageTail: z.string().nullish(),
        staticMask: z.string().nullish(),
        dynamicMasks: z
          .array(
            z.object({
              mask: z.string(),
              trajectories: z.array(z.object({ x: z.number(), y: z.number() })),
            }),
          )
          .nullish(),
        // Motion-control-specific
        videoUrl: z.string().nullish(),
        characterOrientation: z.enum(['image', 'video']).nullish(),
        keepOriginalSound: z.enum(['yes', 'no']).nullish(),
        watermarkEnabled: z.boolean().nullish(),
      })
      .passthrough(),
  ),
);

/**
 * Known provider option keys that are handled explicitly and should not be
 * passed through to the API body.
 */
const HANDLED_PROVIDER_OPTIONS = new Set([
  'mode',
  'pollIntervalMs',
  'pollTimeoutMs',
  'negativePrompt',
  'sound',
  'cfgScale',
  'cameraControl',
  'multiShot',
  'shotType',
  'multiPrompt',
  'elementList',
  'voiceList',
  'imageTail',
  'staticMask',
  'dynamicMasks',
  'videoUrl',
  'characterOrientation',
  'keepOriginalSound',
  'watermarkEnabled',
]);

interface KlingAIVideoModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class KlingAIVideoModel implements Experimental_VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: KlingAIVideoModelId,
    private readonly config: KlingAIVideoModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];
    const mode = detectMode(this.modelId);

    const klingaiOptions = (await parseProviderOptions({
      provider: 'klingai',
      providerOptions: options.providerOptions,
      schema: klingaiVideoModelOptionsSchema,
    })) as KlingAIVideoModelOptions | undefined;

    let body: Record<string, unknown>;

    if (mode === 'motion-control') {
      body = this.buildMotionControlBody(options, klingaiOptions, warnings);
    } else if (mode === 't2v') {
      body = this.buildT2VBody(options, klingaiOptions, warnings);
    } else {
      body = this.buildI2VBody(options, klingaiOptions, warnings);
    }

    // Warn about universally unsupported standard options
    if (options.resolution) {
      warnings.push({
        type: 'unsupported',
        feature: 'resolution',
        details: 'KlingAI video models do not support the resolution option.',
      });
    }

    if (options.seed) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details:
          'KlingAI video models do not support seed for deterministic generation.',
      });
    }

    if (options.fps) {
      warnings.push({
        type: 'unsupported',
        feature: 'fps',
        details: 'KlingAI video models do not support custom FPS.',
      });
    }

    if (options.n != null && options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'KlingAI video models do not support generating multiple videos per call. ' +
          'Only 1 video will be generated.',
      });
    }

    const endpointPath = modeEndpointMap[mode];

    // Step 1: Create the task
    const { value: createResponse, responseHeaders: createHeaders } =
      await postJsonToApi({
        url: `${this.config.baseURL}${endpointPath}`,
        headers: combineHeaders(
          await resolve(this.config.headers),
          options.headers,
        ),
        body,
        successfulResponseHandler: createJsonResponseHandler(
          klingaiCreateTaskSchema,
        ),
        failedResponseHandler: klingaiFailedResponseHandler,
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

    const taskId = createResponse.data?.task_id;
    if (!taskId) {
      throw new AISDKError({
        name: 'KLINGAI_VIDEO_GENERATION_ERROR',
        message: `No task_id returned from KlingAI API. Response: ${JSON.stringify(createResponse)}`,
      });
    }

    // Step 2: Poll for task completion
    const pollIntervalMs = klingaiOptions?.pollIntervalMs ?? 5000; // 5 seconds
    const pollTimeoutMs = klingaiOptions?.pollTimeoutMs ?? 600000; // 10 minutes
    const startTime = Date.now();
    let finalResponse: KlingAITaskResponse | undefined;
    let responseHeaders: Record<string, string> | undefined = createHeaders;

    while (true) {
      await delay(pollIntervalMs, { abortSignal: options.abortSignal });

      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'KLINGAI_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation timed out after ${pollTimeoutMs}ms`,
        });
      }

      const { value: statusResponse, responseHeaders: pollHeaders } =
        await getFromApi({
          url: `${this.config.baseURL}${endpointPath}/${taskId}`,
          headers: combineHeaders(
            await resolve(this.config.headers),
            options.headers,
          ),
          successfulResponseHandler: createJsonResponseHandler(
            klingaiTaskStatusSchema,
          ),
          failedResponseHandler: klingaiFailedResponseHandler,
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

      responseHeaders = pollHeaders;
      const taskStatus = statusResponse.data?.task_status;

      if (taskStatus === 'succeed') {
        finalResponse = statusResponse;
        break;
      }

      if (taskStatus === 'failed') {
        throw new AISDKError({
          name: 'KLINGAI_VIDEO_GENERATION_FAILED',
          message: `Video generation failed: ${statusResponse.data?.task_status_msg ?? 'Unknown error'}`,
        });
      }

      // Continue polling for 'submitted' and 'processing' statuses
    }

    if (!finalResponse?.data?.task_result?.videos?.length) {
      throw new AISDKError({
        name: 'KLINGAI_VIDEO_GENERATION_ERROR',
        message: `No videos in response. Response: ${JSON.stringify(finalResponse)}`,
      });
    }

    const videos: Array<{ type: 'url'; url: string; mediaType: string }> = [];
    const videoMetadata: Array<{
      id: string;
      url: string;
      watermarkUrl?: string;
      duration?: string;
    }> = [];

    for (const video of finalResponse.data.task_result.videos) {
      if (video.url) {
        videos.push({
          type: 'url',
          url: video.url,
          mediaType: 'video/mp4',
        });
        videoMetadata.push({
          id: video.id ?? '',
          url: video.url,
          ...(video.watermark_url ? { watermarkUrl: video.watermark_url } : {}),
          ...(video.duration ? { duration: video.duration } : {}),
        });
      }
    }

    if (videos.length === 0) {
      throw new AISDKError({
        name: 'KLINGAI_VIDEO_GENERATION_ERROR',
        message: 'No valid video URLs in response',
      });
    }

    return {
      videos,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        klingai: {
          taskId,
          videos: videoMetadata,
        },
      },
    };
  }

  private buildT2VBody(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
    klingaiOptions: KlingAIVideoModelOptions | undefined,
    warnings: SharedV3Warning[],
  ): Record<string, unknown> {
    const mode = 't2v' as const;
    const body: Record<string, unknown> = {
      model_name: getApiModelName(this.modelId, mode),
    };

    if (options.prompt != null) {
      body.prompt = options.prompt;
    }

    if (klingaiOptions?.negativePrompt != null) {
      body.negative_prompt = klingaiOptions.negativePrompt;
    }

    if (klingaiOptions?.sound != null) {
      body.sound = klingaiOptions.sound;
    }

    if (klingaiOptions?.cfgScale != null) {
      body.cfg_scale = klingaiOptions.cfgScale;
    }

    if (klingaiOptions?.mode != null) {
      body.mode = klingaiOptions.mode;
    }

    if (klingaiOptions?.cameraControl != null) {
      body.camera_control = klingaiOptions.cameraControl;
    }

    // Map standard SDK aspectRatio (same format as KlingAI API)
    if (options.aspectRatio != null) {
      body.aspect_ratio = options.aspectRatio;
    }

    // Map standard SDK duration (number → string)
    if (options.duration != null) {
      body.duration = String(options.duration);
    }

    // v3.0 multi-shot
    if (klingaiOptions?.multiShot != null) {
      body.multi_shot = klingaiOptions.multiShot;
    }

    if (klingaiOptions?.shotType != null) {
      body.shot_type = klingaiOptions.shotType;
    }

    if (klingaiOptions?.multiPrompt != null) {
      body.multi_prompt = klingaiOptions.multiPrompt;
    }

    // v3.0 voice control
    if (klingaiOptions?.voiceList != null) {
      body.voice_list = klingaiOptions.voiceList;
    }

    // Image is not supported for T2V
    if (options.image != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'image',
        details:
          'KlingAI text-to-video does not support image input. Use an image-to-video model instead.',
      });
    }

    this.addPassthroughOptions(body, klingaiOptions);

    return body;
  }

  private buildI2VBody(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
    klingaiOptions: KlingAIVideoModelOptions | undefined,
    warnings: SharedV3Warning[],
  ): Record<string, unknown> {
    const mode = 'i2v' as const;
    const body: Record<string, unknown> = {
      model_name: getApiModelName(this.modelId, mode),
    };

    if (options.prompt != null) {
      body.prompt = options.prompt;
    }

    // Map standard SDK image to KlingAI's image field (first/start frame)
    if (options.image != null) {
      if (options.image.type === 'url') {
        body.image = options.image.url;
      } else {
        body.image =
          typeof options.image.data === 'string'
            ? options.image.data
            : convertUint8ArrayToBase64(options.image.data);
      }
    }

    // End frame image via provider options
    if (klingaiOptions?.imageTail != null) {
      body.image_tail = klingaiOptions.imageTail;
    }

    if (klingaiOptions?.negativePrompt != null) {
      body.negative_prompt = klingaiOptions.negativePrompt;
    }

    if (klingaiOptions?.sound != null) {
      body.sound = klingaiOptions.sound;
    }

    if (klingaiOptions?.cfgScale != null) {
      body.cfg_scale = klingaiOptions.cfgScale;
    }

    if (klingaiOptions?.mode != null) {
      body.mode = klingaiOptions.mode;
    }

    if (klingaiOptions?.cameraControl != null) {
      body.camera_control = klingaiOptions.cameraControl;
    }

    if (klingaiOptions?.staticMask != null) {
      body.static_mask = klingaiOptions.staticMask;
    }

    if (klingaiOptions?.dynamicMasks != null) {
      body.dynamic_masks = klingaiOptions.dynamicMasks;
    }

    // v3.0 multi-shot
    if (klingaiOptions?.multiShot != null) {
      body.multi_shot = klingaiOptions.multiShot;
    }

    if (klingaiOptions?.shotType != null) {
      body.shot_type = klingaiOptions.shotType;
    }

    if (klingaiOptions?.multiPrompt != null) {
      body.multi_prompt = klingaiOptions.multiPrompt;
    }

    // v3.0 element control (I2V only)
    if (klingaiOptions?.elementList != null) {
      body.element_list = klingaiOptions.elementList;
    }

    // v3.0 voice control
    if (klingaiOptions?.voiceList != null) {
      body.voice_list = klingaiOptions.voiceList;
    }

    // Map standard SDK duration (number → string)
    if (options.duration != null) {
      body.duration = String(options.duration);
    }

    // aspectRatio is not supported for I2V (determined by input image)
    if (options.aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'KlingAI image-to-video does not support aspectRatio. ' +
          'The output dimensions are determined by the input image.',
      });
    }

    this.addPassthroughOptions(body, klingaiOptions);

    return body;
  }

  private buildMotionControlBody(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
    klingaiOptions: KlingAIVideoModelOptions | undefined,
    warnings: SharedV3Warning[],
  ): Record<string, unknown> {
    if (
      !klingaiOptions?.videoUrl ||
      !klingaiOptions?.characterOrientation ||
      !klingaiOptions?.mode
    ) {
      throw new AISDKError({
        name: 'KLINGAI_VIDEO_MISSING_OPTIONS',
        message:
          'KlingAI Motion Control requires providerOptions.klingai with videoUrl, characterOrientation, and mode.',
      });
    }

    const body: Record<string, unknown> = {
      video_url: klingaiOptions.videoUrl,
      character_orientation: klingaiOptions.characterOrientation,
      mode: klingaiOptions.mode,
    };

    if (options.prompt != null) {
      body.prompt = options.prompt;
    }

    // Map standard SDK image option to KlingAI's image_url
    if (options.image != null) {
      if (options.image.type === 'url') {
        body.image_url = options.image.url;
      } else {
        body.image_url =
          typeof options.image.data === 'string'
            ? options.image.data
            : convertUint8ArrayToBase64(options.image.data);
      }
    }

    if (klingaiOptions.keepOriginalSound != null) {
      body.keep_original_sound = klingaiOptions.keepOriginalSound;
    }

    if (klingaiOptions.watermarkEnabled != null) {
      body.watermark_info = { enabled: klingaiOptions.watermarkEnabled };
    }

    // Warn about unsupported standard options for motion control
    if (options.aspectRatio) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'KlingAI Motion Control does not support aspectRatio. ' +
          'The output dimensions are determined by the reference image/video.',
      });
    }

    if (options.duration) {
      warnings.push({
        type: 'unsupported',
        feature: 'duration',
        details:
          'KlingAI Motion Control does not support custom duration. ' +
          'The output duration matches the reference video duration.',
      });
    }

    this.addPassthroughOptions(body, klingaiOptions);

    return body;
  }

  private addPassthroughOptions(
    body: Record<string, unknown>,
    klingaiOptions: KlingAIVideoModelOptions | undefined,
  ): void {
    if (!klingaiOptions) return;
    for (const [key, value] of Object.entries(klingaiOptions)) {
      if (!HANDLED_PROVIDER_OPTIONS.has(key)) {
        body[key] = value;
      }
    }
  }
}

// Response schema for task creation (POST)
const klingaiCreateTaskSchema = z.object({
  code: z.number(),
  message: z.string(),
  request_id: z.string().nullish(),
  data: z
    .object({
      task_id: z.string(),
      task_status: z.string().nullish(),
      task_info: z
        .object({
          external_task_id: z.string().nullish(),
        })
        .nullish(),
      created_at: z.number().nullish(),
      updated_at: z.number().nullish(),
    })
    .nullish(),
});

// Response schema for task status query (GET)
const klingaiTaskStatusSchema = z.object({
  code: z.number(),
  message: z.string(),
  request_id: z.string().nullish(),
  data: z
    .object({
      task_id: z.string(),
      task_status: z.string(),
      task_status_msg: z.string().nullish(),
      task_info: z
        .object({
          external_task_id: z.string().nullish(),
        })
        .nullish(),
      watermark_info: z
        .object({
          enabled: z.boolean().nullish(),
        })
        .nullish(),
      final_unit_deduction: z.string().nullish(),
      created_at: z.number().nullish(),
      updated_at: z.number().nullish(),
      task_result: z
        .object({
          videos: z
            .array(
              z.object({
                id: z.string().nullish(),
                url: z.string().nullish(),
                watermark_url: z.string().nullish(),
                duration: z.string().nullish(),
              }),
            )
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

type KlingAITaskResponse = z.infer<typeof klingaiTaskStatusSchema>;
