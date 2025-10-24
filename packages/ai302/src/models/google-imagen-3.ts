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

const SUPPORTED_ASPECT_RATIOS = ['1:1', '9:16', '16:9', '3:4', '4:3'] as const;

export class GoogleImagen3Handler extends BaseModelHandler {
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
        details: 'Google Imagen 3 does not support batch generation',
      });
    }

    if (size != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'size' });
    }

    if (seed != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'seed' });
    }

    let parsedAspectRatio = this.findClosestAspectRatio(
      aspectRatio,
      SUPPORTED_ASPECT_RATIOS,
      warnings,
    );

    const { value: response, responseHeaders } = await postJsonToApi<{
      output: string;
    }>({
      url: this.config.url({
        modelId: this.modelId,
        path: `/302/submit/${this.modelId}`,
      }),
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        prompt,
        aspect_ratio: parsedAspectRatio,
        ...(providerOptions.ai302 ?? {}),
      },
      failedResponseHandler: statusCodeErrorResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(),
      abortSignal,
      fetch: this.config.fetch,
    });

    const images = await this.downloadImages([response.output]);

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
