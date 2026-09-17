import {
  AISDKError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  convertUint8ArrayToBase64,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  alibabaVideoModelOptionsSchema,
  type AlibabaVideoModelOptions,
} from './alibaba-video-model-options';
import type { AlibabaVideoModelId } from './alibaba-video-settings';

interface AlibabaVideoModelConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

// DashScope native API error format (different from OpenAI-compatible endpoint)
const alibabaVideoErrorSchema = z.object({
  code: z.string().nullish(),
  message: z.string(),
  request_id: z.string().nullish(),
});

const alibabaVideoFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: alibabaVideoErrorSchema,
  errorToMessage: data => data.message,
});

const alibabaVideoCreateTaskSchema = z.object({
  output: z
    .object({
      task_status: z.string(),
      task_id: z.string(),
    })
    .nullish(),
  request_id: z.string().nullish(),
});

const alibabaVideoTaskStatusSchema = z.object({
  output: z
    .object({
      task_id: z.string(),
      task_status: z.string(),
      video_url: z.string().nullish(),
      submit_time: z.string().nullish(),
      scheduled_time: z.string().nullish(),
      end_time: z.string().nullish(),
      orig_prompt: z.string().nullish(),
      actual_prompt: z.string().nullish(),
      code: z.string().nullish(),
      message: z.string().nullish(),
    })
    .nullish(),
  usage: z
    .object({
      duration: z.number().nullish(),
      output_video_duration: z.number().nullish(),
      // wan3 splits the total: input video counts toward its 30s ceiling.
      input_video_duration: z.number().nullish(),
      fps: z.number().nullish(),
      SR: z.number().nullish(),
      size: z.string().nullish(),
      ratio: z.string().nullish(),
    })
    .nullish(),
  request_id: z.string().nullish(),
});

type AlibabaVideoTaskStatusResponse = z.infer<
  typeof alibabaVideoTaskStatusSchema
>;

// Only meaningful for ids that name their mode (wan2.6/wan2.7). wan3 ships a
// single all-in-one id, so its mode comes from the media the request carries.
function detectMode(modelId: string): 't2v' | 'i2v' | 'r2v' {
  if (modelId.includes('-i2v')) return 'i2v';
  if (modelId.includes('-r2v')) return 'r2v';
  return 't2v';
}

/**
 * Request protocol, selected by model id:
 * - `legacy` (wan2.6 and earlier): `parameters.size`, `input.img_url`, and
 *   `input.reference_urls`.
 * - `wan27`: resolution tiers and `ratio` instead of `size`, `input.media`
 *   instead of `input.reference_urls`, no `shot_type`, audio always on.
 * - `wan3`: like `wan27`, plus a real `last_frame` slot, an `audio` toggle,
 *   a 480P tier, and one id covering every mode.
 */
type AlibabaVideoProtocol = 'legacy' | 'wan27' | 'wan3';

function detectProtocol(modelId: string): AlibabaVideoProtocol {
  if (modelId.startsWith('wan3')) return 'wan3';
  if (modelId.startsWith('wan2.7')) return 'wan27';
  return 'legacy';
}

// Maps SDK "WIDTHxHEIGHT" resolutions to Alibaba resolution tiers.
const resolutionTierMap: Record<string, string> = {
  '1280x720': '720P',
  '720x1280': '720P',
  '960x960': '720P',
  '1088x832': '720P',
  '832x1088': '720P',
  '1920x1080': '1080P',
  '1080x1920': '1080P',
  '1440x1440': '1080P',
  '1632x1248': '1080P',
  '1248x1632': '1080P',
  '832x480': '480P',
  '480x832': '480P',
  '624x624': '480P',
};

const supportedRatios = new Set(['16:9', '9:16', '1:1', '4:3', '3:4']);

function deriveRatioFromResolution(
  resolution: `${number}x${number}`,
): string | undefined {
  const [width, height] = resolution.split('x').map(Number);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  let a = width;
  let b = height;
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  const ratio = `${width / a}:${height / a}`;
  return supportedRatios.has(ratio) ? ratio : undefined;
}

function fileToImageString(file: VideoModelV4File): string {
  if (file.type === 'url') {
    return file.url;
  }
  return typeof file.data === 'string'
    ? file.data
    : convertUint8ArrayToBase64(file.data);
}

function getFirstFrameImage(
  options: VideoModelV4CallOptions,
): VideoModelV4File | undefined {
  return options.frameImages?.find(frame => frame.frameType === 'first_frame')
    ?.image;
}

