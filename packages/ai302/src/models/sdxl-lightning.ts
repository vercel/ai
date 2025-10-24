import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import type { SDXLLightningResponse } from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';
import { modelToBackendConfig } from '../ai302-image-settings';

const SUPPORTED_SIZES = [
  '1024x1024',
  '1024x2048',
  '1536x1024',
  '1536x2048',
  '2048x1152',
  '1152x2048',
];

// Ref 1: https://302ai.apifox.cn/api-195966458
export class SDXLLightningHandler extends BaseModelHandler {
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
        details: 'SDXL Lightning does not support batch generation',
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
    const backendConfig = modelToBackendConfig[this.modelId];

    if (backendConfig?.supportsSize) {
      parsedSize = this.validateDimensionsMultipleOf32(
        parsedSize,
        warnings,
        256,
        1344,
      );
    }

    const { value: response, responseHeaders } =
      await postJsonToApi<SDXLLightningResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: '/302/submit/sdxl-lightning-v2',
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          prompt,
          image_size: parsedSize,
          width: parsedSize.width,
          height: parsedSize.height,
          format: 'jpeg',
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
