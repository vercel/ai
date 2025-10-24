import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postToApi } from '@ai-sdk/provider-utils';
import type { AuraflowResponse } from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

export class AuraflowHandler extends BaseModelHandler {
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
        details: 'AuraFlow does not support batch generation',
      });
    }

    if (size != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'size' });
    }

    if (aspectRatio != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'aspectRatio' });
    }

    if (seed != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'seed' });
    }

    if (providerOptions.ai302 != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'providerOptions',
      });
    }

    const formData = new FormData();
    formData.append('prompt', prompt);

    const { value: response, responseHeaders } =
      await postToApi<AuraflowResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: '/302/submit/aura-flow',
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          content: formData,
          values: { prompt },
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
