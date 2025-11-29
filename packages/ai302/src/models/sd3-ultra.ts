import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postToApi } from '@ai-sdk/provider-utils';
import { statusCodeErrorResponseHandler } from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

const SUPPORTED_ASPECT_RATIOS = [
  '16:9',
  '1:1',
  '21:9',
  '2:3',
  '3:2',
  '4:5',
  '5:4',
  '9:16',
  '9:21',
] as const;

export class SD3UltraHandler extends BaseModelHandler {
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

    if (size != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'size' });
    }

    let parsedAspectRatio = this.findClosestAspectRatio(
      aspectRatio,
      SUPPORTED_ASPECT_RATIOS,
      warnings,
    );

    const requestHeaders = combineHeaders(this.config.headers(), headers, {
      Accept: 'image/*',
    });

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('aspect_ratio', parsedAspectRatio);

    for (const [key, value] of Object.entries(providerOptions)) {
      if (key.startsWith('302ai')) {
        formData.append(key, value.toString());
      }
    }

    if (seed) {
      formData.append('seed', seed.toString());
    }

    const { value: response, responseHeaders } = await postToApi<ArrayBuffer>({
      url: this.config.url({
        modelId: this.modelId,
        path: `/sd/v2beta/stable-image/generate/ultra`,
      }),
      headers: requestHeaders,
      body: {
        content: formData,
        values: {
          prompt,
          aspect_ratio: parsedAspectRatio,
          seed,
        },
      },
      failedResponseHandler: statusCodeErrorResponseHandler,
      successfulResponseHandler: async ({ response }) => {
        const arrayBuffer = await response.arrayBuffer();
        return { value: arrayBuffer };
      },
      abortSignal,
      fetch: this.config.fetch,
    });

    const base64 = Buffer.from(response).toString('base64');

    return {
      images: [base64],
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}
