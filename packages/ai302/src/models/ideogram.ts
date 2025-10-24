import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import {
  IdeogramAspectRatioSchema,
  IdeogramResolutionSchema,
  type IdeogramResponse,
} from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

// Ref 1: https://developer.ideogram.ai/api-reference/api-reference/generate
export class IdeogramHandler extends BaseModelHandler {
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
        details: 'Ideogram does not support batch generation',
      });
    }

    const convertedAspectRatio = this.convertToIdeogramAspectRatio(aspectRatio);
    const convertedResolution = this.convertToIdeogramResolution(size);

    if (aspectRatio && !convertedAspectRatio) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details: `Unsupported aspect ratio: ${aspectRatio}. Supported values are: 1:1, 10:16, 16:10, 9:16, 16:9, 3:2, 2:3, 4:3, 3:4, 1:3, 3:1`,
      });
    }

    if (size && !convertedResolution) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details: `Unsupported resolution: ${size}. Please use one of the supported resolutions (e.g., '1024x1024', '768x1024', etc.)`,
      });
    }

    if (aspectRatio && size) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details: 'Cannot use both aspectRatio and size for ideogram model',
      });
    }

    const { value: response, responseHeaders } =
      await postJsonToApi<IdeogramResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: '/ideogram/generate',
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          image_request: {
            aspect_ratio: convertedAspectRatio,
            model: this.modelId.split('/')[1],
            prompt,
            resolution: convertedResolution,
            seed,
            ...(providerOptions.ai302 ?? {}),
          },
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

  protected convertToIdeogramAspectRatio(aspectRatio: string | undefined) {
    if (!aspectRatio) return undefined;
    const normalized = `ASPECT_${aspectRatio.replace(':', '_')}`;
    if (IdeogramAspectRatioSchema.safeParse(normalized).success) {
      return normalized;
    }
    return undefined;
  }

  protected convertToIdeogramResolution(size: string | undefined) {
    if (!size) return undefined;
    const normalized = `RESOLUTION_${size.replace('x', '_')}`;
    if (IdeogramResolutionSchema.safeParse(normalized).success) {
      return normalized;
    }
    return undefined;
  }
}

// Ref: https://developer.ideogram.ai/api-reference/api-reference/generate-v3
export class IdeogramV3Handler extends IdeogramHandler {
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
        details: 'Ideogram does not support batch generation',
      });
    }

    const convertedAspectRatio =
      this.convertToIdeogramV3AspectRatio(aspectRatio);
    const convertedResolution = this.convertToIdeogramV3Resolution(size);

    if (aspectRatio && !convertedAspectRatio) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details: `Unsupported aspect ratio: ${aspectRatio}. Supported values are: 1:1, 10:16, 16:10, 9:16, 16:9, 3:2, 2:3, 4:3, 3:4, 1:3, 3:1, 1:2, 2:1, 4:5, 5:4`,
      });
    }

    if (size && !convertedResolution) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details: `Unsupported resolution: ${size}. Please use one of the supported resolutions for v3 (e.g., '1024x1024', '768x1024', etc.)`,
      });
    }

    if (aspectRatio && size) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details: 'Cannot use both aspectRatio and size for ideogram model',
      });
    }

    // Get rendering_speed from model name instead of providerOptions
    let renderingSpeed;
    if (this.modelId.includes('_TURBO')) {
      renderingSpeed = 'TURBO';
    } else if (this.modelId.includes('_DEFAULT')) {
      renderingSpeed = 'DEFAULT';
    } else if (this.modelId.includes('_QUALITY')) {
      renderingSpeed = 'QUALITY';
    }

    const { value: response, responseHeaders } =
      await postJsonToApi<IdeogramResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: '/ideogram/v1/ideogram-v3/generate',
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          // No image_request wrapper for v3
          aspect_ratio: convertedAspectRatio,
          prompt,
          resolution: convertedResolution,
          seed,
          rendering_speed: renderingSpeed,
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

  // convert aspect ratio format for v3 API
  protected convertToIdeogramV3AspectRatio(aspectRatio: string | undefined) {
    if (!aspectRatio) return undefined;

    // Just convert from "1:1" format to "1x1" format
    return aspectRatio.replace(':', 'x');
  }

  // convert resolution format for v3 API
  protected convertToIdeogramV3Resolution(size: string | undefined) {
    if (!size) return undefined;

    // Return size as is since the v3 API uses the format "1024x1024" without the "RESOLUTION_" prefix
    return size;
  }
}
