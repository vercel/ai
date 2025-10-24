import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import { BaseModelHandler } from './base-model';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { ImageSize } from '../ai302-types';

// Define the types based on the provided API documentation
export interface LuminaImageRequest {
  guidance_scale?: number;
  image_size?: ImageSize;
  negative_prompt?: string;
  num_inference_steps?: number;
  output_format?: string;
  prompt: string;
  seed?: number;
  [property: string]: any;
}

interface LuminaImageResponse {
  images: {
    url: string;
    content_type: string;
    file_size: number;
    width: number;
    height: number;
  }[];
  seed: number;
  has_nsfw_concepts: boolean[];
  debug_latents: unknown | null;
  debug_per_pass_latents: unknown | null;
}

export class LuminaImageHandler extends BaseModelHandler {
  protected async processRequest({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: ImageModelV2CallOptions) {
    const warnings: ImageModelV2CallWarning[] = [];

    if (n != null && n > 1) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'n',
        details: 'Lumina Image does not support batch generation',
      });
    }

    let parsedSize = this.parseSize(size);
    if (!parsedSize && aspectRatio) {
      parsedSize = this.aspectRatioToSize(aspectRatio, 1024, warnings);
    }

    // Validate dimensions are multiples of 32
    if (parsedSize) {
      parsedSize = this.validateDimensionsMultipleOf32(parsedSize, warnings);
    }

    const requestBody: LuminaImageRequest = {
      prompt,
      image_size: parsedSize,
      seed,
      ...(providerOptions.ai302 ?? {}), // Allow overriding defaults
    };

    const { value: response, responseHeaders } =
      await postJsonToApi<LuminaImageResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: '/302/submit/lumina-image-v2',
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: requestBody,
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    const urls = response.images.map(img => img.url);
    const images = await this.downloadImages(urls);

    return {
      images,
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}