function getLastFrameImage(
  options: VideoModelV4CallOptions,
): VideoModelV4File | undefined {
  return options.frameImages?.find(frame => frame.frameType === 'last_frame')
    ?.image;
}

function resolveStartImage(
  options: VideoModelV4CallOptions,
): VideoModelV4File | undefined {
  return getFirstFrameImage(options) ?? options.image;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov)([?#]|$)/i.test(url);
}

// Builds the input.media array (wan2.7 and wan3) from inputReferences plus the
// frame images the caller resolved for this protocol.
function resolveMedia(
  options: VideoModelV4CallOptions,
  alibabaOptions: AlibabaVideoModelOptions | undefined,
  warnings: SharedV4Warning[],
  frames: { first?: VideoModelV4File; last?: VideoModelV4File },
): Array<Record<string, unknown>> | undefined {
  if (alibabaOptions?.media != null && alibabaOptions.media.length > 0) {
    return alibabaOptions.media.map(item => ({
      type: item.type,
      url: item.url,
      ...(item.referenceVoice != null
        ? { reference_voice: item.referenceVoice }
        : {}),
    }));
  }

  const media: Array<Record<string, unknown>> = [];

  for (const reference of options.inputReferences ?? []) {
    if (reference.type === 'url') {
      media.push({
        type: isVideoUrl(reference.url) ? 'reference_video' : 'reference_image',
        url: reference.url,
      });
    } else if (reference.mediaType.startsWith('image/')) {
      media.push({
        type: 'reference_image',
        url: convertImageModelFileToDataUri(reference),
      });
    } else {
      warnings.push({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'Alibaba reference-to-video requires URL references for videos. ' +
          'Non-URL video reference was skipped.',
      });
    }
  }

  if (frames.first != null) {
    media.push({
      type: 'first_frame',
      url: convertImageModelFileToDataUri(frames.first),
    });
  }

  if (frames.last != null) {
    media.push({
      type: 'last_frame',
      url: convertImageModelFileToDataUri(frames.last),
    });
  }

  return media.length > 0 ? media : undefined;
}

function resolveReferenceUrls(
  options: VideoModelV4CallOptions,
  alibabaOptions: AlibabaVideoModelOptions | undefined,
  warnings: SharedV4Warning[],
): string[] | undefined {
  if (options.frameImages != null && options.frameImages.length > 0) {
    return undefined;
  }

  if (options.inputReferences != null && options.inputReferences.length > 0) {
    const urls: string[] = [];

    for (const reference of options.inputReferences) {
      if (reference.type === 'url') {
        urls.push(reference.url);
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'inputReferences',
          details:
            'Alibaba reference-to-video requires URL references. ' +
            'Non-URL reference was skipped.',
        });
      }
    }

    return urls.length > 0 ? urls : undefined;
  }

  return alibabaOptions?.referenceUrls ?? undefined;
}

