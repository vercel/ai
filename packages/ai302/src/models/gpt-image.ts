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
import type { GPTImageResponse } from '../ai302-types';

// Supported sizes for GPT Image
const SUPPORTED_SIZES = ['1024x1024', '1536x1024', '1024x1536'];

export class GPTImageHandler extends BaseModelHandler {
  protected async processRequest({
    prompt,
    n,
    size,
    aspectRatio,
    providerOptions,
    headers,
    abortSignal,
  }: ImageModelV2CallOptions) {
    const warnings: ImageModelV2CallWarning[] = [];

    // Parse size or use aspect ratio to determine size
    let parsedSize = this.parseSize(size);
    if (!parsedSize && aspectRatio) {
      parsedSize = this.aspectRatioToSize(aspectRatio, 1024, warnings);
    }

    // Find the closest supported size
    let sizeStr = '1024x1024';
    if (parsedSize) {
      // Use the validateSizeOption method from BaseModelHandler
      parsedSize = this.validateSizeOption(
        parsedSize,
        SUPPORTED_SIZES,
        warnings,
      );
      sizeStr = `${parsedSize.width}x${parsedSize.height}`;
    }

    // Prepare request body
    const requestBody = {
      prompt,
      model: 'gpt-image-1',
      size: sizeStr,
      n: n || 1,
      ...(providerOptions.ai302 ?? {}),
    };

    // Extract response_format from providerOptions if available
    const responseFormat =
      (providerOptions.ai302 as any)?.response_format || 'url';

    // Remove response_format from the body if it exists
    if ((requestBody as any).response_format) {
      delete (requestBody as any).response_format;
    }

    // Construct URL with query parameter
    const baseUrl = this.config.url({
      modelId: this.modelId,
      path: '/v1/images/generations',
    });
    const url = `${baseUrl}?response_format=${responseFormat}`;

    // Make API request
    const { value: response, responseHeaders } =
      await postJsonToApi<GPTImageResponse>({
        url,
        headers: combineHeaders(this.config.headers(), headers),
        body: requestBody,
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    // Extract image URLs and download them
    const urls = response.data
      .map((img: { url?: string }) => img.url || '')
      .filter(Boolean);

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
