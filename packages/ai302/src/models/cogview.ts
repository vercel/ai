import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import type { CogViewResponse } from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

// Supported sizes for CogView-4
const SUPPORTED_SIZE_OPTIONS = [
  '1024x1024',
  '768x1344',
  '864x1152',
  '1344x768',
  '1152x864',
  '1440x720',
  '720x1440',
];

export class CogViewHandler extends BaseModelHandler {
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
        details: 'CogView-4 does not support batch generation',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
        details: 'CogView-4 does not support seed parameter',
      });
    }

    // Handle size selection
    let sizeString: string | undefined;

    // First try to parse the size parameter
    if (size) {
      const parsedSize = this.parseSize(size);
      if (parsedSize) {
        const validatedSize = this.validateSizeOption(
          parsedSize,
          SUPPORTED_SIZE_OPTIONS,
          warnings,
        );
        sizeString = `${validatedSize.width}x${validatedSize.height}`;
      }
    }
    // If no size, try to use aspect ratio
    else if (aspectRatio) {
      const parsedSize = this.aspectRatioToSize(aspectRatio, 1024, warnings);
      if (parsedSize) {
        const validatedSize = this.validateSizeOption(
          parsedSize,
          SUPPORTED_SIZE_OPTIONS,
          warnings,
        );
        sizeString = `${validatedSize.width}x${validatedSize.height}`;
      }
    }

    // Determine which model variant to use
    const modelVariant =
      this.modelId === 'cogview-4-250304' ? 'cogview-4-250304' : 'cogview-4';

    const { value: response, responseHeaders } =
      await postJsonToApi<CogViewResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: '/bigmodel/api/paas/v4/images/generations',
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          model: modelVariant,
          prompt,
          size: sizeString,
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