export class AlibabaVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: AlibabaVideoModelId,
    private readonly config: AlibabaVideoModelConfig,
  ) {}

  private async buildRequest(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
  ): Promise<{
    input: Record<string, unknown>;
    parameters: Record<string, unknown>;
    warnings: SharedV4Warning[];
    alibabaOptions: AlibabaVideoModelOptions | undefined;
  }> {
    const warnings: SharedV4Warning[] = [];
    const mode = detectMode(this.modelId);

    const alibabaOptions = (await parseProviderOptions({
      provider: 'alibaba',
      providerOptions: options.providerOptions,
      schema: alibabaVideoModelOptionsSchema,
    })) as AlibabaVideoModelOptions | undefined;

    // Build input object
    const input: Record<string, unknown> = {};

    if (options.prompt != null) {
      input.prompt = options.prompt;
    }

    if (alibabaOptions?.negativePrompt != null) {
      input.negative_prompt = alibabaOptions.negativePrompt;
    }

    if (alibabaOptions?.audioUrl != null) {
      input.audio_url = alibabaOptions.audioUrl;
    }

    const startImage = resolveStartImage(options);
    const protocol = detectProtocol(this.modelId);
    const wan27 = protocol === 'wan27';
    const wan3 = protocol === 'wan3';
    // Resolution tiers and input.media replaced size/img_url from wan2.7 on.
    const tieredProtocol = wan27 || wan3;
    // wan2.7 T2V and R2V take an explicit aspect ratio (I2V follows the input
    // image); wan3 serves every mode from one id, so it always takes one.
    const supportsRatio = wan3 || (wan27 && mode !== 'i2v');

    // Handle image input for I2V mode (wan3 carries frames in input.media)
    if (!wan3 && mode === 'i2v' && startImage != null) {
      input.img_url = fileToImageString(startImage);
    }

    if (wan3) {
      // The media the request carries decides whether this is text-, image-,
      // or reference-to-video, so there is no mode to read off the id. A bare
      // prompt stays text-to-video.
      const media = resolveMedia(options, alibabaOptions, warnings, {
        first: startImage,
        last: getLastFrameImage(options),
      });
      if (media != null) {
        input.media = media;
      }
    } else if (mode === 'r2v') {
      if (wan27) {
        // wan2.7: input.media
        const media = resolveMedia(options, alibabaOptions, warnings, {
          first: getFirstFrameImage(options),
        });
        if (media != null) {
          input.media = media;
        }
      } else {
        // wan2.6: legacy protocol with input.reference_urls
        const referenceUrls = resolveReferenceUrls(
          options,
          alibabaOptions,
          warnings,
        );
        if (referenceUrls != null && referenceUrls.length > 0) {
          input.reference_urls = referenceUrls;
        }
      }
    }

    const lastFrame = getLastFrameImage(options);

    // wan3 has a real closing-frame slot, filled in input.media above.
    if (lastFrame != null && !wan3) {
      warnings.push({
        type: 'unsupported',
        feature: 'frameImages',
        details:
          'This model does not support last_frame. ' +
          'The last frame image was ignored.',
      });
    }

    if (
      options.inputReferences != null &&
      options.inputReferences.length > 0 &&
      mode !== 'r2v' &&
      !wan3
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'Alibaba only supports inputReferences (reference-to-video) on ' +
          'reference-to-video models. The reference images were ignored.',
      });
    }

    // Build parameters object
    const parameters: Record<string, unknown> = {};

    if (options.duration != null) {
      parameters.duration = options.duration;
    }

    if (options.seed != null) {
      parameters.seed = options.seed;
    }

    // Resolution / Size mapping
    if (options.resolution != null) {
      if (mode === 'i2v' || tieredProtocol) {
        // I2V, wan2.7, and wan3 use the "720P" / "1080P" tier format
        const resolutionTier =
          resolutionTierMap[options.resolution] || options.resolution;
        // wan3 adds a 480P tier to wan2.7's two.
        const supportedTiers = wan3
          ? ['480P', '720P', '1080P']
          : ['720P', '1080P'];
        if (tieredProtocol && !supportedTiers.includes(resolutionTier)) {
          warnings.push({
            type: 'unsupported',
            feature: 'resolution',
            details:
              `${wan3 ? 'wan3' : 'wan2.7'} models only support the ` +
              `${supportedTiers.join(', ')} resolution tiers. ` +
              `The resolution "${options.resolution}" was ignored.`,
          });
        } else {
          parameters.resolution = resolutionTier;
        }
      } else {
        // wan2.6 T2V and R2V use "WIDTH*HEIGHT" format for the size parameter
        // Convert "WIDTHxHEIGHT" (SDK standard) to "WIDTH*HEIGHT" (Alibaba API)
        parameters.size = options.resolution.replace('x', '*');
      }
    }

    // wan2.7 T2V and R2V support an explicit aspect ratio parameter
    if (supportsRatio) {
      const ratio =
        alibabaOptions?.ratio ??
        options.aspectRatio ??
        (options.resolution != null
          ? deriveRatioFromResolution(options.resolution)
          : undefined);
      if (ratio != null) {
        parameters.ratio = ratio;
      }
    }

    // Provider-specific parameters
    if (alibabaOptions?.promptExtend != null) {
      parameters.prompt_extend = alibabaOptions.promptExtend;
    }
    if (alibabaOptions?.shotType != null) {
      if (tieredProtocol) {
        // wan2.7 removed shot_type; shot structure is described in the prompt
        warnings.push({
          type: 'unsupported',
          feature: 'shotType',
          details:
            `${wan3 ? 'wan3' : 'wan2.7'} models do not support the shotType ` +
            'option. Describe the shot structure in the prompt instead.',
        });
      } else {
        parameters.shot_type = alibabaOptions.shotType;
      }
    }
    if (alibabaOptions?.watermark != null) {
      parameters.watermark = alibabaOptions.watermark;
    }
    const audio = options.generateAudio ?? alibabaOptions?.audio;
    if (audio != null) {
      if (wan27) {
        // wan2.7 does not have an audio parameter (audio is always generated)
        warnings.push({
          type: 'unsupported',
          feature: 'generateAudio',
          details:
            'wan2.7 models always generate audio. ' +
            'The audio option was ignored.',
        });
      } else {
        parameters.audio = audio;
      }
    }

    // Warn about unsupported standard options
    if (options.aspectRatio && !supportsRatio) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'Alibaba video models use explicit size/resolution dimensions. Use the resolution option or providerOptions.alibaba for size control.',
      });
    }
    if (options.fps) {
      warnings.push({
        type: 'unsupported',
        feature: 'fps',
        details: 'Alibaba video models do not support custom FPS.',
      });
    }
    if (options.n != null && options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'Alibaba video models only support generating 1 video per call.',
      });
    }

    return { input, parameters, warnings, alibabaOptions };
  }

  private buildCompletedResult(
    statusResponse: AlibabaVideoTaskStatusResponse,
    responseHeaders: Record<string, string> | undefined,
    warnings: SharedV4Warning[],
    currentDate: Date,
  ): {
    status: 'completed';
    videos: Array<{ type: 'url'; url: string; mediaType: string }>;
    warnings: SharedV4Warning[];
    providerMetadata: SharedV4ProviderMetadata;
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  } {
    const taskId = statusResponse.output?.task_id;
    const videoUrl = statusResponse.output?.video_url;

    if (!videoUrl) {
      throw new AISDKError({
        name: 'ALIBABA_VIDEO_GENERATION_ERROR',
        message: `No video URL in response. Task ID: ${taskId}`,
      });
    }

    return {
      status: 'completed',
      videos: [
        {
          type: 'url',
          url: videoUrl,
          mediaType: 'video/mp4',
        },
      ],
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        alibaba: {
          taskId,
          videoUrl,
          ...(statusResponse.output?.actual_prompt
            ? { actualPrompt: statusResponse.output.actual_prompt }
            : {}),
          ...(statusResponse.usage
            ? {
                usage: {
                  duration: statusResponse.usage.duration,
                  outputVideoDuration:
                    statusResponse.usage.output_video_duration,
                  resolution: statusResponse.usage.SR,
                  size: statusResponse.usage.size,
                  // wan3-only. Spread rather than set to undefined so the
                  // metadata shape for older wan models is unchanged.
                  ...(statusResponse.usage.input_video_duration != null
                    ? {
                        inputVideoDuration:
                          statusResponse.usage.input_video_duration,
                      }
                    : {}),
                  ...(statusResponse.usage.fps != null
                    ? { fps: statusResponse.usage.fps }
                    : {}),
                  ...(statusResponse.usage.ratio != null
                    ? { ratio: statusResponse.usage.ratio }
                    : {}),
                },
              }
            : {}),
        },
      },
    };
  }

  async doStart(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
  ): Promise<VideoModelV4OperationStartResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { input, parameters, warnings } = await this.buildRequest(options);

    const { value: createResponse, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/api/v1/services/aigc/video-generation/video-synthesis`,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
        {
          'X-DashScope-Async': 'enable',
        },
      ),
      body: {
        model: this.modelId,
        input,
        parameters,
      },
      successfulResponseHandler: createJsonResponseHandler(
        alibabaVideoCreateTaskSchema,
      ),
      failedResponseHandler: alibabaVideoFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const taskId = createResponse.output?.task_id;
    if (!taskId) {
      throw new AISDKError({
        name: 'ALIBABA_VIDEO_GENERATION_ERROR',
        message: `No task_id returned from Alibaba API. Response: ${JSON.stringify(createResponse)}`,
      });
    }

    return {
      operation: { taskId },
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  async doStatus(
    options: Parameters<NonNullable<VideoModelV4['doStatus']>>[0],
  ): Promise<VideoModelV4OperationStatusResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { taskId } = options.operation as { taskId: string };

    const { value: statusResponse, responseHeaders } = await getFromApi({
      url: `${this.config.baseURL}/api/v1/tasks/${taskId}`,
      validateUrl: false,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      successfulResponseHandler: createJsonResponseHandler(
        alibabaVideoTaskStatusSchema,
      ),
      failedResponseHandler: alibabaVideoFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const taskStatus = statusResponse.output?.task_status;

    if (taskStatus === 'SUCCEEDED') {
      return this.buildCompletedResult(
        statusResponse,
        responseHeaders,
        [],
        currentDate,
      );
    }

    if (taskStatus === 'FAILED' || taskStatus === 'CANCELED') {
      return {
        status: 'error' as const,
        error:
          `Video generation ${taskStatus.toLowerCase()}. Task ID: ${taskId}. ${statusResponse.output?.message ?? ''}`.trim(),
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    return {
      status: 'pending',
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}
