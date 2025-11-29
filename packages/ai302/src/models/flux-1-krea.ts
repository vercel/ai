import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import type { FluxKreaResponse } from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';
import { modelToBackendConfig } from '../ai302-image-settings';

export class FluxKreaHandler extends BaseModelHandler {
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
        details: 'Flux-1-Krea does not support batch generation',
      });
    }

    const backendConfig = modelToBackendConfig[this.modelId];
    if (backendConfig?.supportsSize) {
      if (size != null && aspectRatio != null) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'aspectRatio',
          details: 'When size is provided, aspectRatio will be ignored',
        });
      } else if (size == null && aspectRatio != null) {
        warnings.push({
          type: 'other',
          message:
            'Using size calculated from aspect ratio with base size 1024',
        });
      }
    }

    let parsedSize = this.parseSize(size) ||
      this.aspectRatioToSize(aspectRatio, 1024, warnings) || {
        width: 1024,
        height: 1024,
      };

    if (backendConfig?.supportsSize) {
      parsedSize = this.validateDimensionsMultipleOf32(
        parsedSize,
        warnings,
        256,
        1440,
      );
    }

    const { value: response, responseHeaders } =
      await postJsonToApi<FluxKreaResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: `/302/submit/${this.modelId}`,
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          prompt,
          image_size: backendConfig?.supportsSize
            ? { width: parsedSize.width, height: parsedSize.height }
            : undefined,
          num_inference_steps: providerOptions.ai302?.num_inference_steps,
          guidance_scale: providerOptions.ai302?.guidance_scale,
          seed,
          ...(providerOptions.ai302 ?? {}),
        },
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    const urls = response.images
      .map(img => img.url)
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
}
