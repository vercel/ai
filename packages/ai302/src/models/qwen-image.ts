import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postToApi } from '@ai-sdk/provider-utils';
import type { QwenImageResponse } from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

export class QwenImageHandler extends BaseModelHandler {
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
        details: 'Qwen Image does not support batch generation',
      });
    }

    if (size != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details: 'Qwen Image uses aspect_ratio instead of size parameter',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
        details: 'Qwen Image does not support seed parameter',
      });
    }

    // Use aspect ratio or default to 1:1
    const supportedRatios = ['1:1', '16:9', '9:16', '3:4', '4:3'] as const;
    const finalAspectRatio = this.findClosestAspectRatio(
      aspectRatio as `${number}:${number}` | undefined,
      supportedRatios,
      warnings,
    );

    // Create form data for multipart/form-data request
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('aspect_ratio', finalAspectRatio);

    // Add any additional options
    if (providerOptions.ai302) {
      Object.entries(providerOptions.ai302).forEach(([key, value]) => {
        if (value !== undefined && key !== 'prompt' && key !== 'aspect_ratio') {
          formData.append(key, String(value));
        }
      });
    }

    const { value: response, responseHeaders } =
      await postToApi<QwenImageResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: `/302/submit/${this.modelId}`,
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          content: formData,
          values: {
            prompt,
            aspect_ratio: finalAspectRatio,
          },
        },
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    // Check if generation was successful
    if (response.status !== 'succeeded' || !response.output) {
      throw new Error(
        `Qwen Image generation failed: ${response.error || 'Unknown error'}`,
      );
    }

    const urls = [response.output];
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
