import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import type { DoubaoSeedreamResponse } from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

export class DoubaoSeedreamHandler extends BaseModelHandler {
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

    // Handle batch generation for doubao-seedream-4-0-250828
    if (this.modelId === 'doubao-seedream-4-0-250828') {
      if (n != null && n > 15) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'n',
          details:
            'Doubao Seedream 4.0 supports maximum 15 images per generation',
        });
      }
    } else {
      if (n != null && n > 1) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'n',
          details: 'Doubao Seedream 3.0 does not support batch generation',
        });
      }
    }

    if (aspectRatio != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details: 'Doubao Seedream uses size parameter instead of aspectRatio',
      });
    }

    // Handle size parameter for different models
    let sizeStr = this.handleSizeParameter(size, warnings);

    // Build request body based on model version
    const requestBody: any = {
      model: this.modelId,
      prompt,
      response_format: 'url',
      size: sizeStr,
      seed,
      watermark: providerOptions.ai302?.watermark || false,
      ...(providerOptions.ai302 ?? {}),
    };

    // Add model-specific parameters for doubao-seedream-4-0-250828
    if (this.modelId === 'doubao-seedream-4-0-250828') {
      // Support for reference images
      if (providerOptions.ai302?.image) {
        requestBody.image = providerOptions.ai302.image;
      }

      // Support for sequential image generation
      if (n != null && n > 1) {
        requestBody.sequential_image_generation = 'auto';
        requestBody.sequential_image_generation_options = {
          max_images: Math.min(n, 15),
        };
      } else if (providerOptions.ai302?.sequential_image_generation) {
        requestBody.sequential_image_generation =
          providerOptions.ai302.sequential_image_generation;
        if (providerOptions.ai302?.sequential_image_generation_options) {
          requestBody.sequential_image_generation_options =
            providerOptions.ai302.sequential_image_generation_options;
        }
      }

      // Support for streaming
      if (providerOptions.ai302?.stream) {
        requestBody.stream = providerOptions.ai302.stream;
      }
    } else {
      // For doubao-seedream-3-0-t2i-250415, add guidance_scale if provided
      if (providerOptions.ai302?.guidance_scale) {
        requestBody.guidance_scale = providerOptions.ai302.guidance_scale;
      }
    }

    const { value: response, responseHeaders } =
      await postJsonToApi<DoubaoSeedreamResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: '/doubao/images/generations',
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: requestBody,
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    const urls = response.data
      .map(item => item.url)
      .filter(Boolean) as string[];
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

  private handleSizeParameter(
    size: string | undefined,
    warnings: ImageModelV2CallWarning[],
  ): string {
    if (!size) {
      return '1024x1024';
    }

    // For doubao-seedream-4-0-250828, support 1K, 2K, 4K format and specific dimensions
    if (this.modelId === 'doubao-seedream-4-0-250828') {
      // Check if it's a quality level (1K, 2K, 4K)
      const qualityLevels = ['1K', '2K', '4K', '1k', '2k', '4k'];
      if (qualityLevels.includes(size)) {
        return size.toUpperCase();
      }

      // Parse specific dimensions
      const parsedSize = this.parseSize(size);
      if (parsedSize) {
        const { width, height } = parsedSize;

        // Define supported resolutions for doubao-seedream-4-0-250828
        const supportedSizes = [
          // 1K
          '1024x1024',
          '1152x864',
          '864x1152',
          '1280x720',
          '720x1280',
          '1248x832',
          '832x1248',
          '1512x648',
          // 2K
          '2048x2048',
          '2304x1728',
          '1728x2304',
          '2560x1440',
          '1440x2560',
          '2496x1664',
          '1664x2496',
          '3024x1296',
          // 4K
          '4096x4096',
          '4736x3552',
          '3552x4736',
          '5472x2072',
          '2072x5472',
          '5024x3360',
          '3360x5024',
          '6272x2688',
        ];

        const sizeStr = `${width}x${height}`;
        if (supportedSizes.includes(sizeStr)) {
          return sizeStr;
        } else {
          warnings.push({
            type: 'other',
            message: `Size ${sizeStr} is not supported for doubao-seedream-4-0-250828. Using default 1024x1024.`,
          });
          return '1024x1024';
        }
      }
    } else {
      // For doubao-seedream-3-0-t2i-250415, validate size is within [512x512, 2048x2048]
      const parsedSize = this.parseSize(size);
      if (parsedSize) {
        const { width, height } = parsedSize;
        if (width < 512 || height < 512 || width > 2048 || height > 2048) {
          warnings.push({
            type: 'other',
            message: `Size ${width}x${height} is outside allowed range [512x512, 2048x2048]. Using default 1024x1024.`,
          });
          return '1024x1024';
        }
        return `${width}x${height}`;
      }
    }

    warnings.push({
      type: 'other',
      message: `Invalid size format: ${size}. Using default 1024x1024.`,
    });
    return '1024x1024';
  }
}
