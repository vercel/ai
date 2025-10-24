import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import type { DallEResponse } from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

const SUPPORTED_SIZE_OPTIONS = ['256x256', '512x512', '1024x1024'];

export class DallEHandler extends BaseModelHandler {
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
        details: 'DALL-E 3 does not support batch generation',
      });
    }

    if (size != null && aspectRatio != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details: 'When size is provided, aspectRatio will be ignored',
      });
    } else if (size == null && aspectRatio != null) {
      warnings.push({
        type: 'other',
        message: 'Using size calculated from aspect ratio with base size 1024',
      });
    }

    if (seed != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'seed' });
    }

    let parsedSize = this.parseSize(size) ||
      this.aspectRatioToSize(aspectRatio, 1024, warnings) || {
        width: 1024,
        height: 1024,
      };

    parsedSize = this.validateSizeOption(
      parsedSize,
      SUPPORTED_SIZE_OPTIONS,
      warnings,
    );

    const { value: response, responseHeaders } =
      await postJsonToApi<DallEResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: '/v1/images/generations',
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          prompt,
          model: 'dall-e-3',
          size: `${parsedSize.width}x${parsedSize.height}`,
          ...(providerOptions.ai302 ?? {}),
        },
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    const urls = response.data.map(img => img.url).filter(Boolean);
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
