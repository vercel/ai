import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import type { MinimaxResponse } from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

// Supported aspect ratios for Minimax
const SUPPORTED_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '4:3',
  '3:2',
  '2:3',
  '3:4',
  '9:16',
  '21:9',
] as const;

export class MinimaxHandler extends BaseModelHandler {
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
        details: 'Minimax does not support batch generation',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
        details: 'Minimax does not support seed parameter',
      });
    }

    if (size != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details: 'Minimax uses aspect_ratio instead of size',
      });
    }

    // Handle aspect ratio
    let validatedAspectRatio: `${number}:${number}` | undefined = undefined;
    if (aspectRatio) {
      const [width, height] = aspectRatio.split(':').map(Number);
      if (width && height) {
        validatedAspectRatio = `${width}:${height}` as `${number}:${number}`;

        // Check if the aspect ratio is in the supported list
        if (!SUPPORTED_ASPECT_RATIOS.includes(validatedAspectRatio as any)) {
          validatedAspectRatio = this.findClosestAspectRatio(
            validatedAspectRatio,
            SUPPORTED_ASPECT_RATIOS,
            warnings,
          );
        }
      }
    }

    const { value: response, responseHeaders } =
      await postJsonToApi<MinimaxResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: '/minimaxi/v1/image_generation',
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          model: 'minimaxi-image-01',
          prompt,
          aspect_ratio: validatedAspectRatio || '1:1', // Default to 1:1 if not specified
          response_format: 'url',
          ...(providerOptions.ai302 ?? {}),
        },
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    // Check for API errors
    if (response.base_resp.status_code !== 0) {
      throw new Error(`Minimax API error: ${response.base_resp.status_msg}`);
    }

    const urls = response.data.image_urls.filter(Boolean);
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
