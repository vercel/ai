import type {
  ImageModelV2,
  ImageModelV2CallWarning,
  ImageModelV2CallOptions,
} from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  FetchFunction,
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
  getFromApi,
  createStatusCodeErrorResponseHandler,
  createBinaryResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  ModelsLabImageModelId,
  ModelsLabImageSize,
} from './modelslab-image-settings';
import { modelsLabFailedResponseHandler } from './modelslab-error';
import type {
  ModelsLabTextToImageRequest,
  ModelsLabTextToImageResponse,
} from './modelslab-api-types';

interface ModelsLabImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

const modelsLabImageResponseSchema = z.object({
  status: z.enum(['success', 'processing', 'error']),
  generationTime: z.number().optional(),
  id: z.number().optional(),
  output: z.array(z.string()).optional(),
  proxy_links: z.array(z.string()).optional(),
  future_links: z.array(z.string()).optional(),
  meta: z
    .object({
      base64: z.string(),
      enhance_prompt: z.string(),
      file_prefix: z.string(),
      guidance_scale: z.number(),
      height: z.number(),
      instant_response: z.string(),
      n_samples: z.number(),
      negative_prompt: z.string(),
      outdir: z.string(),
      prompt: z.string(),
      safety_checker: z.string(),
      safety_checker_type: z.string(),
      seed: z.number(),
      temp: z.string(),
      width: z.number(),
    })
    .optional(),
  message: z.string().optional(),
});

export class ModelsLabImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';
  readonly maxImagesPerCall = 4;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ModelsLabImageModelId,
    private readonly config: ModelsLabImageModelConfig,
  ) {}

  async doGenerate(
    options: ImageModelV2CallOptions,
  ): Promise<Awaited<ReturnType<ImageModelV2['doGenerate']>>> {
    const { prompt, n, size, seed, providerOptions, headers, abortSignal } =
      options;
    const warnings: Array<ImageModelV2CallWarning> = [];

    let imageSize: ModelsLabImageSize | undefined;
    if (size) {
      const [width, height] = size.split('x').map(Number);
      imageSize = { width, height };
    } else {
      // Default to 512x512 if no size specified
      imageSize = { width: 512, height: 512 };
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const requestBody: ModelsLabTextToImageRequest = {
      key: '', // This will be replaced by API key from headers
      prompt,
      width: imageSize.width.toString(),
      height: imageSize.height.toString(),
      samples: Math.min(n ?? 1, 4), // Limit to max 4 as per API
      seed: seed ?? null,
      safety_checker: true,
      base64: false,
      instant_response: false,
      ...(providerOptions.modelslab ?? {}),
    };

    // Extract API key from headers and add to request body
    const resolvedHeaders = await resolve(this.config.headers);
    const apiKey =
      resolvedHeaders?.['Authorization']?.replace('Bearer ', '') || '';
    requestBody.key = apiKey;

    console.log('ModelsLab API Request:', JSON.stringify(requestBody, null, 2));

    const { value, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/api/v6/realtime/text2img`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: requestBody,
      failedResponseHandler: modelsLabFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        modelsLabImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    console.log('ModelsLab API Response:', JSON.stringify(value, null, 2));

    // Handle different response statuses
    if (value.status === 'error') {
      throw new Error(value.message || 'Unknown error from ModelsLab API');
    }

    let imageUrls: string[] = [];

    if (value.status === 'success' && value.output) {
      imageUrls = value.output;
    } else if (value.status === 'processing' && value.future_links) {
      // If processing, return the future_links as specified
      imageUrls = value.future_links;
    } else {
      throw new Error('No image URLs returned from ModelsLab API');
    }

    // Download the images:
    const downloadedImages = await Promise.all(
      imageUrls.map(url => this.downloadImage(url, abortSignal)),
    );

    return {
      images: downloadedImages,
      warnings,
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
      providerMetadata: {
        modelslab: {
          status: value.status,
          generationTime: value.generationTime,
          id: value.id,
          meta: value.meta,
        },
      },
    };
  }

  private async downloadImage(
    url: string,
    abortSignal: AbortSignal | undefined,
  ): Promise<Uint8Array> {
    const { value: response } = await getFromApi({
      url,
      abortSignal,
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      successfulResponseHandler: createBinaryResponseHandler(),
      fetch: this.config.fetch,
    });

    return response;
  }
}
