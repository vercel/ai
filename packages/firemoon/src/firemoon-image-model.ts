import type { ImageModelV3, SharedV3Warning } from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  FetchFunction,
  combineHeaders,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { firemoonFailedResponseHandler } from './firemoon-error';
import { FiremoonImageModelId } from './firemoon-image-settings';

interface FiremoonImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class FiremoonImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 4;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: FiremoonImageModelId,
    private readonly config: FiremoonImageModelConfig,
  ) { }

  async doGenerate({
    prompt,
    n,
    aspectRatio,
    size,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV3['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV3['doGenerate']>>
  > {
    const warnings: Array<SharedV3Warning> = [];

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    // Determine if this is a video model based on modelId
    const isVideoModel =
      this.modelId.startsWith('kling/') ||
      this.modelId.includes('video') ||
      this.modelId.startsWith('google/veo');

    // Build the request body based on the model type
    const requestBody: any = {
      prompt,
      ...(seed !== undefined && { seed }),
      ...(n !== undefined && !isVideoModel && { num_images: n }),
      ...(providerOptions.firemoon ?? {}),
    };

    // Handle size/aspect ratio for image models
    if (!isVideoModel) {
      if (size) {
        requestBody.image_size = size;
      } else if (aspectRatio) {
        // Map aspect ratios to Firemoon size formats
        const sizeMap: Record<string, string> = {
          '1:1': 'square_hd',
          '3:4': 'portrait_4_3',
          '4:3': 'landscape_4_3',
          '9:16': 'portrait_16_9',
          '16:9': 'landscape_16_9',
        };
        requestBody.image_size = sizeMap[aspectRatio] || 'landscape_4_3';
      }
    } else {
      // For video models, use aspect_ratio parameter
      if (aspectRatio) {
        requestBody.aspect_ratio = aspectRatio;
      }
    }

    const {
      value: response,
      responseHeaders,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/${this.modelId}`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: requestBody,
      successfulResponseHandler: createJsonResponseHandler(
        firemoonResponseSchema,
      ),
      failedResponseHandler: firemoonFailedResponseHandler,
      abortSignal,
      fetch: this.config.fetch,
    });

    // Handle video response
    if ('videos' in response) {
      // For video models, we return empty images for now since AI SDK doesn't support videos yet
      // In a full implementation, you'd need to extend the AI SDK to support video generation
      warnings.push({
        type: 'other',
        message: 'Video generation is not fully supported in this AI SDK version. Only URLs are returned.',
      });

      const images = response.videos.map(() => new Uint8Array());

      return {
        images,
        warnings,
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    // Handle image response - fetch the actual image data
    const images = await Promise.all(
      response.images.map(async (imageData: any) => {
        try {
          const { value: image } = await getFromApi({
            url: imageData.url,
            successfulResponseHandler: createBinaryResponseHandler(),
            failedResponseHandler: firemoonFailedResponseHandler,
            abortSignal,
            fetch: this.config.fetch,
          });
          return image; // This is already a Uint8Array
        } catch (error) {
          // If image fetch fails, return an empty Uint8Array
          warnings.push({
            type: 'other',
            message: `Failed to fetch image from URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
          return new Uint8Array();
        }
      }),
    );

    return {
      images,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

const firemoonResponseSchema = z.union([
  // Image response
  z.object({
    images: z.array(
      z.object({
        url: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
        content_type: z.string().optional(),
      }),
    ),
    seed: z.number().optional(),
    has_nsfw_concepts: z.array(z.boolean()).optional(),
    timings: z
      .object({
        inference: z.number(),
      })
      .optional(),
  }),
  // Video response
  z.object({
    videos: z.array(
      z.object({
        url: z.string(),
        duration: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        content_type: z.string().optional(),
      }),
    ),
    seed: z.number().optional(),
    timings: z
      .object({
        inference: z.number(),
      })
      .optional(),
  }),
]);
