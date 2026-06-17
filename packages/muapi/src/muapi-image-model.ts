import type { ImageModelV4, SharedV4Warning } from '@ai-sdk/provider';
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

export type MuApiImageModelId =
  // Flux
  | 'flux-dev'
  | 'flux-schnell'
  | 'flux-krea'
  | 'flux-kontext-dev'
  | 'flux-kontext-pro'
  | 'flux-kontext-max'
  | 'flux-2-dev'
  | 'flux-2-pro'
  // HiDream
  | 'hidream-fast'
  | 'hidream-dev'
  | 'hidream-full'
  // Wan
  | 'wan2.1'
  | 'wan2.5'
  | 'wan2.6'
  // GPT
  | 'gpt4o'
  | 'gpt-image'
  | 'gpt-image-2'
  // Google
  | 'imagen4'
  | 'imagen4-fast'
  | 'imagen4-ultra'
  // Midjourney
  | 'midjourney'
  | 'midjourney-v7'
  | 'midjourney-v8'
  // Seedream
  | 'seedream'
  | 'seedream-v3'
  | 'seedream-v4'
  | 'seedream-5'
  // Qwen
  | 'qwen'
  | 'qwen-2'
  | 'qwen-2-pro'
  // Others
  | 'hunyuan'
  | 'ideogram'
  | 'reve'
  | 'sdxl'
  | 'grok'
  | 'kling-o1'
  | 'kling-o3'
  // Image-to-image
  | 'flux-kontext-dev-i2i'
  | 'flux-kontext-pro-i2i'
  | 'flux-kontext-max-i2i'
  | 'gpt4o-edit'
  | 'seededit'
  | 'seedream-edit'
  | 'midjourney-style'
  | 'qwen-edit'
  | 'reve-edit'
  | (string & {});

// Map model IDs to MuAPI endpoint slugs
const MODEL_ENDPOINTS: Record<string, string> = {
  'flux-dev': 'flux-dev-image',
  'flux-schnell': 'flux-schnell-image',
  'flux-krea': 'flux-krea-dev',
  'flux-kontext-dev': 'flux-kontext-dev-t2i',
  'flux-kontext-pro': 'flux-kontext-pro-t2i',
  'flux-kontext-max': 'flux-kontext-max-t2i',
  'flux-2-dev': 'flux-2-dev',
  'flux-2-pro': 'flux-2-pro',
  'hidream-fast': 'hidream_i1_fast_image',
  'hidream-dev': 'hidream_i1_dev_image',
  'hidream-full': 'hidream_i1_full_image',
  'wan2.1': 'wan2.1-text-to-image',
  'wan2.5': 'wan2.5-text-to-image',
  'wan2.6': 'wan2.6-text-to-image',
  'gpt4o': 'gpt4o-text-to-image',
  'gpt-image': 'gpt-image-1.5',
  'gpt-image-2': 'gpt-image-2-text-to-image',
  'imagen4': 'google-imagen4',
  'imagen4-fast': 'google-imagen4-fast',
  'imagen4-ultra': 'google-imagen4-ultra',
  'midjourney': 'midjourney-v7-text-to-image',
  'midjourney-v7': 'midjourney-v7',
  'midjourney-v8': 'midjourney-v8',
  'seedream': 'bytedance-seedream-v4.5',
  'seedream-v3': 'bytedance-seedream-image',
  'seedream-v4': 'bytedance-seedream-v4',
  'seedream-5': 'seedream-5.0',
  'qwen': 'qwen-image',
  'qwen-2': 'qwen-image-2.0',
  'qwen-2-pro': 'qwen-image-2.0-pro',
  'hunyuan': 'hunyuan-image-2.1',
  'ideogram': 'ideogram-v3-t2i',
  'reve': 'reve-text-to-image',
  'sdxl': 'sdxl-image',
  'grok': 'grok-imagine-text-to-image',
  'kling-o1': 'kling-o1-text-to-image',
  'kling-o3': 'kling-o3-image',
  // Image-to-image
  'flux-kontext-dev-i2i': 'flux-kontext-dev-i2i',
  'flux-kontext-pro-i2i': 'flux-kontext-pro-i2i',
  'flux-kontext-max-i2i': 'flux-kontext-max-i2i',
  'gpt4o-edit': 'gpt4o-edit',
  'seededit': 'bytedance-seededit-image',
  'seedream-edit': 'bytedance-seedream-edit-v4',
  'midjourney-style': 'midjourney-v7-style-reference',
  'qwen-edit': 'qwen-image-edit',
  'reve-edit': 'reve-image-edit',
};

const submitResponseSchema = z.object({
  request_id: z.string(),
});

const pollResponseSchema = z.object({
  status: z.string(),
  outputs: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export interface MuApiImageModelConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class MuApiImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxImagesPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: MuApiImageModelId,
    private readonly config: MuApiImageModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<ImageModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<ImageModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];

    const endpoint = MODEL_ENDPOINTS[this.modelId] ?? this.modelId;

    const body: Record<string, unknown> = {
      prompt: options.prompt,
      n: options.n ?? 1,
    };

    if (options.size) {
      const [width, height] = options.size.split('x').map(Number);
      if (width) body.width = width;
      if (height) body.height = height;
    }

    if (options.aspectRatio) {
      body.aspect_ratio = options.aspectRatio;
    }

    if (options.seed != null) {
      body.seed = options.seed;
    }

    // Pass provider-specific options
    if (options.providerOptions?.muapi) {
      Object.assign(body, options.providerOptions.muapi);
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

    // Poll for result
    const requestId = submitResult.request_id;
    const pollUrl = `${this.config.baseURL}/predictions/${requestId}/result`;

    while (true) {
      await delay(2000);

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
          images: pollResult.outputs.map(url => ({ type: 'url' as const, url })),
          warnings,
          response: {
            timestamp: currentDate,
            modelId: this.modelId,
            headers: {},
          },
        };
      }

      if (pollResult.status === 'failed') {
        throw new Error(pollResult.error ?? 'Image generation failed');
      }
    }
  }
}
