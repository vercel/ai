import type { Experimental_VideoModelV4, SharedV4Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  delay,
  getFromApi,
  postJsonToApi,
  resolve,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { muapiFailedResponseHandler } from './muapi-error';

export type MuApiVideoModelId =
  // Veo
  | 'veo3'
  | 'veo3-fast'
  | 'veo3.1'
  | 'veo4'
  // Kling
  | 'kling-master'
  | 'kling-v2.5-pro'
  | 'kling-v2.6-pro'
  | 'kling-v3-pro'
  // Wan
  | 'wan2.1'
  | 'wan2.2'
  | 'wan2.5'
  | 'wan2.6'
  | 'wan2.7'
  // Seedance
  | 'seedance-pro'
  | 'seedance-pro-fast'
  // Others
  | 'runway'
  | 'pixverse'
  | 'pixverse-v5'
  | 'pixverse-v6'
  | 'vidu'
  | 'vidu-q2-pro'
  | 'vidu-q3-pro'
  | 'sora'
  | 'sora-2'
  | 'hunyuan'
  // Image-to-video
  | 'kling-std'
  | 'kling-pro'
  | 'kling-v2.5-pro-i2v'
  | 'veo3-i2v'
  | 'veo3.1-i2v'
  | 'veo4-i2v'
  | 'wan2.1-i2v'
  | 'wan2.5-i2v'
  | 'wan2.6-i2v'
  | 'wan2.7-i2v'
  | 'seedance-v2'
  | 'seedance-2'
  | 'runway-i2v'
  | 'pixverse-v4.5'
  | 'pixverse-v5-i2v'
  | 'pixverse-v6-i2v'
  | 'vidu-i2v'
  | 'vidu-q2-pro-i2v'
  | 'midjourney-v7-i2v'
  | 'sora-2-i2v'
  | 'hunyuan-i2v'
  | (string & {});

const T2V_ENDPOINTS: Record<string, string> = {
  'veo3': 'veo3-text-to-video',
  'veo3-fast': 'veo3-fast-text-to-video',
  'veo3.1': 'veo3.1-text-to-video',
  'veo4': 'veo-4-text-to-video',
  'kling-master': 'kling-v2.1-master-t2v',
  'kling-v2.5-pro': 'kling-v2.5-turbo-pro-t2v',
  'kling-v2.6-pro': 'kling-v2.6-pro-t2v',
  'kling-v3-pro': 'kling-v3.0-pro-text-to-video',
  'wan2.1': 'wan2.1-text-to-video',
  'wan2.2': 'wan2.2-text-to-video',
  'wan2.5': 'wan2.5-text-to-video',
  'wan2.6': 'wan2.6-text-to-video',
  'wan2.7': 'wan2.7-text-to-video',
  'seedance-pro': 'seedance-pro-t2v',
  'seedance-pro-fast': 'seedance-pro-t2v-fast',
  'runway': 'runway-text-to-video',
  'pixverse': 'pixverse-v4.5-t2v',
  'pixverse-v5': 'pixverse-v5-t2v',
  'pixverse-v6': 'pixverse-v6-t2v',
  'vidu': 'vidu-v2.0-t2v',
  'vidu-q2-pro': 'vidu-q2-pro-text-to-video',
  'vidu-q3-pro': 'vidu-q3-pro-text-to-video',
  'sora': 'openai-sora',
  'sora-2': 'openai-sora-2-text-to-video',
  'hunyuan': 'hunyuan-text-to-video',
};

const I2V_ENDPOINTS: Record<string, string> = {
  'kling-std': 'kling-v2.1-standard-i2v',
  'kling-pro': 'kling-v2.1-pro-i2v',
  'kling-master': 'kling-v2.1-master-i2v',
  'kling-v2.5-pro': 'kling-v2.5-turbo-pro-i2v',
  'veo3': 'veo3-image-to-video',
  'veo3-i2v': 'veo3-image-to-video',
  'veo3.1': 'veo3.1-image-to-video',
  'veo3.1-i2v': 'veo3.1-image-to-video',
  'veo4': 'veo-4-image-to-video',
  'veo4-i2v': 'veo-4-image-to-video',
  'wan2.1-i2v': 'wan2.1-image-to-video',
  'wan2.5-i2v': 'wan2.5-image-to-video',
  'wan2.6-i2v': 'wan2.6-image-to-video',
  'wan2.7-i2v': 'wan2.7-image-to-video',
  'seedance-pro': 'seedance-pro-i2v',
  'seedance-v2': 'seedance-v2.0-i2v',
  'seedance-2': 'seedance-2-image-to-video',
  'runway-i2v': 'runway-image-to-video',
  'pixverse-v4.5': 'pixverse-v4.5-i2v',
  'pixverse-v5-i2v': 'pixverse-v5-i2v',
  'pixverse-v6-i2v': 'pixverse-v6-i2v',
  'vidu-i2v': 'vidu-v2.0-i2v',
  'vidu-q2-pro-i2v': 'vidu-q2-pro-image-to-video',
  'midjourney-v7-i2v': 'midjourney-v7-image-to-video',
  'sora-2-i2v': 'openai-sora-2-image-to-video',
  'hunyuan-i2v': 'hunyuan-image-to-video',
};

// These models accept images_list instead of image_url
const LIST_INPUT_MODELS = new Set([
  'wan2.1-i2v', 'wan2.5-i2v', 'wan2.6-i2v', 'wan2.7-i2v',
  'seedance-pro', 'seedance-v2', 'seedance-2',
  'vidu-i2v', 'vidu-q2-pro-i2v',
  'pixverse-v4.5', 'pixverse-v5-i2v', 'pixverse-v6-i2v',
  'sora-2-i2v',
]);

const submitResponseSchema = z.object({
  request_id: z.string(),
});

const pollResponseSchema = z.object({
  status: z.string(),
  outputs: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export interface MuApiVideoModelConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  mode?: 'text-to-video' | 'image-to-video';
  _internal?: {
    currentDate?: () => Date;
  };
}

export class MuApiVideoModel implements Experimental_VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: MuApiVideoModelId,
    private readonly config: MuApiVideoModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<Experimental_VideoModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];

    const isI2V = this.config.mode === 'image-to-video' || options.image != null;
    const registry = isI2V ? I2V_ENDPOINTS : T2V_ENDPOINTS;
    const endpoint = registry[this.modelId] ?? T2V_ENDPOINTS[this.modelId] ?? this.modelId;

    const body: Record<string, unknown> = {
      prompt: options.prompt,
      aspect_ratio: options.aspectRatio ?? '16:9',
    };

    if (options.durationSeconds != null) {
      body.duration = options.durationSeconds;
    }

    if (options.seed != null) {
      body.seed = options.seed;
    }

    // Attach image input for image-to-video
    if (isI2V && options.image != null) {
      let imageUrl: string;
      if (options.image.type === 'url') {
        imageUrl = options.image.url;
      } else {
        // base64 data URI
        imageUrl = `data:${options.image.mediaType};base64,${options.image.base64}`;
      }

      if (LIST_INPUT_MODELS.has(this.modelId)) {
        body.images_list = [imageUrl];
      } else {
        body.image_url = imageUrl;
      }
    }

    // Pass provider-specific options
    if (options.providerOptions?.muapi) {
      const { image_url, images_list, ...rest } = options.providerOptions.muapi as Record<string, unknown>;
      Object.assign(body, rest);
      // Allow explicit overrides
      if (image_url) body.image_url = image_url;
      if (images_list) body.images_list = images_list;
    }

    const headers = await resolve(this.config.headers);

    const { value: submitResult } = await postJsonToApi({
      url: `${this.config.baseURL}/${endpoint}`,
      headers: combineHeaders(headers),
      body,
      failedResponseHandler: muapiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(submitResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const requestId = submitResult.request_id;
    const pollUrl = `${this.config.baseURL}/predictions/${requestId}/result`;

    const MAX_POLL_ATTEMPTS = 500; // 500 * 3s = 1500s
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await delay(3000);

      const { value: pollResult } = await getFromApi({
        url: pollUrl,
        headers: combineHeaders(headers),
        failedResponseHandler: muapiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(pollResponseSchema),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      if (pollResult.status === 'completed' && pollResult.outputs) {
        return {
          videos: [{ type: 'url' as const, url: pollResult.outputs[0], mediaType: 'video/mp4' }],
          warnings,
          response: {
            timestamp: currentDate,
            modelId: this.modelId,
            headers: {},
          },
        };
      }

      if (pollResult.status === 'failed') {
        throw new Error(pollResult.error ?? 'Video generation failed');
      }
    }

    throw new Error(
      `MuAPI video generation timed out after ${MAX_POLL_ATTEMPTS * 3}s (request_id=${requestId})`,
    );
  }
}
