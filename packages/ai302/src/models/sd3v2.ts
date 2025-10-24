import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import { type SD3Response } from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

const SUPPORTED_SIZES = [
  '1024x1024',
  '1024x2048',
  '1536x1024',
  '1536x2048',
  '2048x1152',
  '1152x2048',
];

// Ref 1: https://302ai.apifox.cn/api-203322956
export class SD3V2Handler extends BaseModelHandler {
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
        details: 'SD3 Ultra does not support batch generation',
      });
    }

    let parsedSize = this.parseSize(size) ||
      this.aspectRatioToSize(aspectRatio, 1024, warnings) || {
        width: 1024,
        height: 1024,
      };

    parsedSize = this.validateSizeOption(parsedSize, SUPPORTED_SIZES, warnings);

    const { value: response, responseHeaders } =
      await postJsonToApi<SD3Response>({
        url: this.config.url({
          modelId: this.modelId,
          path: `/302/submit/stable-diffusion-3-v2`,
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          prompt,
          image_size: `${parsedSize.width}x${parsedSize.height}`,
          seed,
          ...(providerOptions.ai302 ?? {}),
        },
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    const urls = response.images.map(img => img.url).filter(Boolean);
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
